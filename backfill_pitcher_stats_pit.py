"""
backfill_pitcher_stats_pit.py
------------------------------
Generates point-in-time (PIT) corrected stats for all historical games
stored in mlb_database.json.

Produces three output files:
  - pitcher_stats_pit.json    : PIT pitcher seasonal stats per game (era/whip/
                                kPct/bbPct/wins/losses/ip/strikeouts/gs/
                                ipAvgPerStart, y desde sept. 2026 también
                                spinRate/oSwingPct — ver sección STATCAST más
                                abajo)
  - offense_stats_pit.json    : PIT team offense stats per game
  - boxscore_game_stats.json  : Real pitcher stats from finished game boxscores
                                (IP, BF, Hits, ER, K, BB, Pitches, HR)

Usage:
  python backfill_pitcher_stats_pit.py
  python backfill_pitcher_stats_pit.py --sample 20       # test with 20 games
  python backfill_pitcher_stats_pit.py --game_id 823442  # single game
  python backfill_pitcher_stats_pit.py --from_date 2026-05-01  # games from date
  python backfill_pitcher_stats_pit.py --reverify        # recompute existing
                                                          # entries too (ver
                                                          # --help); necesario
                                                          # para que juegos ya
                                                          # procesados reciban
                                                          # spinRate/oSwingPct
"""

import json
import time
import argparse
import sys
import os
import math
from datetime import datetime, timedelta
from pathlib import Path
import requests

# ─────────────────────────────────────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────────────────────────────────────

MLB_API_BASE = "https://statsapi.mlb.com/api/v1"
DB_PATH = Path(__file__).parent / "mlb_database.json"
GAMES_DB_DIR = Path(__file__).parent / "games_db"
GAMES_INDEX_PATH = GAMES_DB_DIR / "_index.json"
OUTPUT_PITCHER = Path(__file__).parent / "pitcher_stats_pit.json"
OUTPUT_OFFENSE = Path(__file__).parent / "offense_stats_pit.json"
OUTPUT_BOXSCORE = Path(__file__).parent / "boxscore_game_stats.json"
RATE_LIMIT_DELAY = 0.25   # seconds between API calls
REQUEST_TIMEOUT = 15       # seconds

# Criterio único de "juego terminado" (Fase 2, punto 1 del plan de mejora).
# Python no puede importar el módulo TS, así que esta lógica debe reflejar
# exactamente src/utils/gameStatus.ts::isFinalGameStatus — si cambias una,
# cambia la otra. Antes esta constante hacía match EXACTO contra un set fijo,
# lo cual no cubría variantes que la API de MLB devuelve como "Final: Tied" o
# "Completed Early: Rain"; is_final() ahora usa el mismo criterio "final" como
# substring que ya usaba isFinalGameStatus en server.ts.
#
# Fase 4, punto 6: el match exacto contra este set en realidad SEGUÍA sin
# capturar "Completed Early: Rain" (con motivo incluido) porque
# "completed early" solo hacía match exacto, no substring — el mismo bug que
# tenía isFinalGameStatus en TS hasta que las pruebas nuevas (gameStatus.test.ts)
# lo encontraron comparando contra el propio ejemplo de este comentario.
# is_final() ahora también trata "completed early" como substring.
FINAL_STATUSES = {"game over", "completed"}

SESSION = requests.Session()
SESSION.headers.update({
    "Accept": "application/json",
    "User-Agent": "MLBDATAENGINE-Backfill/1.0"
})

# ─────────────────────────────────────────────────────────────────────────────
# IN-MEMORY CACHES
# ─────────────────────────────────────────────────────────────────────────────

pitcher_gamelog_cache: dict = {}   # {f"{pitcherId}_{season}": [split, ...]}
team_offense_cache:    dict = {}   # {f"team_{teamId}_{endDate}": stats_dict}
boxscore_cache:        dict = {}   # {gamePk: {home: {...}, away: {...}}}


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def api_get(url: str, retries: int = 3) -> dict | None:
    for attempt in range(retries):
        try:
            r = SESSION.get(url, timeout=REQUEST_TIMEOUT)
            r.raise_for_status()
            return r.json()
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(1 + attempt)
            else:
                print(f"  [WARN] API error {url}: {e}")
                return None


