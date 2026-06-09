import { parse } from 'csv-parse/sync';

export interface PitcherSavantData {
  playerId: string;
  xERA: number | null;
  xwOBA: number | null;
  hardHitPct: number | null; // ev95percent
  barrelPct: number | null; // brl_percent
}

export interface BatterSavantData {
  playerId: string;
  xwOBA: number | null;
}

export class SavantCache {
  private pitcherStats: Map<string, PitcherSavantData> = new Map();
  private batterStats: Map<string, BatterSavantData> = new Map();
  private isLoaded: boolean = false;
  private currentYear: number = 0;

  async load(year: number) {
    if (this.isLoaded && this.currentYear === year) return;

    console.log(`[Savant] Descargando datos de Baseball Savant para el año ${year}...`);

    try {
      const [pitcherExpected, pitcherStatcast, batterExpected] = await Promise.all([
        this.fetchCSV(`https://baseballsavant.mlb.com/leaderboard/expected_statistics?type=pitcher&year=${year}&position=&team=&min=1&csv=true`),
        this.fetchCSV(`https://baseballsavant.mlb.com/leaderboard/statcast?type=pitcher&year=${year}&position=&team=&min=1&csv=true`),
        this.fetchCSV(`https://baseballsavant.mlb.com/leaderboard/expected_statistics?type=batter&year=${year}&position=&team=&min=1&csv=true`),
      ]);

      this.processPitcherData(pitcherExpected, pitcherStatcast);
      this.processBatterData(batterExpected);

      this.isLoaded = true;
      this.currentYear = year;
      console.log(`[Savant] Datos cargados exitosamente: ${this.pitcherStats.size} pitchers, ${this.batterStats.size} batters.`);
    } catch (error) {
      console.error("[Savant] Error cargando datos:", error);
    }
  }

  private async fetchCSV(url: string): Promise<any[]> {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Error fetching ${url}: ${res.statusText}`);
    }
    const text = await res.text();
    // Use csv-parse sync API
    const records = parse(text, {
      columns: true,
      skip_empty_lines: true,
      cast: true,
    });
    return records;
  }

  private processPitcherData(expectedData: any[], statcastData: any[]) {
    this.pitcherStats.clear();
    
    // Primero, cargar métricas esperadas
    for (const row of expectedData) {
      const playerId = String(row.player_id);
      this.pitcherStats.set(playerId, {
        playerId,
        xERA: row.xera ? parseFloat(row.xera) : null,
        xwOBA: row.est_woba ? parseFloat(row.est_woba) : null,
        hardHitPct: null,
        barrelPct: null
      });
    }

    // Luego, combinar métricas statcast (HardHit%, Barrel%)
    for (const row of statcastData) {
      const playerId = String(row.player_id);
      const existing = this.pitcherStats.get(playerId) || {
        playerId,
        xERA: null,
        xwOBA: null,
        hardHitPct: null,
        barrelPct: null
      };

      existing.hardHitPct = row.ev95percent ? parseFloat(row.ev95percent) : null;
      existing.barrelPct = row.brl_percent ? parseFloat(row.brl_percent) : null;
      
      this.pitcherStats.set(playerId, existing);
    }
  }

  private processBatterData(expectedData: any[]) {
    this.batterStats.clear();
    
    for (const row of expectedData) {
      const playerId = String(row.player_id);
      this.batterStats.set(playerId, {
        playerId,
        xwOBA: row.est_woba ? parseFloat(row.est_woba) : null,
      });
    }
  }

  getPitcher(playerId: string | number): PitcherSavantData | null {
    return this.pitcherStats.get(String(playerId)) || null;
  }

  getBatter(playerId: string | number): BatterSavantData | null {
    return this.batterStats.get(String(playerId)) || null;
  }
}

// Singleton export para usar en toda la aplicación
export const savantCache = new SavantCache();
