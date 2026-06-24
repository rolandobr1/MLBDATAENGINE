export interface StrikeoutProp {
  playerName: string;
  line: number;
  overOdds: number;
  underOdds: number;
  sportsbook: string;
}

export async function scrapeStrikeoutProps(): Promise<StrikeoutProp[]> {
  const props: StrikeoutProp[] = [];

  try {
    console.log('[Rotowire] Realizando petición a player-props.php...');
    // Obtenemos el HTML crudo
    const response = await fetch('https://www.rotowire.com/betting/mlb/player-props.php?prop=strikeouts', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`Rotowire devolvió status: ${response.status}`);
    }

    const html = await response.text();

    // Rotowire inyecta los datos como arreglos JSON directamente en el HTML
    // Usamos una expresión regular para capturar todos los "data: [{...}]"
    const regex = /data\s*:\s*(\[\{.*?\}\])\s*,/g;
    let match;
    let targetData: any[] = [];

    // Buscamos cuál de los JSON inyectados contiene los strikeouts
    while ((match = regex.exec(html)) !== null) {
      try {
        const parsed = JSON.parse(match[1]);
        if (parsed.length > 0 && ('draftkings_strikeouts' in parsed[0] || 'fanduel_strikeouts' in parsed[0])) {
          targetData = parsed;
          break;
        }
      } catch (e) {
        // Ignore JSON parse errors for invalid matches
      }
    }

    if (targetData.length === 0) {
      console.log('[Rotowire] No se encontraron datos de strikeouts en el HTML. Puede que no haya juegos.');
      return [];
    }

    console.log(`[Rotowire] Encontrados ${targetData.length} jugadores con datos. Parseando...`);

    for (const player of targetData) {
      const name = player.name;
      
      // Buscamos todas las líneas disponibles en las distintas casas de apuestas
      const sportsbooks = ['draftkings', 'fanduel', 'mgm', 'caesars', 'betrivers', 'hardrock', 'thescore'];
      const linesData: { line: number, overOdds: number, underOdds: number, book: string }[] = [];
      
      for (const book of sportsbooks) {
        const lineStr = player[`${book}_strikeouts`];
        const underStr = player[`${book}_strikeoutsUnder`];
        const overStr = player[`${book}_strikeoutsOver`];

        if (lineStr !== null && lineStr !== "") {
          const parsedOver = parseInt(overStr, 10);
          const parsedUnder = parseInt(underStr, 10);
          const line = parseFloat(lineStr);
          if (!isNaN(line)) {
            linesData.push({
              line,
              overOdds: isNaN(parsedOver) ? null as any : parsedOver,
              underOdds: isNaN(parsedUnder) ? null as any : parsedUnder,
              book
            });
          }
        }
      }

      if (linesData.length > 0) {
        // Encontrar la línea que más se repite (consenso/moda)
        const lineCounts = new Map<number, number>();
        for (const d of linesData) {
          lineCounts.set(d.line, (lineCounts.get(d.line) || 0) + 1);
        }

        let modeLine = linesData[0].line;
        let maxCount = 0;

        for (const [line, count] of lineCounts.entries()) {
          if (count > maxCount) {
            maxCount = count;
            modeLine = line;
          }
        }

        // Buscar los datos de la línea ganadora (preferiblemente de draftkings si está, o el primero que la tenga)
        let bestLineData = linesData.find(d => d.line === modeLine && d.book === 'draftkings') 
                        || linesData.find(d => d.line === modeLine)!;

        // Formatear el nombre de las casas de apuestas (Ej: "draftkings, mgm (Consenso)")
        const matchingBooks = linesData.filter(d => d.line === modeLine).map(d => d.book);
        const sourceLabel = matchingBooks.length > 1 
          ? `Consenso (${matchingBooks.length} casas)` 
          : bestLineData.book;

        props.push({
          playerName: name,
          line: bestLineData.line,
          overOdds: bestLineData.overOdds,
          underOdds: bestLineData.underOdds,
          sportsbook: sourceLabel
        });
      }
    }

    return props;
  } catch (error) {
    console.error('[Rotowire] Error al hacer scrape de Strikeouts:', error);
    return [];
  }
}
