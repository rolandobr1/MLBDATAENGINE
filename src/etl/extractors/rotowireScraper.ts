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
      
      // Buscamos la primera casa de apuestas disponible para extraer la línea principal
      // Prioridades comunes: draftkings, fanduel, mgm, caesars
      const sportsbooks = ['draftkings', 'fanduel', 'mgm', 'caesars', 'betrivers', 'hardrock', 'thescore'];
      
      for (const book of sportsbooks) {
        const line = player[`${book}_strikeouts`];
        const under = player[`${book}_strikeoutsUnder`];
        const over = player[`${book}_strikeoutsOver`];

        if (line !== null && line !== "") {
          const parsedOver = parseInt(over, 10);
          const parsedUnder = parseInt(under, 10);
          props.push({
            playerName: name,
            line: parseFloat(line),
            overOdds: isNaN(parsedOver) ? null as any : parsedOver,
            underOdds: isNaN(parsedUnder) ? null as any : parsedUnder,
            sportsbook: book
          });
          break; // Tomamos la primera línea disponible para este jugador
        }
      }
    }

    return props;
  } catch (error) {
    console.error('[Rotowire] Error al hacer scrape de Strikeouts:', error);
    return [];
  }
}
