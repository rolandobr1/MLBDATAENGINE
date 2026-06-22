import argparse
import json
import traceback
from datetime import datetime
import pandas as pd
from pybaseball import statcast, pitching_stats_range, team_game_logs

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
    parser.add_argument("--action", required=True, choices=["recent_statcast", "bvp", "batter_splits", "bullpen"])
    parser.add_argument("--start", help="Start date YYYY-MM-DD")
    parser.add_argument("--end", help="End date YYYY-MM-DD")
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
            
    print(json.dumps(result))
