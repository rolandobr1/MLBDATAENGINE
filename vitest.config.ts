/**
 * vitest.config.ts — Fase 4, punto 6 del plan de mejora.
 *
 * El proyecto ya tenía un script "test" en package.json que corre 8 archivos
 * sueltos (`tsx src/utils/lineupMetrics.test.ts`, `tsx src/datasets/klab*.test.ts`)
 * con aserciones manuales, del trabajo de "klab". Eso sigue intacto — este
 * cambio no lo toca ni lo reemplaza. Lo que no había era un framework de
 * pruebas real con `expect()`/`describe()` para el código de este plan de
 * mejora (isFinalGameStatus, validateDataset, los generadores de CSV).
 *
 * Vitest se agrega COMO ADICIÓN: "test" ahora corre primero la nueva suite
 * de Vitest (`test:unit`) y después la suite de klab que ya existía
 * (`test:klab`), en ese orden — ver package.json. Nada de lo que ya corría
 * se quitó.
 *
 * Esta configuración es intencionalmente mínima: Vitest ya detecta archivos
 * `*.test.ts` en todo el proyecto por convención (incluyendo los de klab,
 * aunque esos siguen corriendo también por su cuenta vía tsx en
 * `test:klab` — correrlos dos veces no rompe nada, solo es redundante; si en
 * algún momento se quiere evitar esa redundancia, se puede excluir
 * `src/datasets/**` acá). Lo único que se fija explícitamente es el entorno
 * (Node, no jsdom/browser — este es un backend) y que se excluyan los
 * `node_modules` y `dist` de siempre.
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      // Los scripts de "klab" (src/datasets/*.test.ts, src/utils/lineupMetrics.test.ts)
      // NO usan la API de Vitest (nada de describe/it/expect) — son scripts sueltos con
      // aserciones manuales (`throw new Error(...)`) pensados para correr solos con
      // `tsx` (ver "test:klab" en package.json), y varios leen archivos de datos reales
      // como mlb_pregame_snapshots.json desde process.cwd(). Si Vitest los recolectara
      // igual por el patrón de nombre *.test.ts, fallarían en la fase de "collect"
      // (no en la de test) apenas cargar el módulo — se excluyen a propósito acá.
      "src/datasets/**",
      "src/utils/lineupMetrics.test.ts",
    ],
  },
});
