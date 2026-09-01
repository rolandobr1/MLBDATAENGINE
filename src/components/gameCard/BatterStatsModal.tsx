/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Modal de detalle de un bateador de la alineación titular (temporada,
 * splits vs mano y últimos 7 días) — mismo estilo/estructura que
 * `PitcherStatsModal.tsx`, pero para `BatterStats`. Si el jugador ya jugó
 * este partido, se le agrega arriba la línea de este encuentro tomada del
 * boxscore en vivo (`boxscoreLine`). Ver `PlayerStatsModal.tsx`, que decide
 * cuándo mostrar este modal en vez del de lanzador o el de solo-boxscore.
 */

import React from "react";
import { X } from "lucide-react";
import { MLBGame, BatterStats, LivePlayerStats } from "../../types";
import { formatOdds, formatNumber, formatPct, formatPitcherValue } from "./gameCardHelpers";

interface BatterStatsModalProps {
  game: MLBGame;
  side: "home" | "away";
  batter: BatterStats;
  boxscoreLine?: LivePlayerStats | null;
  onClose: () => void;
}

const MetricSection: React.FC<{ title: string; rows: Array<[string, any]> }> = ({ title, rows }) => (
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

export const BatterStatsModal: React.FC<BatterStatsModalProps> = ({ game, side, batter, boxscoreLine, onClose }) => {
  const teamName = side === "home" ? game.metadata.homeTeam : game.metadata.awayTeam;
  const opponentName = side === "home" ? game.metadata.awayTeam : game.metadata.homeTeam;

  const temporada: Array<[string, any]> = [
    ["Posición", batter.position],
    ["Orden al bate", batter.batting_order],
    ["AVG", typeof batter.avg === "number" ? batter.avg.toFixed(3) : batter.avg],
    ["OBP", formatNumber(batter.obp, 3)],
    ["SLG", formatNumber(batter.slg, 3)],
    ["OPS", typeof batter.ops === "number" ? batter.ops.toFixed(3) : batter.ops],
    ["wOBA", formatNumber(batter.woba, 3)],
    ["ISO", formatNumber(batter.iso, 3)],
    ["HR", batter.home_runs ?? batter.hr],
    ["RBI", batter.rbi],
    ["PA", batter.pa],
    ["Hits", batter.hits],
    ["2B / 3B", `${batter.doubles ?? 0} / ${batter.triples ?? 0}`],
    ["BB%", formatPct(batter.walk_pct)],
    ["K%", formatPct(batter.strikeout_pct ?? batter.kPct)],
  ];

  const splits: Array<[string, any]> = [
    ["OPS vs RHP", formatNumber(batter.ops_vs_rhp, 3)],
    ["OPS vs LHP", formatNumber(batter.ops_vs_lhp, 3)],
    ["SLG vs RHP", formatNumber(batter.slg_vs_rhp, 3)],
    ["SLG vs LHP", formatNumber(batter.slg_vs_lhp, 3)],
    ["K% vs RHP", formatPct(batter.k_pct_vs_rhp)],
    ["K% vs LHP", formatPct(batter.k_pct_vs_lhp)],
    ["Contact% vs RHP", formatPct(batter.contact_pct_vs_rhp)],
    ["Contact% vs LHP", formatPct(batter.contact_pct_vs_lhp)],
    ["Whiff%", formatPct(batter.whiff_pct)],
    ["Chase%", formatPct(batter.chase_pct)],
    ["Contact Stress Score", formatNumber(batter.batter_contact_stress_score, 1)],
  ];

  const ultimos7: Array<[string, any]> = [
    ["AVG Últ.7", formatNumber(batter.last7_avg, 3)],
    ["OPS Últ.7", formatNumber(batter.last7_ops, 3)],
    ["SLG Últ.7", formatNumber(batter.last7_slg, 3)],
    ["Hits Últ.7", batter.last7_hits],
    ["Bases totales Últ.7", batter.last7_total_bases],
    ["Extra-bases Últ.7", batter.last7_xbh],
  ];

  const props: Array<[string, any]> = [
    ["Línea Bases Totales", batter.totalBasesProp ?? "N/D"],
    ["Odds Over", formatOdds(batter.totalBasesPropOverOdds)],
    ["Odds Under", formatOdds(batter.totalBasesPropUnderOdds)],
    ["Casa de apuestas", batter.totalBasesPropBook || "N/D"],
    ["Fuente línea", batter.totalBasesPropSource || "N/D"],
    ["Tasa de acierto histórica", batter.totalBasesPropHitRateDisplay || "N/D"],
  ];

  const esteJuego: Array<[string, any]> | null = boxscoreLine
    ? [
        ["AB", boxscoreLine.ab ?? 0],
        ["Runs", boxscoreLine.r ?? 0],
        ["Hits", boxscoreLine.h ?? 0],
        ["RBI", boxscoreLine.rbi ?? 0],
        ["BB", boxscoreLine.bb ?? 0],
        ["K", boxscoreLine.k ?? 0],
        ["2B / 3B / HR", `${boxscoreLine.doubles ?? 0} / ${boxscoreLine.triples ?? 0} / ${boxscoreLine.home_runs ?? 0}`],
        ["Bases totales", boxscoreLine.total_bases ?? 0],
      ]
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" onClick={() => onClose()}>
      <div
        className="w-full max-w-5xl max-h-[88vh] overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {side === "home" ? "Local" : "Visitante"} · {teamName} vs {opponentName}
            </div>
            <h3 className="truncate text-lg font-display font-bold text-slate-900">
              {batter.name}
              <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 align-middle text-[11px] font-mono text-slate-600">
                {batter.bat_side || "R"} · {batter.position}
              </span>
            </h3>
          </div>
          <button
            type="button"
            onClick={() => onClose()}
            className="shrink-0 rounded-md border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-900"
            aria-label="Cerrar detalles del bateador"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-5 px-5 py-4">
          {esteJuego && <MetricSection title="Este Partido" rows={esteJuego} />}
          <MetricSection title="Temporada" rows={temporada} />
          <MetricSection title="Splits LHP/RHP" rows={splits} />
          <MetricSection title="Últimos 7 Días" rows={ultimos7} />
          <MetricSection title="Props / Bases Totales" rows={props} />
        </div>
      </div>
    </div>
  );
};

export default BatterStatsModal;
