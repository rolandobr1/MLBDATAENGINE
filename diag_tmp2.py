import json
db = json.load(open("mlb_database.json", encoding="utf-8"))
dates = sorted(db.keys())
d = dates[len(dates)//2]
game = db[d][0]
print("teams:", game.get("teams"))
print("id type:", type(game.get("id")))
