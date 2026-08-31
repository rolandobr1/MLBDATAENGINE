/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Modal de detalle de lanzador (Totales / Promedios / Proyecciones).
 * Extraído de GameCard.tsx (Fase 6, punto 1 del plan de mejora) — antes vivía
 * inline dentro de GameCard y se activaba con el estado `selectedPitcherSide`;
 * ahora GameCard solo decide SI se muestra (pasa `side`/`onClose`), y este
 * componente calcula sus propios datos a partir de `game`.
 */

import React from "react";
import { X } from "lucide-react";
import { MLBGame } from "../../types";
import {
  calcKMinusBb,
  formatOdds,
  formatKPerIp,
  formatPitcherValue,
  formatNumber,
  formatPct,
  getPitcherRoleLabel,
} from "./gameCardHelpers";

interface PitcherStatsModalProps {
  game: MLBGame;
  side: "home" | "away";
  onClose: () => void;
}

const PitcherMetricSection: React.FC<{ title: string; rows: Array<[string, any]> }> = ({ title, rows }) => (
  <section className="min-w-0">
    <h4 className="text-[11px] font-display font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200 pb-1.5 mb-2">
      {title}
    </h4>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
      {rows.map(([label, value]) => (
        <div key={`${title}-${label}`} className="flex justify-between gap-3 rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px]">
          <span className="text-slate-500 truncate">{label}</span>
          <strong className="text-slate-800 font-mono text-right">{formatPitcherValue(value)}</strong>
        </div>
      ))}
    </div>
  </section>
);

