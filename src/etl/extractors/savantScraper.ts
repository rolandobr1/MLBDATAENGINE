import { parse } from 'csv-parse/sync';

export interface PitcherSavantData {
  playerId: string;
  xERA: number | null;
  xwOBA: number | null;
  hardHitPct: number | null; // ev95percent
  barrelPct: number | null; // brl_percent
  fastballPct: number;
  sliderPct: number;
  curvePct: number;
  changeupPct: number;
  splitterPct: number;
}

export interface BatterSavantData {
  playerId: string;
  xwOBA: number | null;
  hardHitPct: number | null;
  barrelPct: number | null;
  chasePct: number | null;
  whiffPct: number | null;
  whiffPctVsFastball: number | null;
  whiffPctVsSlider: number | null;
  whiffPctVsCurve: number | null;
  whiffPctVsChangeup: number | null;
  whiffPctVsSplitter: number | null;
}

export interface CatcherSavantData {
  playerId: string; // The catcher's player id
  framingRuns: number | null;
}

export class SavantCache {
  private pitcherStats: Map<string, PitcherSavantData> = new Map();
  private batterStats: Map<string, BatterSavantData> = new Map();
  private catcherStats: Map<string, CatcherSavantData> = new Map();
  private isLoaded: boolean = false;
  private currentYear: number = 0;

