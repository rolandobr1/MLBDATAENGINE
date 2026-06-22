import { scrapeStrikeoutProps } from './src/etl/extractors/rotowireScraper';

async function main() {
  console.log('--- Iniciando Test de Scraping Rotowire (Node Fetch) ---');
  console.log('Obteniendo props de Strikeouts...');
  
  const props = await scrapeStrikeoutProps();
  
  if (props.length === 0) {
    console.log('No se encontraron props. Esto puede suceder si:');
    console.log('1. No hay juegos de MLB hoy.');
    console.log('2. Las líneas aún no se han publicado.');
  } else {
    console.log(`¡Éxito! Se encontraron ${props.length} jugadores:`);
    console.table(props);
  }
}

main().catch(console.error);