export const PitcherStatsModal: React.FC<PitcherStatsModalProps> = ({ game, side, onClose }) => {
  const getPitcherModalData = () => {
    const pitcher = game.pitchers[side];
    const adv = game.advanced_pitching;
    const seasonAdv = side === "home" ? adv?.home : adv?.away;
    const last7 = side === "home" ? adv?.homeLast7 : adv?.awayLast7;
    const vsOpp = side === "home" ? adv?.homeVsOpp : adv?.awayVsOpp;
    const fatigue = game.fatigue_metrics?.pitchers?.[side];
    const teamName = side === "home" ? game.metadata.homeTeam : game.metadata.awayTeam;
    const opponentName = side === "home" ? game.metadata.awayTeam : game.metadata.homeTeam;
    const projected = seasonAdv?.projectedPitchCount;
    const projectedInnings = seasonAdv?.projectedInnings;
    const bfPerStart = seasonAdv?.battersFacedPerStart;
    const roleLabel = getPitcherRoleLabel(bfPerStart, projected);

    const totals = [
      ["Salidas", pitcher.starts],
      ["IP temporada", pitcher.ip],
      ["Ponches totales", pitcher.totalStrikeouts],
      ["Boletos totales", pitcher.totalWalks],
      ["Record", `${pitcher.wins ?? "N/D"}-${pitcher.losses ?? "N/D"}`],
      ["Ks reales hoy", seasonAdv?.actualStrikeouts],
    ];

    const averages = [
      ["ERA", typeof pitcher.era === "number" ? pitcher.era.toFixed(2) : pitcher.era],
      ["WHIP", typeof pitcher.whip === "number" ? pitcher.whip.toFixed(2) : pitcher.whip],
      ["K%", formatPct(pitcher.kPct)],
      ["BB%", formatPct(pitcher.bbPct)],
      ["K-BB%", calcKMinusBb(pitcher.kPct, pitcher.bbPct)],
      ["K/IP", formatKPerIp(pitcher)],
      ["FIP", formatNumber(seasonAdv?.fip, 2)],
      ["xFIP", formatNumber(seasonAdv?.xFip, 2)],
      ["SIERA", formatNumber(seasonAdv?.siera, 2)],
      ["xERA", formatNumber(seasonAdv?.xEra, 2)],
      ["SwStr%", formatPct(seasonAdv?.swingingStrikePct)],
      ["CSW%", formatPct(seasonAdv?.cswPct)],
      ["GB%", formatPct(seasonAdv?.groundBallPct)],
      ["FB%", formatPct(seasonAdv?.flyBallPct)],
      ["HardHit%", formatPct(seasonAdv?.hardHitPct)],
      ["Barrel%", formatPct(seasonAdv?.barrelPct)],
      ["Últ.5 K avg", formatNumber(seasonAdv?.last5KsAvg, 2)],
      ["Últ.5 IP avg", formatNumber(seasonAdv?.last5IpAvg, 1)],
      ["Últ.5 BF avg", formatNumber(seasonAdv?.last5BfAvg, 1)],
      ["Últ.5 pitcheos avg", formatNumber(seasonAdv?.last5PitchCountAvg, 0)],
      ["Vs rival K%", formatPct(vsOpp?.careerKPctVsTeam ?? vsOpp?.strikeoutRate)],
      ["Últ.3 vs rival K avg", formatNumber(seasonAdv?.last3VsTeamKsAvg, 2)],
      ["Últ.3 vs rival BF avg", formatNumber(seasonAdv?.last3VsTeamBfAvg, 1)],
    ];

    const projections = [
      ["Pitcheos proyectados", projected],
      ["Innings proyectados", formatNumber(projectedInnings, 1)],
      ["Rol estimado", roleLabel],
      ["BF/start", formatNumber(bfPerStart, 1)],
      ["Descanso", fatigue?.daysSinceLastStart != null ? `${fatigue.daysSinceLastStart} días` : "N/D"],
      ["Pitcheos última salida", fatigue?.pitchesLastStart],
      ["Pitcheos últimas 3", fatigue?.pitchesLast3Starts],
      ["Prom. últimas 3", fatigue?.pitchesLast3Starts != null ? formatNumber(Number(fatigue.pitchesLast3Starts) / 3, 1) : "N/D"],
      ["Línea Ks", pitcher.strikeoutProp ?? "N/D"],
      ["Odds Over Ks", formatOdds(pitcher.strikeoutPropOverOdds)],
      ["Odds Under Ks", formatOdds(pitcher.strikeoutPropUnderOdds)],
      ["Fuente línea Ks", pitcher.strikeoutPropSource || "N/D"],
      ["Fastball%", formatPct(seasonAdv?.fastballPct)],
      ["Slider%", formatPct(seasonAdv?.sliderPct)],
      ["Curve%", formatPct(seasonAdv?.curvePct)],
      ["Changeup%", formatPct(seasonAdv?.changeupPct)],
      ["Splitter%", formatPct(seasonAdv?.splitterPct)],
      ["Catcher", seasonAdv?.catcherName || "N/D"],
      ["Framing runs", formatNumber(seasonAdv?.catcherFramingRuns, 1)],
    ];

    return { pitcher, teamName, opponentName, last7, totals, averages, projections };
  };

  const selectedPitcherData = getPitcherModalData();

  return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" onClick={() => onClose()}>
          <div
            className="w-full max-w-5xl max-h-[88vh] overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4">
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {side === "home" ? "Local" : "Visitante"} · {selectedPitcherData.teamName} vs {selectedPitcherData.opponentName}
                </div>
                <h3 className="truncate text-lg font-display font-bold text-slate-900">
                  {selectedPitcherData.pitcher.name}
                  <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 align-middle text-[11px] font-mono text-slate-600">
                    {selectedPitcherData.pitcher.pitchHand || "R"}
                  </span>
                </h3>
              </div>
              <button
                type="button"
                onClick={() => onClose()}
                className="shrink-0 rounded-md border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                aria-label="Cerrar detalles del pitcher"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-5 px-5 py-4">
              <PitcherMetricSection title="Totales" rows={selectedPitcherData.totals} />
              <PitcherMetricSection title="Promedios" rows={selectedPitcherData.averages} />
              <PitcherMetricSection title="Proyecciones" rows={selectedPitcherData.projections} />
            </div>
          </div>
        </div>
  );
};

export default PitcherStatsModal;
