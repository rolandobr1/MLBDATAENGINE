import { fetchDailySchedule } from './src/etl/extractors/mlbApi';
import { getPitcherAdvancedMetrics } from './src/etl/extractors/pybaseballApi';
import { parkFactorsScraper } from './src/etl/extractors/parkFactorsScraper';

async function main() {
    const today = new Date().toISOString().split('T')[0];
    console.log("Loading schedule for", today);
    const schedule = await fetchDailySchedule(today);
    
    if (!schedule || schedule.length === 0) {
        console.log("No games today.");
        return;
    }
    
    const game = schedule[0];
    console.log(`Checking Game: ${game.teams.away.team.name} @ ${game.teams.home.team.name} (Venue: ${game.venue.name})`);
    
    await parkFactorsScraper.load();
    const pf = parkFactorsScraper.getParkFactors(game.venue.name);
    console.log(`\n=== Park Factors for ${game.venue.name} ===`);
    console.log(pf);

    const homePitcherId = game.teams.home.probablePitcher?.id;
    const awayPitcherId = game.teams.away.probablePitcher?.id;

    if (!homePitcherId || !awayPitcherId) {
        console.log("Missing probable pitchers for this game.");
    } else {
        console.log(`\n=== Pitcher Advanced Metrics ===`);
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);
        const startStr = startDate.toISOString().split('T')[0];
        
        const metrics = await getPitcherAdvancedMetrics(
            [homePitcherId.toString(), awayPitcherId.toString()],
            startStr,
            today
        );
        console.log("Home Pitcher:", game.teams.home.probablePitcher?.fullName, "ID:", homePitcherId);
        console.log(metrics[homePitcherId.toString()] || "No data");
        console.log("Away Pitcher:", game.teams.away.probablePitcher?.fullName, "ID:", awayPitcherId);
        console.log(metrics[awayPitcherId.toString()] || "No data");
    }
}
main().catch(console.error);
