import sys

with open('server.ts', 'r', encoding='utf-8') as f:
    text = f.read()

target = """async function fetchDataStreakPitcherStrikeoutProps(date: string, forceRefresh = false) {
  return fetchDataStreakSheetRows(date, "mlb_pitcher_ks", "datastreak_pitcher_ks", forceRefresh, false);
}"""

replacement = """async function fetchDataStreakPitcherStrikeoutProps(date: string, forceRefresh = false) {
  const dataStreakKs = await fetchDataStreakSheetRows(date, "mlb_pitcher_ks", "datastreak_pitcher_ks", forceRefresh, false);
  
  let rotowireKs: any[] = [];
  try {
    const rwData = await scrapeStrikeoutProps();
    rotowireKs = rwData.map(p => ({
      player_name: p.playerName,
      line: String(p.line),
      odds: String(p.overOdds),
      under_odds: String(p.underOdds),
      vendor: p.sportsbook || "rotowire",
      source: "rotowire"
    }));
  } catch(e) {
    console.warn("No se pudo obtener Rotowire Ks:", e);
  }

  return [...rotowireKs, ...dataStreakKs];
}"""

if target in text:
    text = text.replace(target, replacement)
    with open('server.ts', 'w', encoding='utf-8') as f:
        f.write(text)
    print("Success")
else:
    print("Target not found")
