import argparse
import json
import traceback
from datetime import datetime
import pandas as pd
from pybaseball import statcast, pitching_stats_range, team_game_logs, statcast_pitcher_arsenal_stats

def get_recent_statcast(start_date, end_date):
    """Obtiene datos de Statcast de los últimos días y los procesa para Hot Hand / Bullpen."""
    try:
        data = statcast(start_dt=start_date, end_dt=end_date)
        if data.empty:
            return {"error": "No data found for given dates."}
        
        # Filtramos campos pesados
        cols_to_keep = ['game_date', 'player_name', 'pitcher', 'batter', 'events', 'description', 
                        'pitch_type', 'release_speed', 'type', 'game_pk', 'home_team', 'away_team', 'inning_topbot']
        df = data[cols_to_keep].copy()
        
        # Opcional: procesar un poco para no enviar 10MB de JSON a NodeJS
        # Calcularemos CSW (Called Strike + Whiff) por pitcher
        df['is_csw'] = df['description'].isin(['called_strike', 'swinging_strike', 'swinging_strike_blocked'])
        
        csw_grouped = df.groupby('pitcher').agg(
            total_pitches=('pitch_type', 'count'),
            csw_pitches=('is_csw', 'sum'),
            avg_velocity=('release_speed', 'mean')
        ).reset_index()
        
        csw_grouped['csw_pct'] = csw_grouped['csw_pitches'] / csw_grouped['total_pitches']
        
        return {
            "success": True,
            "data": {
                "pitchers_recent": csw_grouped.to_dict(orient='records')
            }
        }
    except Exception as e:
        return {"success": False, "error": str(e), "trace": traceback.format_exc()}

def group_pitch_type(pitch_name):
    """Clasifica el nombre del pitch en uno de los 5 grupos canonicos."""
    if not pitch_name:
        return "other"
    name = str(pitch_name).lower()
    if any(k in name for k in ["fastball", "sinker", "cutter", "four-seam", "two-seam", "4-seam", "2-seam", "ff", "si", "fc"]):
        return "fastball"
    if any(k in name for k in ["slider", "sweeper", "slurve", "sl"]):
        return "slider"
    if any(k in name for k in ["curve", "curveball", "knuckle-curve", "kc", "cu"]):
        return "curve"
    if any(k in name for k in ["changeup", "change-up", "ch"]):
        return "changeup"
    if any(k in name for k in ["split", "splitter", "forkball", "fs", "fo"]):
        return "splitter"
    return "other"

def get_pitcher_arsenal(year, pitcher_ids_str):
    """
    Obtiene el arsenal de pitcheos de los pitchers especificados usando pybaseball.
    statcast_pitcher_arsenals() NO tiene limite minimo de pitcheos,
    a diferencia del endpoint de Baseball Savant (min=10).

    Args:
        year: Año de la temporada (ej. "2025")
        pitcher_ids_str: IDs de pitchers separados por comas (ej. "656756,592789")
    """
    try:
        yr = int(year)
        target_ids = set(str(pid).strip() for pid in pitcher_ids_str.split(",") if pid.strip())

        # minPA=1 elimina cualquier filtro minimo, cubriendo todos los pitchers
        df = statcast_pitcher_arsenal_stats(yr, minPA=1)

        if df is None or df.empty:
            return {"success": False, "error": f"No arsenal data for year {yr}"}

        df.columns = [c.lower() for c in df.columns]

        # Detectar columna de ID del pitcher
        id_col = next((c for c in ["pitcher_id", "player_id", "playerid"] if c in df.columns), None)
        if id_col is None:
            return {"success": False, "error": f"No pitcher ID column found. Columns: {list(df.columns)}"}

        # Detectar columna de nombre del pitch
        pitch_col = next((c for c in ["pitch_name", "pitch_type_name", "pitch_type"] if c in df.columns), None)
        if pitch_col is None:
            return {"success": False, "error": f"No pitch name column found. Columns: {list(df.columns)}"}

        # Detectar columna de porcentaje de uso
        # pitch_usage en statcast_pitcher_arsenal_stats ya viene como 0-100 (ej. 53.7)
        pct_col = next((c for c in ["pitch_usage", "pitch_usage_pct", "percent", "pitches"] if c in df.columns), None)

        df[id_col] = df[id_col].astype(str)
        df_filtered = df[df[id_col].isin(target_ids)]

        result = {}
        for pid, group in df_filtered.groupby(id_col):
            buckets = {"fastball": 0.0, "slider": 0.0, "curve": 0.0, "changeup": 0.0, "splitter": 0.0}
            for _, row in group.iterrows():
                pitch_name = str(row.get(pitch_col, ""))
                pct_raw = float(row.get(pct_col, 0) or 0) if pct_col else 0.0
                # pitch_usage ya viene en escala 0-100, no necesita conversion
                bucket = group_pitch_type(pitch_name)
                if bucket != "other":
                    buckets[bucket] += pct_raw

            result[str(pid)] = {
                "fastballPct": round(buckets["fastball"], 1),
                "sliderPct":   round(buckets["slider"], 1),
                "curvePct":    round(buckets["curve"], 1),
                "changeupPct": round(buckets["changeup"], 1),
                "splitterPct": round(buckets["splitter"], 1),
            }

        return {"success": True, "data": result}

    except Exception as e:
        return {"success": False, "error": str(e), "trace": traceback.format_exc()}

