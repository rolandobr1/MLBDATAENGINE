import axios from 'axios';

// Usualmente se utiliza una API como The-Odds-API (requiere API KEY)
// Aquí implementamos un mock o un llamado básico a The Odds API
const ODDS_API_KEY = process.env.ODDS_API_KEY || 'DEMO_KEY';
const ODDS_API_BASE = 'https://api.the-odds-api.com/v4/sports/baseball_mlb/odds';

export const fetchDailyOdds = async () => {
  try {
    // Si no hay API KEY real, podemos devolver un mock para desarrollo
    if (ODDS_API_KEY === 'DEMO_KEY') {
      console.log('Using DEMO_KEY for Odds API. Returning mock data.');
      return [
        {
          id: "mock_game_id",
          home_team: "New York Yankees",
          away_team: "Boston Red Sox",
          bookmakers: [
            {
              title: "DraftKings",
              markets: [
                {
                  key: "h2h",
                  outcomes: [
                    { name: "New York Yankees", price: -150 },
                    { name: "Boston Red Sox", price: +130 }
                  ]
                }
              ]
            }
          ]
        }
      ];
    }

    const response = await axios.get(ODDS_API_BASE, {
      params: {
        apiKey: ODDS_API_KEY,
        regions: 'us',
        markets: 'h2h,spreads,totals',
        oddsFormat: 'american'
      }
    });
    
    return response.data;
  } catch (error) {
    console.error('Error fetching odds:', error);
    return null;
  }
};
