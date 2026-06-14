import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function testOddsAPI() {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    console.error("ODDS_API_KEY no se encontró en .env.local!");
    process.exit(1);
  }

  console.log("ODDS_API_KEY encontrada. Probando conexión con The Odds API...");
  
  const url = `https://api.the-odds-api.com/v4/sports/baseball_mlb/odds/?apiKey=${apiKey}&regions=us&markets=h2h,spreads,totals&oddsFormat=american`;
  
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`Error de The Odds API: Status ${res.status} ${res.statusText}`);
      const text = await res.text();
      console.error(text);
      process.exit(1);
    }
    
    const data = await res.json();
    console.log(`Conexión exitosa! Se recuperaron ${data.length} juegos con líneas.`);
    if (data.length > 0) {
      console.log(`Juego de ejemplo: ${data[0].home_team} vs ${data[0].away_team}`);
    }
    process.exit(0);
  } catch (error) {
    console.error("Error de red:", error);
    process.exit(1);
  }
}

testOddsAPI();
