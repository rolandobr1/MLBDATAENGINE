const https = require('https');

https.get('https://statsapi.mlb.com/api/v1/game/746485/linescore', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const d = JSON.parse(data);
    console.log("Keys:", Object.keys(d));
    console.log("balls:", d.balls);
    console.log("strikes:", d.strikes);
    console.log("outs:", d.outs);
  });
});
