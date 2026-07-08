import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';

// Since this is ES Modules, we use process.cwd() to get the path relative to the root
const PYTHON_SCRIPT = path.join(process.cwd(), 'src', 'etl', 'extractors', 'pybaseball_scraper.py');
const VENV_PYTHON = path.join(process.cwd(), 'venv', 'Scripts', 'python.exe');
// Use venv if it exists, otherwise fall back to system Python
const PYTHON_BIN = fs.existsSync(VENV_PYTHON) ? VENV_PYTHON : 'python';

const CACHE_DIR = path.join(process.cwd(), 'cache');
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function getCacheFilename(action: string, extraKey: string = '') {
  const dateStr = new Date().toISOString().split('T')[0];
  const safeExtraKey = extraKey.replace(/[^a-z0-9_-]/gi, '_');
  return path.join(CACHE_DIR, `pybaseball_${action}_${dateStr}${safeExtraKey ? '_' + safeExtraKey : ''}.json`);
}

async function withCache(action: string, extraKey: string, fn: () => Promise<any>): Promise<any> {
  const cacheFile = getCacheFilename(action, extraKey);
  if (fs.existsSync(cacheFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      console.log(`[PyBaseball Cache] Using cached data for ${action} ${extraKey}`);
      return data;
    } catch (e) {
      console.warn(`[PyBaseball Cache] Failed to read cache for ${action}, fetching fresh data...`);
    }
  }

  const result = await fn();
  try {
    fs.writeFileSync(cacheFile, JSON.stringify(result));
    console.log(`[PyBaseball Cache] Saved fresh data for ${action} ${extraKey}`);
  } catch (e) {
    console.error(`[PyBaseball Cache] Failed to write cache for ${action}`);
  }
  return result;
}

function getPerPitcherCacheFilename(action: string, dateStr: string, pitcherId: string) {
  return path.join(CACHE_DIR, `pybaseball_${action}_${dateStr}_${pitcherId}.json`);
}

async function withPerPitcherCache<T>(
  action: string,
  dateStr: string,
  pitcherIds: string[],
  fetchMissing: (missingIds: string[]) => Promise<Record<string, T>>
): Promise<Record<string, T>> {
  const result: Record<string, T> = {};
  const missingIds: string[] = [];

  for (const id of pitcherIds) {
    const cacheFile = getPerPitcherCacheFilename(action, dateStr, id);
    if (fs.existsSync(cacheFile)) {
      try {
        result[id] = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      } catch (e) {
        missingIds.push(id);
      }
    } else {
      missingIds.push(id);
    }
  }

  if (missingIds.length > 0) {
    console.log(`[PyBaseball Cache] Fetching fresh data for ${action} - missing ${missingIds.length} pitchers`);
    const fetchedData = await fetchMissing(missingIds);
    for (const id of missingIds) {
      if (fetchedData[id] !== undefined) {
        result[id] = fetchedData[id];
        const cacheFile = getPerPitcherCacheFilename(action, dateStr, id);
        try {
          fs.writeFileSync(cacheFile, JSON.stringify(fetchedData[id]));
        } catch (e) {
          console.error(`[PyBaseball Cache] Failed to write per-pitcher cache for ${action} ID: ${id}`);
        }
      }
    }
  }

  return result;
}

export const getRecentStatcast = (startDate: string, endDate: string): Promise<any> => {
  return withCache('recent_statcast', `${startDate}_${endDate}`, () => {
    return new Promise((resolve, reject) => {
      const command = `"${PYTHON_BIN}" "${PYTHON_SCRIPT}" --action recent_statcast --start "${startDate}" --end "${endDate}"`;
      
      exec(command, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
        if (error) {
          console.error(`exec error: ${error}`);
          return reject(error);
        }
        try {
          const jsonStart = stdout.indexOf('{');
          const jsonStr = jsonStart >= 0 ? stdout.substring(jsonStart) : stdout;
          const jsonResponse = JSON.parse(jsonStr);
          resolve(jsonResponse);
        } catch (parseError) {
          console.error('Failed to parse Python output:', stdout);
          reject(parseError);
        }
      });
    });
  });
};

export const getBvP = (batterId: string, pitcherId: string): Promise<any> => {
  return withCache('bvp', `${batterId}_${pitcherId}`, () => {
    return new Promise((resolve, reject) => {
      const command = `"${PYTHON_BIN}" "${PYTHON_SCRIPT}" --action bvp --batter "${batterId}" --pitcher "${pitcherId}"`;
      
      exec(command, { maxBuffer: 1024 * 1024 * 5 }, (error, stdout, stderr) => {
        if (error) {
          console.error(`exec error: ${error}`);
          return reject(error);
        }
        try {
          const jsonStart = stdout.indexOf('{');
          const jsonStr = jsonStart >= 0 ? stdout.substring(jsonStart) : stdout;
          const jsonResponse = JSON.parse(jsonStr);
          resolve(jsonResponse);
        } catch (parseError) {
          console.error('Failed to parse Python output:', stdout);
          reject(parseError);
        }
      });
    });
  });
};