def ip_to_thirds(ip_str) -> int:
    """Convert MLB IP string ('6.1') to integer thirds (6*3+1=19)."""
    if not ip_str:
        return 0
    parts = str(ip_str).split(".")
    full   = int(parts[0]) if parts[0] else 0
    thirds = int(parts[1]) if len(parts) > 1 and parts[1] else 0
    return full * 3 + thirds


def thirds_to_ip_string(thirds: int) -> str:
    full = thirds // 3
    rem  = thirds % 3
    return f"{full}.{rem}"


def is_final(status: str | None) -> bool:
    normalized = str(status or "").strip().lower()
    return "final" in normalized or "completed early" in normalized or normalized in FINAL_STATUSES


def safe_int(val, default=0) -> int:
    try:
        return int(val)
    except (TypeError, ValueError):
        return default


def safe_float(val, decimals=3) -> float | None:
    try:
        parsed = float(val)
        return round(parsed, decimals) if parsed == parsed else None  # NaN check
    except (TypeError, ValueError):
        return None


# ─────────────────────────────────────────────────────────────────────────────
# PITCHER POINT-IN-TIME
# ─────────────────────────────────────────────────────────────────────────────

def fetch_pitcher_gamelogs(pitcher_id: int, season: int) -> list:
    key = f"{pitcher_id}_{season}"
    if key in pitcher_gamelog_cache:
        return pitcher_gamelog_cache[key]

    url = f"{MLB_API_BASE}/people/{pitcher_id}/stats?stats=gameLog&season={season}&group=pitching&sportId=1"
    data = api_get(url)
    splits = data["stats"][0]["splits"] if data and data.get("stats") else []
    pitcher_gamelog_cache[key] = splits
    time.sleep(RATE_LIMIT_DELAY)
    return splits


def get_pitcher_stats_up_to_date(pitcher_id: int, target_date: str, season: int) -> dict:
    """Accumulate pitcher stats for all starts BEFORE target_date."""
    splits = fetch_pitcher_gamelogs(pitcher_id, season)

    prior = [
        s for s in splits
        if (s.get("date") or s.get("game", {}).get("gameDate", "")[:10]) < target_date
    ]

    if not prior:
        return {"gs": 0, "ip": "0.0", "totalStrikeouts": 0, "wins": 0, "losses": 0,
                "era": None, "whip": None, "kPct": None, "bbPct": None,
                "ipAvgPerStart": None, "gameCount": 0}

    total_gs = total_ip = total_k = total_w = total_l = 0
    total_er = total_hits = total_bb = total_bf = 0

    for s in prior:
        st = s.get("stat", {})
        if safe_int(st.get("gamesStarted")) >= 1:
            total_gs += 1
        total_ip   += ip_to_thirds(st.get("inningsPitched"))
        total_k    += safe_int(st.get("strikeOuts"))
        total_w    += safe_int(st.get("wins"))
        total_l    += safe_int(st.get("losses"))
        total_er   += safe_int(st.get("earnedRuns"))
        total_hits += safe_int(st.get("hits"))
        total_bb   += safe_int(st.get("baseOnBalls"))
        total_bf   += safe_int(st.get("battersFaced"))

    ip_decimal = total_ip / 3
    era   = round((total_er / ip_decimal) * 9, 2) if ip_decimal > 0 else None
    whip  = round((total_hits + total_bb) / ip_decimal, 3) if ip_decimal > 0 else None
    kpct  = round((total_k / total_bf) * 100, 1) if total_bf > 0 else None
    bbpct = round((total_bb / total_bf) * 100, 1) if total_bf > 0 else None
    ip_avg = thirds_to_ip_string(round(total_ip / total_gs)) if total_gs > 0 else None

    return {
        "gs": total_gs,
        "ip": thirds_to_ip_string(total_ip),
        # Sept. 2026: era "strikeouts" — la clave real que usa el resto del
        # proyecto (las otras 926 entradas ya guardadas, generate_pit.ts /
        # mlbGameLogExtractor.ts, y PitStatsEntry en utils.ts) es
        # "totalStrikeouts". Con la clave equivocada el dato no se perdía,
        # pero la columna home/away_pitcher_strikeouts del CSV quedaba vacía
        # para cualquier juego que este script llegara a procesar (detectado
        # en la prueba con --game_id antes de correr el --reverify completo).
        "totalStrikeouts": total_k,
        "wins": total_w,
        "losses": total_l,
        "era": era,
        "whip": whip,
        "kPct": kpct,
        "bbPct": bbpct,
        "ipAvgPerStart": ip_avg,
        "gameCount": len(prior)
    }


