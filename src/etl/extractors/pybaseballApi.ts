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
