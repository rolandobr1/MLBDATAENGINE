import fs from "fs";

function safeFloat(val: any): number | null {
  if (val === null || val === undefined) return null;
  const num = parseFloat(String(val));
  return isNaN(num) ? null : num;
}

function doSync() {
  const db = JSON.parse(fs.readFileSync("mlb_database.json", "utf-8"));
  const date = "2026-06-15";
  const dateGames = db[date] || [];
  
  let realOddsData = [];
  try {
    realOddsData = JSON.parse(fs.readFileSync(`odds_cache_${date}.json`, "utf-8"));
  } catch(e) {
    console.log("No odds cache found");
    return;
  }

  for (const game of dateGames) {
    const homeName = game.teams.home;
    const awayName = game.teams.away;

    const matchOdds = realOddsData.find((o: any) => {
      const oHome = o.home_team.toLowerCase();
      const oAway = o.away_team.toLowerCase();
      const dbHome = homeName.toLowerCase();
      const dbAway = awayName.toLowerCase();
      return (oHome === dbHome || oHome.includes(dbHome) || dbHome.includes(oHome)) &&
             (oAway === dbAway || oAway.includes(dbAway) || dbAway.includes(oAway));
    });

    if (matchOdds && matchOdds.bookmakers && matchOdds.bookmakers.length > 0) {
      const bookie = matchOdds.bookmakers.find((b: any) => b.key === 'draftkings' || b.key === 'fanduel') || matchOdds.bookmakers[0];
      const h2h = bookie.markets.find((m: any) => m.key === 'h2h');
      const spreads = bookie.markets.find((m: any) => m.key === 'spreads');
      const totals = bookie.markets.find((m: any) => m.key === 'totals');

      game.betting_lines = {
        openingMoneylineHome: h2h?.outcomes?.find((o: any) => o.name?.toLowerCase() === matchOdds.home_team?.toLowerCase())?.price ?? null,
        openingMoneylineAway: h2h?.outcomes?.find((o: any) => o.name?.toLowerCase() === matchOdds.away_team?.toLowerCase())?.price ?? null,
        currentMoneylineHome: h2h?.outcomes?.find((o: any) => o.name?.toLowerCase() === matchOdds.home_team?.toLowerCase())?.price ?? null,
        currentMoneylineAway: h2h?.outcomes?.find((o: any) => o.name?.toLowerCase() === matchOdds.away_team?.toLowerCase())?.price ?? null,
        runLineHome: spreads?.outcomes?.find((o: any) => o.name?.toLowerCase() === matchOdds.home_team?.toLowerCase())?.point ?? null,
        runLineHomeOdds: spreads?.outcomes?.find((o: any) => o.name?.toLowerCase() === matchOdds.home_team?.toLowerCase())?.price ?? null,
        runLineAway: spreads?.outcomes?.find((o: any) => o.name?.toLowerCase() === matchOdds.away_team?.toLowerCase())?.point ?? null,
        runLineAwayOdds: spreads?.outcomes?.find((o: any) => o.name?.toLowerCase() === matchOdds.away_team?.toLowerCase())?.price ?? null,
        totalRuns: totals?.outcomes?.find((o: any) => o.name?.toLowerCase() === 'over')?.point ?? totals?.outcomes?.find((o: any) => o.name?.toLowerCase() === 'under')?.point ?? null,
        overOdds: totals?.outcomes?.find((o: any) => o.name?.toLowerCase() === 'over')?.price ?? null,
        underOdds: totals?.outcomes?.find((o: any) => o.name?.toLowerCase() === 'under')?.price ?? null,
        lineSource: "the_odds_api",
        lineMovementSummary: "Líneas de cuotas provistas por The Odds API (Modo Directo)."
      };
      console.log(`Matched odds for ${homeName}`);
    } else {
      console.log(`NO MATCH for ${homeName}`);
    }
  }

  fs.writeFileSync("mlb_database.json", JSON.stringify(db, null, 2));
  console.log("Done syncing odds offline");
}

doSync();
