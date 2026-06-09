import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";

export interface FangraphsTeamBattingData {
  teamName: string;
  wrcPlus: number | null;
}

const TEAM_ALIASES: Record<string, string[]> = {
  "angels": ["los angeles angels", "la angels", "anaheim angels", "laa"],
  "astros": ["houston astros", "hou"],
  "athletics": ["oakland athletics", "athletics", "a's", "las vegas athletics", "oak", "ath"],
  "blue jays": ["toronto blue jays", "tor"],
  "braves": ["atlanta braves", "atl"],
  "brewers": ["milwaukee brewers", "mil"],
  "cardinals": ["st. louis cardinals", "saint louis cardinals", "stl"],
  "cubs": ["chicago cubs", "chc"],
  "diamondbacks": ["arizona diamondbacks", "d-backs", "dbacks", "ari"],
  "dodgers": ["los angeles dodgers", "la dodgers", "lad"],
  "giants": ["san francisco giants", "sf", "sfg"],
  "guardians": ["cleveland guardians", "cle"],
  "mariners": ["seattle mariners", "sea"],
  "marlins": ["miami marlins", "mia"],
  "mets": ["new york mets", "ny mets", "nym"],
  "nationals": ["washington nationals", "wsh", "was"],
  "orioles": ["baltimore orioles", "bal"],
  "padres": ["san diego padres", "sd", "sdp"],
  "phillies": ["philadelphia phillies", "phi"],
  "pirates": ["pittsburgh pirates", "pit"],
  "rangers": ["texas rangers", "tex"],
  "rays": ["tampa bay rays", "tb", "tbr"],
  "red sox": ["boston red sox", "bos"],
  "reds": ["cincinnati reds", "cin"],
  "rockies": ["colorado rockies", "col"],
  "royals": ["kansas city royals", "kc", "kcr"],
  "tigers": ["detroit tigers", "det"],
  "twins": ["minnesota twins", "min"],
  "white sox": ["chicago white sox", "chw"],
  "yankees": ["new york yankees", "ny yankees", "nyy"]
};

export class FangraphsCache {
  private teamWrcPlus: Map<string, number> = new Map();
  private isLoaded = false;
  private currentYear = 0;

  async load(year: number) {
    if (this.isLoaded && this.currentYear === year) return;

    this.teamWrcPlus.clear();
    this.currentYear = year;

    if (this.loadFromCache(year)) {
      this.isLoaded = true;
      console.log(`[FanGraphs] wRC+ cargado desde cache: ${this.teamWrcPlus.size} equipos.`);
      return;
    }

    try {
      const records = await this.fetchTeamBatting(year);
      this.processTeamRows(records);

      if (this.teamWrcPlus.size > 0) {
        this.saveToCache(year);
        this.isLoaded = true;
        console.log(`[FanGraphs] wRC+ cargado exitosamente: ${this.teamWrcPlus.size} equipos.`);
      } else {
        console.warn("[FanGraphs] No se encontraron valores de wRC+ en la respuesta.");
      }
    } catch (error) {
      console.warn("[FanGraphs] No se pudo cargar wRC+ de equipos:", error);
    }
  }

  getTeamWrcPlus(teamName: string): number | null {
    const normalized = this.normalizeTeamName(teamName);
    return this.teamWrcPlus.get(normalized) ?? null;
  }

  private cacheFile(year: number): string {
    return path.join(process.cwd(), `fangraphs_team_batting_${year}.json`);
  }

  private loadFromCache(year: number): boolean {
    const file = this.cacheFile(year);
    if (!fs.existsSync(file)) return false;

    try {
      const rows = JSON.parse(fs.readFileSync(file, "utf-8"));
      this.processTeamRows(Array.isArray(rows) ? rows : []);
      return this.teamWrcPlus.size > 0;
    } catch (error) {
      console.warn(`[FanGraphs] Cache invalido ignorado: ${file}`, error);
      return false;
    }
  }

  private saveToCache(year: number) {
    const rows = Array.from(this.teamWrcPlus.entries()).map(([teamName, wrcPlus]) => ({
      teamName,
      wrcPlus
    }));
    fs.writeFileSync(this.cacheFile(year), JSON.stringify(rows, null, 2));
  }

