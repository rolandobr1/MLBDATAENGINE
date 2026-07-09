const http = require('https');

http.get('https://statsapi.mlb.com/api/v1/game/746210/boxscore', (res) => { // Using an old game ID or any valid one
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const json = JSON.parse(data);
    const p1 = Object.values(json.teams.away.players)[0];
    console.log(Object.keys(p1));
    console.log("seasonStats:", p1.seasonStats);
    console.log("stats:", p1.stats);
  });
});