def get_pitcher_advanced_metrics(start_date, end_date, pitcher_ids_str=None):
    """Obtiene métricas avanzadas (Chase Rate, Spin Rate, CSW%) para lanzadores específicos."""
    try:
        data = statcast(start_dt=start_date, end_dt=end_date)
        if data.empty:
            return {"success": False, "error": "No data found for given dates."}
        
        target_ids = None
        if pitcher_ids_str:
            target_ids = set(float(pid.strip()) for pid in pitcher_ids_str.split(",") if pid.strip())
            df = data[data['pitcher'].isin(target_ids)].copy()
        else:
            df = data.copy()

        # O-Swing% (Chase Rate): Swings on pitches out of the zone
        # zone: 1-9 is in the strike zone. 11-14 is out of the zone.
        df['out_of_zone'] = df['zone'].isin([11, 12, 13, 14])
        # definition of swing
        swings = ['swinging_strike', 'swinging_strike_blocked', 'foul', 'hit_into_play', 'foul_tip', 'foul_bunt', 'missed_bunt']
        df['is_swing'] = df['description'].isin(swings)
        df['chase_opportunity'] = df['out_of_zone']
        df['chase_swing'] = df['out_of_zone'] & df['is_swing']
        
        grouped = df.groupby('pitcher').agg(
            avg_spin_rate=('release_spin_rate', 'mean'),
            chase_swings=('chase_swing', 'sum'),
            chase_opps=('chase_opportunity', 'sum')
        ).reset_index()
        
        grouped['chase_pct'] = (grouped['chase_swings'] / grouped['chase_opps'].replace(0, 1)) * 100
        grouped['avg_spin_rate'] = grouped['avg_spin_rate'].round(1)
        grouped['chase_pct'] = grouped['chase_pct'].round(1)
        
        # We don't have Stuff+ natively in Statcast event data, so we omit it or return None.
        
        result = {}
        for _, row in grouped.iterrows():
            result[str(int(row['pitcher']))] = {
                "spinRate": row['avg_spin_rate'] if pd.notnull(row['avg_spin_rate']) else None,
                "chasePct": row['chase_pct'] if pd.notnull(row['chase_pct']) else None,
                "stuffPlus": None
            }

        return {"success": True, "data": result}
    except Exception as e:
        return {"success": False, "error": str(e), "trace": traceback.format_exc()}

    except Exception as e:
        return {"success": False, "error": str(e), "trace": traceback.format_exc()}

def get_batter_splits():
    # En producción esto usaría statcast() agrupado por batter y pitch_hand o fan_graphs()
    # Mocking data for architecture validation
    return {
        "success": True,
        "data": {
            "splits": {
                # Mock example: { batter_id: { "RHP": { "babip": 0.312, "hard_hit": 0.45 }, "LHP": { "babip": 0.280, "hard_hit": 0.38 } } }
                "default": { "RHP": { "babip": 0.300, "hard_hit": 0.40 }, "LHP": { "babip": 0.290, "hard_hit": 0.35 } }
            }
        }
    }

def get_bullpen_workload():
    # En producción esto consultaría pitching_stats_bref o game_logs de los últimos 2 días
    return {
        "success": True,
        "data": {
            "teams": {
                "NYY": { "recent_ip": 12.0, "recent_pitches": 185 },
                "BOS": { "recent_ip": 5.2, "recent_pitches": 90 }
            }
        }
    }

def get_bvp(batter_id, pitcher_id):
    """Ejemplo para obtener enfrentamientos directos, requeriría una fecha inicial o usar otra función."""
    # Para BvP completo se suele necesitar statcast_batter o la API de MLB. 
    # Pybaseball no tiene una función BvP rápida directa sin descargar grandes rangos,
    # por lo que esto es un esqueleto que puede ser expandido.
    return {"success": True, "data": {"batter_id": batter_id, "pitcher_id": pitcher_id, "bvp_ops": None}}

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--action", required=True, choices=["recent_statcast", "bvp", "batter_splits", "bullpen", "pitcher_arsenal", "pitcher_advanced_metrics"])
    parser.add_argument("--start", help="Start date YYYY-MM-DD")
    parser.add_argument("--end", help="End date YYYY-MM-DD")
    parser.add_argument("--year", help="Year for stats")
    parser.add_argument("--pitcher_ids", help="Comma-separated pitcher IDs for arsenal lookup")
    parser.add_argument("--batter", help="Batter ID")
    parser.add_argument("--pitcher", help="Pitcher ID")
    
    args = parser.parse_args()
    
    result = {}
    
    if args.action == "recent_statcast":
        if not args.start or not args.end:
            result = {"success": False, "error": "Missing start or end date"}
        else:
            result = get_recent_statcast(args.start, args.end)
            
    elif args.action == "bvp":
        if not args.batter or not args.pitcher:
            result = {"success": False, "error": "Missing batter or pitcher ID"}
        else:
            result = get_bvp(args.batter, args.pitcher)
            
    elif args.action == "batter_splits":
        result = get_batter_splits()
        
    elif args.action == "bullpen":
        result = get_bullpen_workload()
    
    elif args.action == "pitcher_arsenal":
        if not args.year or not args.pitcher_ids:
            result = {"success": False, "error": "Missing --year or --pitcher_ids"}
        else:
            result = get_pitcher_arsenal(args.year, args.pitcher_ids)
            
    elif args.action == "pitcher_advanced_metrics":
        if not args.start or not args.end:
            result = {"success": False, "error": "Missing --start or --end"}
        else:
            result = get_pitcher_advanced_metrics(args.start, args.end, args.pitcher_ids)
            
    print(json.dumps(result))