export const getBatterSplits = (): Promise<any> => {
  return withCache('batter_splits', '', () => {
    return new Promise((resolve, reject) => {
      const command = `"${PYTHON_BIN}" "${PYTHON_SCRIPT}" --action batter_splits`;
      exec(command, { maxBuffer: 1024 * 1024 * 5 }, (error, stdout, stderr) => {
        if (error) return reject(error);
        try { 
          const jsonStart = stdout.indexOf('{');
          const jsonStr = jsonStart >= 0 ? stdout.substring(jsonStart) : stdout;
          resolve(JSON.parse(jsonStr)); 
        } catch (e) { reject(e); }
      });
    });
  });
};

export const getBullpenWorkload = (): Promise<any> => {
  return withCache('bullpen', '', () => {
    return new Promise((resolve, reject) => {
      const command = `"${PYTHON_BIN}" "${PYTHON_SCRIPT}" --action bullpen`;
      exec(command, { maxBuffer: 1024 * 1024 * 5 }, (error, stdout, stderr) => {
        if (error) return reject(error);
        try { 
          const jsonStart = stdout.indexOf('{');
          const jsonStr = jsonStart >= 0 ? stdout.substring(jsonStart) : stdout;
          resolve(JSON.parse(jsonStr)); 
        } catch (e) { reject(e); }
      });
    });
  });
};

/**
 * Obtiene el arsenal de pitcheos por pitcher desde Python (sin límite mínimo de apariciones).
 * @param pitcherIds Array de IDs numéricos de pitcher (MLB player_id)
 * @param year       Año de la temporada (ej. "2025")
 * @returns Mapa { pitcherId: { fastballPct, sliderPct, curvePct, changeupPct, splitterPct } }
 */
export const getPitcherArsenals = (pitcherIds: string[], year: string): Promise<Record<string, {
  fastballPct: number;
  sliderPct: number;
  curvePct: number;
  changeupPct: number;
  splitterPct: number;
}>> => {
  return withPerPitcherCache('pitcher_arsenal', year, pitcherIds, (missingIds) => {
    return new Promise((resolve) => {
      const idsCsv = missingIds.join(',');
      const command = `"${PYTHON_BIN}" "${PYTHON_SCRIPT}" --action pitcher_arsenal --year "${year}" --pitcher_ids "${idsCsv}"`;
      exec(command, { maxBuffer: 1024 * 1024 * 10, timeout: 120000 }, (error, stdout) => {
        if (error) {
          console.error(`[PyBaseball Arsenal] exec error: ${error.message}`);
          return resolve({});
        }
        try {
          const jsonStart = stdout.indexOf('{');
          const jsonStr = jsonStart >= 0 ? stdout.substring(jsonStart) : stdout;
          const parsed = JSON.parse(jsonStr);
          if (parsed.success && parsed.data) {
            console.log(`[PyBaseball Arsenal] OK — ${Object.keys(parsed.data).length} pitcher(s) con datos de arsenal`);
            resolve(parsed.data);
          } else {
            console.warn(`[PyBaseball Arsenal] Sin datos: ${parsed.error || 'desconocido'}`);
            resolve({});
          }
        } catch (e) {
          console.error('[PyBaseball Arsenal] Error parseando JSON:', stdout.slice(0, 200));
          resolve({});
        }
      });
    });
  });
};

/**
 * Obtiene métricas avanzadas por pitcher desde Python (Chase Rate, Spin Rate).
 */
export const getPitcherAdvancedMetrics = (pitcherIds: string[], startDate: string, endDate: string): Promise<Record<string, {
  spinRate: number | null;
  chasePct: number | null;
  stuffPlus: number | null;
}>> => {
  return withPerPitcherCache('pitcher_advanced_metrics', `${startDate}_${endDate}`, pitcherIds, (missingIds) => {
    return new Promise((resolve) => {
      const idsCsv = missingIds.join(',');
      const command = `"${PYTHON_BIN}" "${PYTHON_SCRIPT}" --action pitcher_advanced_metrics --start "${startDate}" --end "${endDate}" --pitcher_ids "${idsCsv}"`;
      exec(command, { maxBuffer: 1024 * 1024 * 10, timeout: 120000 }, (error, stdout) => {
        if (error) {
          console.error(`[PyBaseball Advanced] exec error: ${error.message}`);
          return resolve({});
        }
        try {
          const jsonStart = stdout.indexOf('{');
          const jsonStr = jsonStart >= 0 ? stdout.substring(jsonStart) : stdout;
          const parsed = JSON.parse(jsonStr);
          if (parsed.success && parsed.data) {
            console.log(`[PyBaseball Advanced] OK — ${Object.keys(parsed.data).length} pitcher(s) con métricas avanzadas`);
            resolve(parsed.data);
          } else {
            console.warn(`[PyBaseball Advanced] Sin datos: ${parsed.error || 'desconocido'}`);
            resolve({});
          }
        } catch (e) {
          console.error('[PyBaseball Advanced] Error parseando JSON:', stdout.slice(0, 200));
          resolve({});
        }
      });
    });
  });
};
