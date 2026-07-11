"""
backfill_pitcher_stats_pit.py
------------------------------
Generates point-in-time (PIT) corrected stats for all historical games
stored in mlb_database.json.

Produces three output files:
  - pitcher_stats_pit.json    : PIT pitcher seasonal stats per game
  - offense_stats_pit.json    : PIT team offense stats per game
  - boxscore_game_stats.json  : Real pitcher stats from finished game boxscores
                                (IP, BF, Hits, ER, K, BB, Pitches, HR)

Usage:
  python backfill_pitcher_stats_pit.py
  python backfill_pitcher_stats_pit.py --sample 20       # test with 20 games
  python backfill_pitcher_stats_pit.py --game_id 823442  # single game
  python backfill_pitcher_stats_pit.py --from_date 2026-05-01  # games from date
"""

import json
import time
import argparse
import sys
import os
from datetime import datetime, timedelta
from pathlib import Path
import requests

# ─────────────────────────────────────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────────────────────────────────────

MLB_API_BASE = "https://statsapi.mlb.com/api/v1"
DB_PATH = Path(__file__).parent / "mlb_database.json"
OUTPUT_PITCHER = Path(__file__).parent / "pitcher_stats_pit.json"
OUTPUT_OFFENSE = Path(__file__).parent / "offense_stats_pit.json"
OUTPUT_BOXSCORE = Path(__file__).parent / "boxscore_game_stats.json"
RATE_LIMIT_DELAY = 0.25   # seconds between API calls
REQUEST_TIMEOUT = 15       # seconds

FINAL_STATUSES = {"final", "game over", "completed", "completed early"}

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
    return str(status or "").strip().lower() in FINAL_STATUSES


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
        return {"gs": 0, "ip": "0.0", "strikeouts": 0, "wins": 0, "losses": 0,
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
        "strikeouts": total_k,
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
# TEAM OFFENSE POINT-IN-TIME
# ─────────────────────────────────────────────────────────────────────────────

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


def load_existing(path: Path) -> dict:
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            try:
                return json.load(f)
            except Exception:
                return {}
    return {}


def save_json(path: Path, data: dict):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"  Saved → {path} ({len(data)} entries)")


def run_backfill(args):
    print(f"Loading database from {DB_PATH}...")
    with open(DB_PATH, "r", encoding="utf-8") as f:
        db = json.load(f)

    games: dict = db if isinstance(db, dict) else {}
    game_list = list(games.items())

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
    print(f"Processing {total} games...\n")

    # Load existing outputs so we can resume interrupted runs
    pitcher_out  = load_existing(OUTPUT_PITCHER)
    offense_out  = load_existing(OUTPUT_OFFENSE)
    boxscore_out = load_existing(OUTPUT_BOXSCORE)

    for idx, (game_id, game) in enumerate(game_list, 1):
        date   = get_nested(game, "metadata", "date")
        status = get_nested(game, "game_result", "gameStatus", default="")
        home_team = get_nested(game, "metadata", "homeTeam") or get_nested(game, "metadata", "home_team")
        away_team = get_nested(game, "metadata", "awayTeam") or get_nested(game, "metadata", "away_team")

        if not date:
            continue

        season = int(date[:4])

        # IDs from both possible schema locations
        home_pitcher_id = (
            get_nested(game, "pitchers", "home", "id") or
            get_nested(game, "pitchers", "home_starter", "id")
        )
        away_pitcher_id = (
            get_nested(game, "pitchers", "away", "id") or
            get_nested(game, "pitchers", "away_starter", "id")
        )
        home_team_id = get_nested(game, "metadata", "homeTeamId")
        away_team_id = get_nested(game, "metadata", "awayTeamId")

        print(f"[{idx}/{total}] {game_id} | {date} | {home_team} vs {away_team} | {status}")

        # ── Pitcher PIT stats ──
        if game_id not in pitcher_out:
            home_pit = get_pitcher_stats_up_to_date(home_pitcher_id, date, season) if home_pitcher_id else None
            away_pit = get_pitcher_stats_up_to_date(away_pitcher_id, date, season) if away_pitcher_id else None
            pitcher_out[game_id] = {"home": home_pit, "away": away_pit}
        else:
            print(f"  [SKIP] pitcher PIT already exists")

        # ── Team offense PIT stats ──
        if game_id not in offense_out:
            home_off = get_team_offense_up_to_date(home_team_id, date, season) if home_team_id else None
            away_off = get_team_offense_up_to_date(away_team_id, date, season) if away_team_id else None
            offense_out[game_id] = {"home": home_off, "away": away_off}
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
            save_json(OUTPUT_PITCHER, pitcher_out)
            save_json(OUTPUT_OFFENSE, offense_out)
            save_json(OUTPUT_BOXSCORE, boxscore_out)
            print(f"  --- Checkpoint at game {idx} ---\n")

    # Final save
    save_json(OUTPUT_PITCHER, pitcher_out)
    save_json(OUTPUT_OFFENSE, offense_out)
    save_json(OUTPUT_BOXSCORE, boxscore_out)
    print(f"\nDone! Processed {total} games.")


# ─────────────────────────────────────────────────────────────────────────────
# ENTRY POINT
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Backfill point-in-time pitcher and offense stats")
    parser.add_argument("--sample",    type=int,   help="Process only first N games (for testing)")
    parser.add_argument("--game_id",   type=str,   help="Process a single game_id only")
    parser.add_argument("--from_date", type=str,   help="Process only games on or after YYYY-MM-DD")
    args = parser.parse_args()
    run_backfill(args)