# ─────────────────────────────────────────────────────────────────────────────
# PITCHER STATCAST POINT-IN-TIME (spin_rate, o_swing_pct / chase%)
# ─────────────────────────────────────────────────────────────────────────────
#
# Pedido explícito del usuario (sept. 2026): las columnas home/away_pitcher_
# spin_rate y home/away_pitcher_o_swing_pct del dataset venían vacías porque
# su única fuente era SavantCache (src/etl/extractors/savantScraper.ts), que
# descarga los leaderboards de Baseball Savant UNA VEZ POR TEMPORADA sin
# ningún recorte de fecha — exactamente la misma fuga de "temporada completa
# hasta hoy" que ya se había corregido para era/whip/kPct/etc. (ver auditoría
# del pipeline, memoria /areas/pipeline-mlb-auditoria.md).
#
# En vez de seguir sirviendo ese valor con fuga, estas dos columnas se
# calculan acá con el mismo patrón que get_pitcher_stats_up_to_date: se
# descarga el detalle de pitcheos Statcast del lanzador UNA VEZ por
# temporada (statcast_pitcher — ya es dependencia del proyecto vía
# pybaseball, ver requirements.txt), se cachea en memoria, y se filtra a los
# pitcheos ANTERIORES a la fecha del juego en cada llamada — sin volver a
# pegarle a la red por cada juego del mismo lanzador.
#
# El resto de columnas Savant de ese mismo bloque del CSV (stuff_plus, xera,
# xwoba, hardhit%, barrel%, etc.) siguen viniendo del snapshot de temporada
# completa sin corregir — quedó fuera de alcance de este cambio a pedido
# explícito del usuario (stuff_plus en particular ni siquiera existe todavía
# como métrica real: siempre es None/null en todo el pipeline).

try:
    from pybaseball import statcast_pitcher
    PYBASEBALL_AVAILABLE = True
except Exception as _pybaseball_import_err:
    print(f"[WARN] pybaseball no disponible ({_pybaseball_import_err}); "
          f"spinRate/oSwingPct quedarán vacíos para todos los juegos.")
    PYBASEBALL_AVAILABLE = False

# Mismas definiciones que src/etl/extractors/pybaseball_scraper.py
# (get_pitcher_advanced_metrics) — si se actualiza una, actualizar la otra.
OUT_OF_ZONE = {11, 12, 13, 14}
SWING_DESCRIPTIONS = {
    "swinging_strike", "swinging_strike_blocked", "foul",
    "hit_into_play", "foul_tip", "foul_bunt", "missed_bunt",
}

pitcher_statcast_cache: dict = {}   # {f"{pitcherId}_{season}": [row, ...]}


def _is_nan(val) -> bool:
    return isinstance(val, float) and math.isnan(val)


def fetch_pitcher_statcast_rows(pitcher_id: int, season: int) -> list:
    """Descarga (una vez por temporada, cacheado en memoria) los pitcheos
    Statcast del lanzador con las columnas necesarias para spin_rate y
    o_swing_pct. Devuelve [] si pybaseball no está disponible o la descarga
    falla — nunca lanza, para no tumbar el resto del backfill."""
    if not PYBASEBALL_AVAILABLE:
        return []

    key = f"{pitcher_id}_{season}"
    if key in pitcher_statcast_cache:
        return pitcher_statcast_cache[key]

    rows = []
    try:
        df = statcast_pitcher(f"{season}-03-01", f"{season}-11-30", pitcher_id)
        if df is not None and not df.empty:
            cols = [c for c in ("game_date", "release_spin_rate", "zone", "description")
                    if c in df.columns]
            rows = df[cols].to_dict("records")
    except Exception as e:
        print(f"  [WARN] pybaseball statcast_pitcher falló para pitcher {pitcher_id}/{season}: {e}")
        rows = []

    pitcher_statcast_cache[key] = rows
    time.sleep(RATE_LIMIT_DELAY)
    return rows