  private async fetchTeamBatting(year: number): Promise<any[]> {
    const apiUrl = `https://www.fangraphs.com/api/leaders/major-league/data?pos=all&stats=bat&lg=all&qual=y&type=8&season=${year}&season1=${year}&ind=0&team=0%2Cts&pageitems=200&pagenum=1`;
    const csvUrl = `https://www.fangraphs.com/leaders-legacy.aspx?pos=all&stats=bat&lg=all&qual=y&type=8&season=${year}&month=0&season1=${year}&ind=0&team=0,ts&rost=0&age=0,100&filter=&players=&page=1_1000000&csv=1`;

    for (const url of [apiUrl, csvUrl]) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      let res: Response;
      try {
        res = await fetch(url, {
          signal: controller.signal,
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36",
            "Referer": "https://www.fangraphs.com/leaders/major-league?stats=bat&team=0%2Cts&type=8"
          }
        });
      } catch (error) {
        console.warn(`[FanGraphs] Error consultando ${url}:`, error);
        continue;
      } finally {
        clearTimeout(timeout);
      }

      if (!res.ok) {
        console.warn(`[FanGraphs] ${res.status} al consultar ${url}`);
        continue;
      }

      const text = await res.text();
      const trimmed = text.trim();
      if (!trimmed) continue;

      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        return this.extractRowsFromJson(JSON.parse(trimmed));
      }

      if (trimmed.includes("<table") || trimmed.includes("<html")) {
        return this.extractRowsFromHtml(trimmed);
      }

      return parse(trimmed, {
        columns: true,
        skip_empty_lines: true,
        cast: true
      });
    }

    return [];
  }

  private extractRowsFromHtml(html: string): any[] {
    const tableMatch = html.match(/<table[^>]*(?:rgMasterTable|leaders)[^>]*>[\s\S]*?<\/table>/i);
    const tableHtml = tableMatch?.[0] || html;
    const headerMatches = Array.from(tableHtml.matchAll(/<th[^>]*>[\s\S]*?<\/th>/gi));
    const headers = headerMatches
      .map((match) => this.cleanHtmlText(match[0]))
      .filter(Boolean);

    if (headers.length === 0) return [];

    const bodyMatch = tableHtml.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
    const bodyHtml = bodyMatch?.[1] || tableHtml;
    const rowMatches = Array.from(bodyHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi));

    return rowMatches
      .map((rowMatch) => {
        const cells = Array.from(rowMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi))
          .map((cellMatch) => this.cleanHtmlText(cellMatch[1]));
        const offset = cells.length === headers.length + 1 ? 1 : 0;
        return headers.reduce((row: any, header, index) => {
          row[header] = cells[index + offset] ?? "";
          return row;
        }, {});
      })
      .filter((row) => Object.values(row).some((value) => String(value).trim() !== ""));
  }

  private extractRowsFromJson(payload: any): any[] {
    if (Array.isArray(payload)) return payload;
    for (const key of ["data", "leaders", "rows", "results"]) {
      if (Array.isArray(payload?.[key])) return payload[key];
    }
    return [];
  }

  private processTeamRows(rows: any[]) {
    for (const row of rows) {
      const teamName = this.extractTeamName(row);
      const wrcPlus = this.extractWrcPlus(row);
      if (!teamName || wrcPlus === null) continue;

      this.setTeamValue(teamName, wrcPlus);
    }
  }

  private setTeamValue(teamName: string, wrcPlus: number) {
    const normalized = this.normalizeTeamName(teamName);
    this.teamWrcPlus.set(normalized, wrcPlus);

    for (const [shortName, aliases] of Object.entries(TEAM_ALIASES)) {
      const normalizedAliases = aliases.map((alias) => this.normalizeTeamName(alias));
      if (normalized === shortName || normalizedAliases.includes(normalized)) {
        this.teamWrcPlus.set(shortName, wrcPlus);
        for (const alias of normalizedAliases) this.teamWrcPlus.set(alias, wrcPlus);
      }
    }
  }

  private extractTeamName(row: any): string | null {
    const value =
      row.TeamName ??
      row.Team ??
      row.team ??
      row.Name ??
      row.name ??
      row.teamName ??
      row.TeamNameAbb ??
      row.TeamNameShort;

    if (typeof value === "string") return value;
    if (value?.name) return String(value.name);
    return null;
  }

  private cleanHtmlText(value: string): string {
    return value
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, "\"")
      .replace(/\s+/g, " ")
      .trim();
  }

  private extractWrcPlus(row: any): number | null {
    const value =
      row["wRC+"] ??
      row.wRCPlus ??
      row.WRCPlus ??
      row.wrcPlus ??
      row.wrc_plus ??
      row.WRC_PLUS ??
      row["WRC+"];

    const parsed = parseFloat(String(value));
    return Number.isFinite(parsed) ? Math.round(parsed) : null;
  }

  private normalizeTeamName(teamName: string): string {
    return String(teamName)
      .toLowerCase()
      .replace(/&amp;/g, "&")
      .replace(/[^a-z0-9\s']/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
}

export const fangraphsCache = new FangraphsCache();
