/**
 * ⚠️ ARCHIVADO / NO USADO EN PRODUCCIÓN (Fase 4, punto 3 del plan de mejora).
 *
 * Solo lo importa `src/workflow.ts` (también archivado). Nota: NO confundir
 * con `src/etl/transformers/vortexMetrics.ts`, que sí está vivo (lo importan
 * `server.ts` y `src/utils.ts`) — la carpeta `transformers/` tiene archivos
 * vivos y muertos mezclados, no se puede archivar la carpeta entera.
 *
 * Se deja en su lugar porque esta sesión no puede mover/eliminar archivos
 * en tu máquina — ver el mensaje de la Fase 4 para el comando manual.
 */
import { z, ZodError } from 'zod';

export const pitcherSchema = z.object({
  name: z.string().min(1),
  era: z.number().min(0).max(30).nullable(), // ERA can be null if it's start of season
  whip: z.number().min(0).max(5).nullable(),
  xERA: z.number().min(0).max(30).nullable(),
  fip: z.number().min(0).max(30).nullable(),
  k_pct: z.number().min(0).max(100).nullable(),
  bb_pct: z.number().min(0).max(100).nullable(),
});

export const gameSchema = z.object({
  metadata: z.object({
    game_id: z.string(),
    date: z.string(),
    time_et: z.string(),
    home_team: z.string(),
    away_team: z.string(),
    stadium: z.string(),
  }),
  pitchers: z.object({
    home_starter: pitcherSchema.nullable(),
    away_starter: pitcherSchema.nullable(),
  }),
  betting_lines: z.object({
    current: z.object({
      home_ml: z.number().min(-2000).max(2000).nullable(),
      away_ml: z.number().min(-2000).max(2000).nullable(),
      total: z.number().min(5).max(15).nullable(),
    }).optional()
  })
  // Se pueden agregar más esquemas (bullpen, offense, etc.)
}).passthrough();

export const validateGameData = (data: any) => {
  try {
    const validData = gameSchema.parse(data);
    return { success: true, data: validData };
  } catch (error) {
    if (error instanceof ZodError) {
      console.error('Data validation failed:', (error as ZodError).issues);
      return { success: false, errors: (error as ZodError).issues };
    }
    throw error;
  }
};