def get_pitcher_statcast_up_to_date(pitcher_id: int, target_date: str, season: int) -> dict:
    """spin_rate promedio y o_swing_pct (chase%) usando solo pitcheos
    ANTERIORES a target_date — análogo point-in-time de
    get_pitcher_stats_up_to_date, pero a nivel de pitcheo individual en vez
    de gamelog por juego."""
    rows = fetch_pitcher_statcast_rows(pitcher_id, season)
    prior = [r for r in rows if str(r.get("game_date", ""))[:10] < target_date]

    if not prior:
        return {"spinRate": None, "oSwingPct": None}

    spins = [
        r["release_spin_rate"] for r in prior
        if r.get("release_spin_rate") is not None and not _is_nan(r["release_spin_rate"])
    ]
    spin_rate = round(sum(spins) / len(spins), 1) if spins else None

    chase_opps = 0
    chase_swings = 0
    for r in prior:
        zone = r.get("zone")
        if zone is None or _is_nan(zone):
            continue
        if int(zone) not in OUT_OF_ZONE:
            continue
        chase_opps += 1
        if r.get("description") in SWING_DESCRIPTIONS:
            chase_swings += 1
    o_swing_pct = round((chase_swings / chase_opps) * 100, 1) if chase_opps > 0 else None

    return {"spinRate": spin_rate, "oSwingPct": o_swing_pct}


# ─────────────────────────────────────────────────────────────────────────────
# TEAM OFFENSE POINT-IN-TIME
# ─────────────────────────────────────────────────────────────────────────────
#
# Sept. 2026: mlb_database.json no guarda ningún ID de equipo — "teams" y
# "metadata.homeTeam/awayTeam" solo traen el nombre completo (ej. "Tampa Bay
# Rays"), pero get_team_offense_up_to_date necesita el ID numérico de la API
# de MLB para pedir stats=byDateRange. Sin este mapeo, home_team_id/
# away_team_id siempre daban None y offense_stats_pit.json quedaba vacío.
#
# IDs oficiales de la API de MLB (estables — no cambian aunque una franquicia
# se mude/remarque; ej. Cleveland sigue siendo 114 desde "Indians", Athletics
# sigue siendo 133 aunque haya dejado de decir "Oakland"). Mismos nombres
# completos que ya usa el resto del proyecto en
# src/utils/teamLogos.ts::getTeamAbbr. Match por substring en minúsculas
# (como getTeamLogo/getTeamColor en ese mismo archivo) en vez de exacto, para
# no romperse si algún registro guardó "Athletics" en vez de "Oakland
# Athletics" u otra variante menor del nombre.
TEAM_NAME_SUBSTR_TO_ID = [
    ("diamondbacks", 109),
    ("braves", 144),
    ("orioles", 110),
    ("red sox", 111),
    ("white sox", 145),
    ("cubs", 112),
    ("reds", 113),
    ("guardians", 114),
    ("rockies", 115),
    ("tigers", 116),
    ("astros", 117),
    ("royals", 118),
    ("angels", 108),
    ("dodgers", 119),
    ("marlins", 146),
    ("brewers", 158),
    ("twins", 142),
    ("mets", 121),
    ("yankees", 147),
    ("athletics", 133),
    ("phillies", 143),
    ("pirates", 134),
    ("padres", 135),
    ("giants", 137),
    ("mariners", 136),
    ("cardinals", 138),
    ("rays", 139),
    ("rangers", 140),
    ("blue jays", 141),
    ("nationals", 120),
]


def get_team_id_by_name(team_name: str | None) -> int | None:
    if not team_name:
        return None
    name = team_name.strip().lower()
    for substr, team_id in TEAM_NAME_SUBSTR_TO_ID:
        if substr in name:
            return team_id
    return None


