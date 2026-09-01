/**
 * kPropsLineHistoryRoutes.ts
 *
 * Expone el refresco periódico de líneas de K's (ver `kPropsLineRefresher.ts`)
 * como endpoint HTTP para un Cron Job de Render, con el mismo esquema de
 * autenticación por `CRON_SECRET` que ya usa `/api/cron/run-daily-pipeline`
 * (ver `cronPipelineRoutes.ts` y `RENDER_CRON_SETUP.md`), más la descarga en
 * CSV del historial de cambios acumulado.
 */

import type { Express, Request, Response } from "express";
import { refreshPitcherKPropLinesForDate, KPropsRefresherDeps } from "../services/kPropsLineRefresher";
import { getLineHistory, generateKPropsLineHistoryCSV } from "../services/kPropsLineHistory";

export interface KPropsLineHistoryRouteDeps extends KPropsRefresherDeps {
  getNewYorkDateString: () => string;
}

export function registerKPropsLineHistoryRoutes(app: Express, deps: KPropsLineHistoryRouteDeps): void {
  app.post("/api/cron/refresh-k-props-lines", async (req: Request, res: Response) => {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
      res.status(503).json({ error: "CRON_SECRET no está configurado en el servidor; este endpoint está deshabilitado por seguridad hasta que se configure." });
      return;
    }
    if (req.headers["x-cron-secret"] !== secret) {
      res.status(401).json({ error: "No autorizado." });
      return;
    }

    const date = typeof req.body?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.body.date)
      ? req.body.date
      : deps.getNewYorkDateString();

    try {
      const summary = await refreshPitcherKPropLinesForDate(date, deps);
      console.log(`[KPropsLineHistory] Refresco para ${date}: ${summary.changesDetected} cambio(s) detectado(s) sobre ${summary.gamesChecked} juego(s).`);
      res.status(200).json(summary);
    } catch (err) {
      console.error(`[KPropsLineHistory] Error refrescando líneas de K's para ${date}:`, err);
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  /** Historial de cambios en JSON — útil para inspección manual rápida. */
  app.get("/api/props/k-line-history", (req: Request, res: Response) => {
    const date = typeof req.query.date === "string" ? req.query.date : undefined;
    const limit = Number(req.query.limit) || undefined;
    res.json({ changes: getLineHistory({ date, limit }) });
  });

  /** Mismo historial, como CSV descargable — pensado para el botón en el panel de datasets. */
  app.get("/api/props/k-line-history/csv", (req: Request, res: Response) => {
    const date = typeof req.query.date === "string" ? req.query.date : undefined;
    const records = getLineHistory({ date });
    const csvContent = generateKPropsLineHistoryCSV(records);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=k_props_line_history_${date || "all"}.csv`);
    res.send(csvContent);
  });
}
