import json
db = json.load(open("mlb_database.json", encoding="utf-8"))
dates = sorted(db.keys())
d = dates[len(dates)//2]
game = db[d][0]
print("date key:", d)
print("game keys:", list(game.keys()))
print("game.get(id):", game.get("id"))
print("metadata:", game.get("metadata"))
print("pitchers.home:", game.get("pitchers", {}).get("home"))
print("pitchers.away:", game.get("pitchers", {}).get("away"))
print("game_result:", game.get("game_result"))
print("has liveBoxscore:", "liveBoxscore" in game)
lb = game.get("liveBoxscore") or {}
print("liveBoxscore.home.pitchers sample:", (lb.get("home",{}).get("pitchers") or [])[:2])