def get_team_offense_up_to_date(team_id: int, target_date: str, season: int) -> dict | None:
    season_start = f"{season}-03-15"
    end_dt = datetime.strptime(target_date, "%Y-%m-%d") - timedelta(days=1)
    end_date = end_dt.strftime("%Y-%m-%d")

    if end_date < season_start:
        return None

    key = f"team_{team_id}_{end_date}"
    if key in team_offense_cache:
        return team_offense_cache[key]

    url = (f"{MLB_API_BASE}/teams/{team_id}/stats?"
           f"stats=byDateRange&group=hitting"
           f"&startDate={season_start}&endDate={end_date}"
           f"&season={season}&sportId=1")
    data = api_get(url)
    time.sleep(RATE_LIMIT_DELAY)

    if not data:
        team_offense_cache[key] = None
        return None

    splits = (data.get("stats") or [{}])[0].get("splits", [])
    if not splits:
        team_offense_cache[key] = None
        return None

    st = splits[0].get("stat", {})
    games = safe_int(st.get("gamesPlayed")) or 1
    runs  = safe_int(st.get("runs"))
    avg_v = safe_float(st.get("avg"))
    slg_v = safe_float(st.get("slg"))
    k_n   = safe_int(st.get("strikeOuts"))
    pa_n  = safe_int(st.get("plateAppearances"))

    result = {
        "avg": avg_v,
        "obp": safe_float(st.get("obp")),
        "slg": slg_v,
        "ops": safe_float(st.get("ops")),
        "runsPerGame": round(runs / games, 2),
        "kPct": round((k_n / pa_n) * 100, 1) if pa_n > 0 else None,
        "iso": round(slg_v - avg_v, 3) if avg_v is not None and slg_v is not None else None,
    }
    team_offense_cache[key] = result
    return result


# ─────────────────────────────────────────────────────────────────────────────
# BOXSCORE — real game stats for finished games
# ─────────────────────────────────────────────────────────────────────────────

def calc_game_score(ip, k, bb, hits, er, hr) -> int | None:
    """Bill James Game Score formula."""
    if None in (ip, k, bb, hits, er, hr):
        return None
    try:
        parts = str(ip).split(".")
        outs = int(parts[0]) * 3 + int(parts[1] if len(parts) > 1 else 0)
        score = 50 + (3 * outs) + k - (2 * hits) - (4 * er) - (2 * bb) - hr
        return round(score)
    except Exception:
        return None


def extract_starter(team_data: dict, players: dict) -> dict | None:
    pitcher_ids = team_data.get("pitchers", [])
    if not pitcher_ids:
        return None
    starter_id = pitcher_ids[0]
    player = players.get(f"ID{starter_id}")
    if not player:
        return None

    st    = player.get("stats", {}).get("pitching", {})
    ip    = st.get("inningsPitched")
    hits  = safe_int(st.get("hits"))
    runs  = safe_int(st.get("runs"))
    er    = safe_int(st.get("earnedRuns"))
    k     = safe_int(st.get("strikeOuts"))
    bb    = safe_int(st.get("baseOnBalls"))
    pit   = safe_int(st.get("numberOfPitches"))
    hr    = safe_int(st.get("homeRuns"))
    bf    = safe_int(st.get("battersFaced"))

    return {
        "playerId":       starter_id,
        "name":           player.get("person", {}).get("fullName"),
        "inningsPitched": ip,
        "battersFaced":   bf,
        "hitsAllowed":    hits,
        "runsAllowed":    runs,
        "earnedRuns":     er,
        "strikeOuts":     k,    # ← feeds home_pitcher_actual_ks
        "baseOnBalls":    bb,
        "numberOfPitches": pit,
        "homeRunsAllowed": hr,
        "gameScore":      calc_game_score(ip, k, bb, hits, er, hr),
    }


def get_boxscore_stats(game_pk: str | int) -> dict:
    key = str(game_pk)
    if key in boxscore_cache:
        return boxscore_cache[key]

    url = f"{MLB_API_BASE}/game/{game_pk}/boxscore"
    data = api_get(url)
    time.sleep(RATE_LIMIT_DELAY)

    if not data:
        result = {"home": None, "away": None}
        boxscore_cache[key] = result
        return result

    home_data = data.get("teams", {}).get("home", {})
    away_data = data.get("teams", {}).get("away", {})
    home_players = home_data.get("players", {})
    away_players = away_data.get("players", {})

    result = {
        "home": extract_starter(home_data, home_players),
        "away": extract_starter(away_data, away_players),
    }
    boxscore_cache[key] = result
    return result


# ─────────────────────────────────────────────────────────────────────────────
# MAIN BACKFILL LOGIC
# ─────────────────────────────────────────────────────────────────────────────

def get_nested(d: dict, *keys, default=None):
    for k in keys:
        if not isinstance(d, dict):
            return default
        d = d.get(k, None)
        if d is None:
            return default
    return d


