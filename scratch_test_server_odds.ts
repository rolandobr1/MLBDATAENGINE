import dotenv from 'dotenv'; dotenv.config({path:'.env.local'});

const fetchWithTimeout = async (url: string, ms: number) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return res;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
};

async function testFetchOdds() {
  const apiKey = process.env.ODDS_API_KEY;
  const url = `https://api.the-odds-api.com/v4/sports/baseball_mlb/odds/?apiKey=${apiKey}&regions=us&markets=h2h,spreads,totals&oddsFormat=american`;
  console.log('Fetching Odds API...');
  try {
    const res = await fetchWithTimeout(url, 10000);
    if (!res.ok) {
       console.log('Error from Odds API:', res.status, await res.text());
       return;
    }
    const data = await res.json();
    console.log('Got data! Length:', data.length);
    console.log('Mapping to dummy gamesList to test iteration...');
    
    // Simulate mapping
    const eventsWithProps = await Promise.all(data.map(async (event: any) => {
      // Simulate props
      const propsUrl = `https://api.the-odds-api.com/v4/sports/baseball_mlb/events/${event.id}/odds?apiKey=${apiKey}&regions=us&markets=pitcher_strikeouts,batter_total_bases&oddsFormat=american`;
      console.log('Fetching props for:', event.home_team);
      const propsRes = await fetchWithTimeout(propsUrl, 10000);
      if (!propsRes.ok) {
        console.error('Props fetch failed for', event.home_team, 'Status:', propsRes.status, await propsRes.text());
      }
      return event;
    }));
    console.log('All props fetched!');
  } catch (err) {
    console.error('Caught error in fetchRealBettingLines simulation:', err);
  }
}
testFetchOdds();
