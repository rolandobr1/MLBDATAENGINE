import fs from 'fs';
import path from 'path';

export interface ParkFactors {
  venue_id: string;
  venue_name: string;
  index_runs: number;
  index_so: number;
  index_hr: number;
}

export class ParkFactorsScraper {
  private cacheDir: string;
  private cacheFile: string;
  private parkFactorsData: Map<string, ParkFactors> = new Map();
  private isLoaded: boolean = false;

  constructor() {
    this.cacheDir = path.join(process.cwd(), 'cache');
    this.cacheFile = path.join(this.cacheDir, 'park_factors.json');
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  async load() {
    if (this.isLoaded) return;

    try {
      // Intentar cargar desde cache
      if (fs.existsSync(this.cacheFile)) {
        const stats = fs.statSync(this.cacheFile);
        const daysOld = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60 * 24);
        
        // Cache es válido por 7 días
        if (daysOld < 7) {
          const rawData = fs.readFileSync(this.cacheFile, 'utf8');
          const parsedData = JSON.parse(rawData);
          this.populateMap(parsedData);
          console.log(`[ParkFactors] Cargado desde caché (${this.parkFactorsData.size} estadios).`);
          this.isLoaded = true;
          return;
        }
      }

      console.log(`[ParkFactors] Descargando Park Factors actualizados desde Baseball Savant...`);
      const res = await fetch(`https://baseballsavant.mlb.com/leaderboard/statcast-park-factors`);
      if (!res.ok) {
        throw new Error(`Error fetching park factors: ${res.statusText}`);
      }
      const text = await res.text();
      const match = text.match(/var data = (\[.*?\]);/);
      if (match) {
        const data = JSON.parse(match[1]);
        
        fs.writeFileSync(this.cacheFile, JSON.stringify(data, null, 2));
        this.populateMap(data);
        this.isLoaded = true;
        console.log(`[ParkFactors] Datos descargados y guardados en caché (${this.parkFactorsData.size} estadios).`);
      } else {
        throw new Error("No se pudo encontrar el JSON en el HTML de Savant.");
      }
    } catch (error) {
      console.error("[ParkFactors] Error cargando Park Factors:", error);
      // Fallback a memoria vacía
      this.isLoaded = true;
    }
  }

  private populateMap(data: any[]) {
    this.parkFactorsData.clear();
    for (const item of data) {
      // Filtrar a la métrica agregada más reciente y de bateadores en general ("All")
      if (item.key_bat_side === 'All' && String(item.key_is_year_rolling) === '1') {
        const venue = String(item.venue_name).toLowerCase().trim();
        this.parkFactorsData.set(venue, {
          venue_id: item.venue_id,
          venue_name: item.venue_name,
          index_runs: parseInt(item.index_runs, 10) || 100,
          index_so: parseInt(item.index_so, 10) || 100,
          index_hr: parseInt(item.index_hr, 10) || 100,
        });
      }
    }
  }

  getParkFactors(venueName: string): ParkFactors | null {
    if (!venueName) return null;
    let name = venueName.toLowerCase().trim();
    
    // Normalizaciones de nombres si es necesario (ej. "Oriole Park at Camden Yards" -> "Oriole Park")
    if (name.includes("camden yards")) name = "oriole park at camden yards";
    if (name.includes("loandepot")) name = "loandepot park";
    if (name.includes("guaranteed rate")) name = "guaranteed rate field";
    if (name.includes("american family")) name = "american family field";

    const data = this.parkFactorsData.get(name);
    if (data) return data;

    // Si no lo encuentra directo, buscar por subcadena
    for (const [key, val] of this.parkFactorsData.entries()) {
      if (key.includes(name) || name.includes(key)) {
        return val;
      }
    }
    
    return null;
  }
}

// Singleton export
export const parkFactorsScraper = new ParkFactorsScraper();