  async load(year: number) {
    if (this.isLoaded && this.currentYear === year) return;

    console.log(`[Savant] Descargando datos de Baseball Savant para el año ${year}...`);

    try {
      const [
        pitcherExpected, 
        pitcherStatcast, 
        batterExpected, 
        batterStatcast,
        pitcherArsenal,
        batterArsenal,
        catcherFraming
      ] = await Promise.all([
        this.fetchCSV(`https://baseballsavant.mlb.com/leaderboard/expected_statistics?type=pitcher&year=${year}&position=&team=&min=1&csv=true`),
        this.fetchCSV(`https://baseballsavant.mlb.com/leaderboard/statcast?type=pitcher&year=${year}&position=&team=&min=1&csv=true`),
        this.fetchCSV(`https://baseballsavant.mlb.com/leaderboard/expected_statistics?type=batter&year=${year}&position=&team=&min=1&csv=true`),
        this.fetchCSV(`https://baseballsavant.mlb.com/leaderboard/statcast?type=batter&year=${year}&position=&team=&min=1&csv=true`),
        this.fetchCSV(`https://baseballsavant.mlb.com/leaderboard/pitch-arsenal-stats?type=pitcher&year=${year}&team=&min=10&csv=true`),
        this.fetchCSV(`https://baseballsavant.mlb.com/leaderboard/pitch-arsenal-stats?type=batter&year=${year}&team=&min=10&csv=true`),
        this.fetchCSV(`https://baseballsavant.mlb.com/leaderboard/catcher-framing?year=${year}&csv=true`),
      ]);

      this.processPitcherData(pitcherExpected, pitcherStatcast, pitcherArsenal);
      this.processBatterData(batterExpected, batterStatcast, batterArsenal);
      this.processCatcherData(catcherFraming);

      this.isLoaded = true;
      this.currentYear = year;
      console.log(`[Savant] Datos cargados exitosamente: ${this.pitcherStats.size} pitchers, ${this.batterStats.size} batters, ${this.catcherStats.size} catchers.`);
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

  private parseNumber(value: any): number | null {
    const parsed = parseFloat(String(value));
    return Number.isFinite(parsed) ? parsed : null;
  }

  private groupPitchType(pitchName: string): "fastball" | "slider" | "curve" | "changeup" | "splitter" | "other" {
    const name = pitchName?.toLowerCase() || "";
    if (name.includes("fastball") || name.includes("sinker") || name.includes("cutter")) return "fastball";
    if (name.includes("slider") || name.includes("sweeper") || name.includes("slurve")) return "slider";
    if (name.includes("curve")) return "curve";
    if (name.includes("changeup")) return "changeup";
    if (name.includes("split") || name.includes("fork")) return "splitter";
    return "other";
  }

  private processPitcherData(expectedData: any[], statcastData: any[], arsenalData: any[]) {
    this.pitcherStats.clear();
    
    // Primero, cargar métricas esperadas
    for (const row of expectedData) {
      const playerId = String(row.player_id);
      this.pitcherStats.set(playerId, {
        playerId,
        xERA: this.parseNumber(row.xera),
        xwOBA: this.parseNumber(row.est_woba),
        hardHitPct: null,
        barrelPct: null,
        fastballPct: 0,
        sliderPct: 0,
        curvePct: 0,
        changeupPct: 0,
        splitterPct: 0,
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
        barrelPct: null,
        fastballPct: 0,
        sliderPct: 0,
        curvePct: 0,
        changeupPct: 0,
        splitterPct: 0,
      };

      existing.hardHitPct = this.parseNumber(row.ev95percent);
      existing.barrelPct = this.parseNumber(row.brl_percent);
      
      this.pitcherStats.set(playerId, existing);
    }

    // Arsenal Data
    for (const row of arsenalData) {
      const playerId = String(row.player_id);
      const existing = this.pitcherStats.get(playerId);
      if (!existing) continue;

      const group = this.groupPitchType(row.pitch_name);
      const usage = this.parseNumber(row.pitch_usage) || 0;

      if (group === "fastball") existing.fastballPct += usage;
      if (group === "slider") existing.sliderPct += usage;
      if (group === "curve") existing.curvePct += usage;
      if (group === "changeup") existing.changeupPct += usage;
      if (group === "splitter") existing.splitterPct += usage;
    }
  }

  private processBatterData(expectedData: any[], statcastData: any[], arsenalData: any[]) {
    this.batterStats.clear();
    
    for (const row of expectedData) {
      const playerId = String(row.player_id);
      this.batterStats.set(playerId, {
        playerId,
        xwOBA: this.parseNumber(row.est_woba),
        hardHitPct: null,
        barrelPct: null,
        chasePct: null,
        whiffPct: null,
        whiffPctVsFastball: null,
        whiffPctVsSlider: null,
        whiffPctVsCurve: null,
        whiffPctVsChangeup: null,
        whiffPctVsSplitter: null,
      });
    }

    for (const row of statcastData) {
      const playerId = String(row.player_id);
      const existing = this.batterStats.get(playerId) || {
        playerId,
        xwOBA: null,
        hardHitPct: null,
        barrelPct: null,
        chasePct: null,
        whiffPct: null,
        whiffPctVsFastball: null,
        whiffPctVsSlider: null,
        whiffPctVsCurve: null,
        whiffPctVsChangeup: null,
        whiffPctVsSplitter: null,
      };

      existing.hardHitPct = this.parseNumber(row.ev95percent);
      existing.barrelPct = this.parseNumber(row.brl_percent);
      existing.chasePct = this.parseNumber(row.oz_swing_percent);
      existing.whiffPct = this.parseNumber(row.whiff_percent);

      this.batterStats.set(playerId, existing);
    }

    // Arsenal Data for Batters (Whiff Pct by Pitch Type)
    const tempGroupWhiffs: Record<string, Record<string, {totalWhiff: number, count: number}>> = {};
    const tempOverallWhiffs: Record<string, {totalWhiff: number, count: number}> = {};

    for (const row of arsenalData) {
      const playerId = String(row.player_id);
      if (!this.batterStats.has(playerId)) continue;
      
      const group = this.groupPitchType(row.pitch_name);
      const whiff = this.parseNumber(row.whiff_percent);
      
      if (group !== "other" && whiff !== null) {
        if (!tempGroupWhiffs[playerId]) tempGroupWhiffs[playerId] = {};
        if (!tempGroupWhiffs[playerId][group]) tempGroupWhiffs[playerId][group] = { totalWhiff: 0, count: 0 };
        
        const pitches = this.parseNumber(row.pitches) || 1;
        if (!tempOverallWhiffs[playerId]) tempOverallWhiffs[playerId] = { totalWhiff: 0, count: 0 };
        tempOverallWhiffs[playerId].totalWhiff += (whiff * pitches);
        tempOverallWhiffs[playerId].count += pitches;
        tempGroupWhiffs[playerId][group].totalWhiff += (whiff * pitches);
        tempGroupWhiffs[playerId][group].count += pitches;
      }
    }

    for (const [playerId, groups] of Object.entries(tempGroupWhiffs)) {
      const existing = this.batterStats.get(playerId);
      if (existing) {
        const overall = tempOverallWhiffs[playerId];
        if (existing.whiffPct === null && overall?.count > 0) {
          existing.whiffPct = overall.totalWhiff / overall.count;
        }
        if (groups["fastball"]) existing.whiffPctVsFastball = groups["fastball"].totalWhiff / groups["fastball"].count;
        if (groups["slider"]) existing.whiffPctVsSlider = groups["slider"].totalWhiff / groups["slider"].count;
        if (groups["curve"]) existing.whiffPctVsCurve = groups["curve"].totalWhiff / groups["curve"].count;
        if (groups["changeup"]) existing.whiffPctVsChangeup = groups["changeup"].totalWhiff / groups["changeup"].count;
        if (groups["splitter"]) existing.whiffPctVsSplitter = groups["splitter"].totalWhiff / groups["splitter"].count;
      }
    }
  }

  private processCatcherData(catcherData: any[]) {
    this.catcherStats.clear();
    for (const row of catcherData) {
      const playerId = String(row.id);
      this.catcherStats.set(playerId, {
        playerId,
        framingRuns: this.parseNumber(row.rv_tot)
      });
    }
  }

  getPitcher(playerId: string | number): PitcherSavantData | null {
    return this.pitcherStats.get(String(playerId)) || null;
  }

  getBatter(playerId: string | number): BatterSavantData | null {
    return this.batterStats.get(String(playerId)) || null;
  }

  getCatcher(playerId: string | number): CatcherSavantData | null {
    return this.catcherStats.get(String(playerId)) || null;
  }
}

// Singleton export para usar en toda la aplicación
export const savantCache = new SavantCache();