def load_existing(path: Path, wrap_key: str | None = None) -> dict:
    """Carga un output existente. `wrap_key` desenvuelve el formato real que
    usan pitcher_stats_pit.json / offense_stats_pit.json / boxscore_game_stats.json
    en producción — {"pitchers": {gameId: {...}}} en vez de un dict plano — que
    es exactamente lo que espera readPitLookups() en server.ts
    (`parsed.pitchers || parsed`). Sept. 2026: antes esta función devolvía el
    dict tal cual venía en el archivo SIN desenvolver, así que contra el
    pitcher_stats_pit.json real (envuelto) esto cargaba un dict de UN solo
    elemento (la clave "pitchers" completa como si fuera un gameId más) en vez
    de los 927 juegos reales que había adentro — el bug que hizo que
    --reverify pareciera "no encontrar nada para diffear" sin tocar los datos
    reales (que quedaron intactos de pura casualidad)."""
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            try:
                data = json.load(f)
            except Exception:
                return {}
        if wrap_key and isinstance(data, dict) and isinstance(data.get(wrap_key), dict):
            return data[wrap_key]
        return data if isinstance(data, dict) else {}
    return {}


def save_json(path: Path, data: dict, wrap_key: str | None = None):
    """Guarda `data`. `wrap_key` envuelve la salida bajo esa clave para que
    coincida con el formato real que ya usan estos tres archivos en
    producción (ver load_existing) — server.ts los lee con
    `parsed.<wrap_key> || parsed`, así que escribir envuelto es lo correcto
    y consistente con lo que ya existe en disco."""
    payload = {wrap_key: data} if wrap_key else data
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print(f"  Saved → {path} ({len(data)} entries)")


def load_games_db() -> dict:
    """Carga la base de juegos como {fecha: [juego, juego, ...]}, igual que
    antes devolvía `json.load(open(mlb_database.json))`.

    Sept. 2026 — arreglo de fondo de memoria en server.ts (ver comentario junto
    a DB_PATH ahí): el archivo único `mlb_database.json` (~213MB) se reemplazó
    por `games_db/` (un JSON chico por fecha + `_index.json` con conteos e
    IDs). Este script es un proceso Python aparte que nunca pasa por el Proxy
    de server.ts — leía `mlb_database.json` directo con `open()`, así que tras
    la migración ese archivo ya no está (queda renombrado a
    `mlb_database.json.migrated`) y el script fallaba con FileNotFoundError en
    cada corrida del pipeline diario. Ahora reconstruye el mismo dict
    {fecha: [juegos]} leyendo `games_db/_index.json` + un archivo por fecha —
    el resto de run_backfill (que ya viene iterando sobre esa forma) no
    necesita ningún otro cambio. Se mantiene un fallback al `mlb_database.json`
    legado por si este script corre suelto (sin haber arrancado nunca el
    server, que es quien dispara la migración) contra una copia vieja.
    """
    if GAMES_INDEX_PATH.exists():
        with open(GAMES_INDEX_PATH, "r", encoding="utf-8") as f:
            index = json.load(f)
        games_by_date: dict = {}
        for date, entry in (index or {}).items():
            count = entry.get("count", 0) if isinstance(entry, dict) else 0
            if not count:
                games_by_date[date] = []
                continue
            date_file = GAMES_DB_DIR / f"{date}.json"
            if not date_file.exists():
                games_by_date[date] = []
                continue
            with open(date_file, "r", encoding="utf-8") as f:
                games = json.load(f)
            games_by_date[date] = games if isinstance(games, list) else []
        return games_by_date

    if DB_PATH.exists():
        print(f"[Aviso] games_db/_index.json no existe todavía; usando el formato legado en {DB_PATH}.")
        with open(DB_PATH, "r", encoding="utf-8") as f:
            db = json.load(f)
        return db if isinstance(db, dict) else {}

    print(f"[Aviso] No se encontró ni games_db/_index.json ni {DB_PATH}; se continúa con la base vacía.")
    return {}


