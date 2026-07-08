import { getPitcherAdvancedMetrics } from './src/etl/extractors/pybaseballApi';
import { parkFactorsScraper } from './src/etl/extractors/parkFactorsScraper';
import { fetchDailySchedule } from './src/etl/extractors/mlbApi';

async function testExtraction() {
    const dateStr = "2024-05-15"; // Usando una fecha pasada con datos reales en Savant
    console.log(`\n1. Probando Extracción del Calendario (${dateStr})...`);
    
    let schedule;
    try {
        schedule = await fetchDailySchedule(dateStr);
    } catch (e) {
        console.error("Error obteniendo el calendario", e);
        return;
    }

    if (!schedule || !schedule.dates || schedule.dates.length === 0) {
        console.log("No hay juegos para esta fecha.");
        return;
    }

    const games = schedule.dates[0].games;
    const game = games[0];
    const homePitcherId = game.teams.home.probablePitcher?.id;
    const awayPitcherId = game.teams.away.probablePitcher?.id;
    const venueName = game.venue.name;

    console.log(`Juego Seleccionado: ${game.teams.away.team.name} @ ${game.teams.home.team.name}`);
    console.log(`Estadio: ${venueName}`);

    console.log(`\n2. Probando Extracción de Park Factors...`);
    await parkFactorsScraper.load();
    const pf = parkFactorsScraper.getParkFactors(venueName);
    console.log(`✅ Multiplicadores para ${venueName}:`, pf);

    if (homePitcherId && awayPitcherId) {
        console.log(`\n3. Probando Extracción de PyBaseball Avanzado (Spin Rate, Chase%, etc)...`);
        console.log(`Pitcher Home ID: ${homePitcherId} | Pitcher Away ID: ${awayPitcherId}`);
        
        // Simular ventana de 30 días para Savant
        const startDate = new Date(dateStr);
        startDate.setDate(startDate.getDate() - 30);
        const startStr = startDate.toISOString().split('T')[0];

        const advancedMetrics = await getPitcherAdvancedMetrics(
            [homePitcherId.toString(), awayPitcherId.toString()],
            startStr,
            dateStr
        );
        
        console.log("\n✅ Resultados Crudos devueltos por Python (PyBaseball):");
        console.log(JSON.stringify(advancedMetrics, null, 2));
    } else {
        console.log("Este juego no tiene pitchers probables asignados.");
    }
}

testExtraction().catch(console.error);
