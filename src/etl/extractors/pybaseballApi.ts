import { exec } from 'child_process';
import path from 'path';

// Since this is ES Modules, we use process.cwd() to get the path relative to the root
const PYTHON_SCRIPT = path.join(process.cwd(), 'src', 'etl', 'extractors', 'pybaseball_scraper.py');
const VENV_PYTHON = path.join(process.cwd(), 'venv', 'Scripts', 'python.exe');

export const getRecentStatcast = (startDate: string, endDate: string): Promise<any> => {
  return new Promise((resolve, reject) => {
    const command = `"${VENV_PYTHON}" "${PYTHON_SCRIPT}" --action recent_statcast --start "${startDate}" --end "${endDate}"`;
    
    exec(command, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
      if (error) {
        console.error(`exec error: ${error}`);
        return reject(error);
      }
      try {
        const jsonResponse = JSON.parse(stdout);
        resolve(jsonResponse);
      } catch (parseError) {
        console.error('Failed to parse Python output:', stdout);
        reject(parseError);
      }
    });
  });
};

export const getBvP = (batterId: string, pitcherId: string): Promise<any> => {
  return new Promise((resolve, reject) => {
    const command = `"${VENV_PYTHON}" "${PYTHON_SCRIPT}" --action bvp --batter "${batterId}" --pitcher "${pitcherId}"`;
    
    exec(command, { maxBuffer: 1024 * 1024 * 5 }, (error, stdout, stderr) => {
      if (error) {
        console.error(`exec error: ${error}`);
        return reject(error);
      }
      try {
        const jsonResponse = JSON.parse(stdout);
        resolve(jsonResponse);
      } catch (parseError) {
        console.error('Failed to parse Python output:', stdout);
        reject(parseError);
      }
    });
  });
};

export const getBatterSplits = (): Promise<any> => {
  return new Promise((resolve, reject) => {
    const command = `"${VENV_PYTHON}" "${PYTHON_SCRIPT}" --action batter_splits`;
    exec(command, { maxBuffer: 1024 * 1024 * 5 }, (error, stdout, stderr) => {
      if (error) return reject(error);
      try { resolve(JSON.parse(stdout)); } catch (e) { reject(e); }
    });
  });
};

export const getBullpenWorkload = (): Promise<any> => {
  return new Promise((resolve, reject) => {
    const command = `"${VENV_PYTHON}" "${PYTHON_SCRIPT}" --action bullpen`;
    exec(command, { maxBuffer: 1024 * 1024 * 5 }, (error, stdout, stderr) => {
      if (error) return reject(error);
      try { resolve(JSON.parse(stdout)); } catch (e) { reject(e); }
    });
  });
};
