/**
 * ⚠️ ARCHIVADO / NO USADO EN PRODUCCIÓN (Fase 4, punto 3 del plan de mejora).
 *
 * Solo lo importa `src/workflow.ts` (también archivado). `server.ts` tiene
 * su propia lógica de extracción de la API de MLB (mucho más completa,
 * incluye point-in-time correctness) y no depende de este archivo.
 *
 * Se deja en su lugar porque esta sesión no puede mover/eliminar archivos
 * en tu máquina — ver el mensaje de la Fase 4 para el comando manual.
 */
import axios from 'axios';

const MLB_API_BASE = 'https://statsapi.mlb.com/api/v1';

export const fetchDailySchedule = async (date: string) => {
  try {
    // date format: YYYY-MM-DD
    const response = await axios.get(`${MLB_API_BASE}/schedule`, {
      params: {
        sportId: 1,
        date: date,
        hydrate: 'team,linescore,flags,liveLookin,person,stats,probablePitcher,game(content(summary,media(epg)),tickets)',
      },
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching MLB schedule:', error);
    throw error;
  }
};

export const fetchGameContext = async (gamePk: number) => {
  try {
    const response = await axios.get(`${MLB_API_BASE}/game/${gamePk}/contextMetrics`);
    return response.data;
  } catch (error) {
    console.error(`Error fetching context for game ${gamePk}:`, error);
    return null;
  }
};

export const fetchBoxscore = async (gamePk: number) => {
  try {
    const response = await axios.get(`${MLB_API_BASE}/game/${gamePk}/boxscore`);
    return response.data;
  } catch (error) {
    console.error(`Error fetching boxscore for game ${gamePk}:`, error);
    return null;
  }
};