def run_backfill(args):
    print(f"Loading database from {GAMES_INDEX_PATH if GAMES_INDEX_PATH.exists() else DB_PATH}...")
    db = load_games_db()

    # Sept. 2026: mlb_database.json (y ahora games_db/) es {fecha: [juego,
    # juego, ...]} — NO un dict plano {gameId: juego}. Esto llevaba tiempo roto
    # sin que nadie lo notara porque el Cron Job que corre este script nunca se
    # activó en Render (ver RENDER_CRON_SETUP.md); esta fue la primera corrida
    # real contra la base de datos actual. Antes `games.items()` iteraba
    # (fecha, [lista de juegos]) como si fuera (gameId, juego) — cada
    # "juego" era en realidad una lista, así que get_nested(juego, "metadata",
    # "date") fallaba siempre y el juego se saltaba silenciosamente. Con la
    # base de datos real esto hacía que el script no procesara NINGÚN juego
    # de verdad (ver auditoría de esta sesión — 0 juegos afectados, datos
    # existentes intactos de pura casualidad).
    games_by_date: dict = db if isinstance(db, dict) else {}
    game_list = []
    for _date_key, _games_for_date in games_by_date.items():
        if not isinstance(_games_for_date, list):
            continue
        for _game in _games_for_date:
            if not isinstance(_game, dict):
                continue
            _gid = _game.get("id")
            if _gid is None:
                continue
            game_list.append((str(_gid), _game))

    # Filters
    if args.game_id:
        game_list = [(gid, g) for gid, g in game_list if gid == str(args.game_id)]
    if args.from_date:
        game_list = [(gid, g) for gid, g in game_list
                     if get_nested(g, "metadata", "date", default="") >= args.from_date]
    if args.sample:
        game_list = game_list[:args.sample]

    # Sort by date for cleaner API calls
    game_list.sort(key=lambda x: get_nested(x[1], "metadata", "date", default=""))

    total = len(game_list)
    reverify = bool(getattr(args, "reverify", False))
    print(f"Processing {total} games...{' (REVERIFY MODE: recomputing + diffing existing entries)' if reverify else ''}\n")

    # Load existing outputs so we can resume interrupted runs
    pitcher_out  = load_existing(OUTPUT_PITCHER, wrap_key="pitchers")
    offense_out  = load_existing(OUTPUT_OFFENSE, wrap_key="offense")
    boxscore_out = load_existing(OUTPUT_BOXSCORE, wrap_key="boxscore")

    reverify_diffs = []  # (game_id, field, old_value, new_value) — only populated in --reverify mode

    for idx, (game_id, game) in enumerate(game_list, 1):
        date   = get_nested(game, "metadata", "date")
        status = get_nested(game, "game_result", "gameStatus", default="")
        home_team = get_nested(game, "metadata", "homeTeam") or get_nested(game, "metadata", "home_team")
        away_team = get_nested(game, "metadata", "awayTeam") or get_nested(game, "metadata", "away_team")

        if not date:
            continue

        season = int(date[:4])

        # IDs from both possible schema locations. Sept. 2026: el campo real
        # en pitchers.home/away es "pitcherId" (confirmado contra un juego
        # real de mlb_database.json), no "id" — ese era el segundo bug que
        # hacía que el backfill nunca encontrara al lanzador aunque se
        # arreglara la iteración de arriba. Se dejan los "id"/"home_starter"
        # como fallback por si algún registro viejo usa esa forma.
        home_pitcher_id = (
            get_nested(game, "pitchers", "home", "pitcherId") or
            get_nested(game, "pitchers", "home", "id") or
            get_nested(game, "pitchers", "home_starter", "id")
        )
        away_pitcher_id = (
            get_nested(game, "pitchers", "away", "pitcherId") or
            get_nested(game, "pitchers", "away", "id") or
            get_nested(game, "pitchers", "away_starter", "id")
        )
        # home/away_team_id: mlb_database.json no guarda ID de equipo, solo el
        # nombre — se resuelve vía TEAM_NAME_SUBSTR_TO_ID (ver sección TEAM
        # OFFENSE POINT-IN-TIME arriba). Se intenta primero un campo *TeamId
        # explícito por si algún registro sí lo trae, y se cae al nombre si no.
        home_team_id = get_nested(game, "metadata", "homeTeamId") or get_team_id_by_name(home_team)
        away_team_id = get_nested(game, "metadata", "awayTeamId") or get_team_id_by_name(away_team)

        print(f"[{idx}/{total}] {game_id} | {date} | {home_team} vs {away_team} | {status}")

        # ── Pitcher PIT stats ──
        if game_id not in pitcher_out or reverify:
            home_pit = get_pitcher_stats_up_to_date(home_pitcher_id, date, season) if home_pitcher_id else None
            away_pit = get_pitcher_stats_up_to_date(away_pitcher_id, date, season) if away_pitcher_id else None
            # spinRate/oSwingPct point-in-time (ver sección STATCAST arriba) —
            # se agregan al mismo dict de PIT del lanzador, junto a era/whip/etc.
            if home_pit is not None and home_pitcher_id:
                home_pit.update(get_pitcher_statcast_up_to_date(home_pitcher_id, date, season))
            if away_pit is not None and away_pitcher_id:
                away_pit.update(get_pitcher_statcast_up_to_date(away_pitcher_id, date, season))
            new_val = {"home": home_pit, "away": away_pit}
            if reverify and game_id in pitcher_out and pitcher_out[game_id] != new_val:
                reverify_diffs.append((game_id, "pitcher", pitcher_out[game_id], new_val))
                print(f"  [REVERIFY-DIFF] pitcher PIT changed: {pitcher_out[game_id]} -> {new_val}")
            pitcher_out[game_id] = new_val
        else:
            print(f"  [SKIP] pitcher PIT already exists")

        # ── Team offense PIT stats ──
        if game_id not in offense_out or reverify:
            home_off = get_team_offense_up_to_date(home_team_id, date, season) if home_team_id else None
            away_off = get_team_offense_up_to_date(away_team_id, date, season) if away_team_id else None
            new_val = {"home": home_off, "away": away_off}
            if reverify and game_id in offense_out and offense_out[game_id] != new_val:
                reverify_diffs.append((game_id, "offense", offense_out[game_id], new_val))
                print(f"  [REVERIFY-DIFF] offense PIT changed: {offense_out[game_id]} -> {new_val}")
            offense_out[game_id] = new_val
        else:
            print(f"  [SKIP] offense PIT already exists")

        # ── Boxscore stats (only for finished games) ──
        if game_id not in boxscore_out and is_final(status):
            bs = get_boxscore_stats(game_id)
            boxscore_out[game_id] = bs
            if bs["home"]:
                print(f"  Boxscore → Home: {bs['home']['name']} | "
                      f"IP={bs['home']['inningsPitched']} K={bs['home']['strikeOuts']} "
                      f"BF={bs['home']['battersFaced']}")
            if bs["away"]:
                print(f"  Boxscore → Away: {bs['away']['name']} | "
                      f"IP={bs['away']['inningsPitched']} K={bs['away']['strikeOuts']} "
                      f"BF={bs['away']['battersFaced']}")
        elif not is_final(status):
            print(f"  [SKIP] boxscore — game not final ({status})")

        # Save every 50 games to avoid data loss on interruption
        if idx % 50 == 0:
            save_json(OUTPUT_PITCHER, pitcher_out, wrap_key="pitchers")
            save_json(OUTPUT_OFFENSE, offense_out, wrap_key="offense")
            save_json(OUTPUT_BOXSCORE, boxscore_out, wrap_key="boxscore")
            print(f"  --- Checkpoint at game {idx} ---\n")

    # Final save
    save_json(OUTPUT_PITCHER, pitcher_out, wrap_key="pitchers")
    save_json(OUTPUT_OFFENSE, offense_out, wrap_key="offense")
    save_json(OUTPUT_BOXSCORE, boxscore_out, wrap_key="boxscore")
    print(f"\nDone! Processed {total} games.")

    if reverify:
        diff_path = Path("reverify_diffs.json")
        save_json(diff_path, {
            "generated_at": __import__("datetime").datetime.now().isoformat(),
            "games_processed": total,
            "diffs_found": len(reverify_diffs),
            "diffs": [
                {"game_id": gid, "field": field, "old": old, "new": new}
                for gid, field, old, new in reverify_diffs
            ],
        })
        print(f"\n[REVERIFY] {len(reverify_diffs)} entries differed from what was already on disk.")
        print(f"[REVERIFY] Full diff report written to {diff_path}")


# ─────────────────────────────────────────────────────────────────────────────
# ENTRY POINT
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Backfill point-in-time pitcher and offense stats")
    parser.add_argument("--sample",    type=int,   help="Process only first N games (for testing)")
    parser.add_argument("--game_id",   type=str,   help="Process a single game_id only")
    parser.add_argument("--from_date", type=str,   help="Process only games on or after YYYY-MM-DD")
    parser.add_argument("--reverify",  action="store_true",
                         help="Recompute PIT stats even for games that already have an entry, "
                              "diff the recomputed value against what's on disk, and log any "
                              "differences to reverify_diffs.json instead of silently skipping.")
    args = parser.parse_args()
    run_backfill(args)
