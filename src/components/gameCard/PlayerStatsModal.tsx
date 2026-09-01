/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Punto de entrada único para "click en un nombre → ventana con los números
 * disponibles", sin importar en qué pestaña de GameCard esté ese nombre
 * (Resumen General, Alineaciones o Boxscore). Decide qué modal mostrar según
 * dónde encuentre datos de ese jugador:
 *   1. Es el abridor registrado de ese lado (`game.pitchers[side]`) → el
 *      detalle completo de siempre (`PitcherStatsModal`, Totales/Promedios/
 *      Proyecciones) — el mismo que ya existía en Resumen General.
 *   2. Está en la alineación titular (`game.lineups[side]`) → detalle
 *      completo de bateador (`BatterStatsModal`: temporada, splits y
 *      últimos 7 días), sumándole la línea de este partido si ya jugó.
 *   3. No está en ninguna de las dos (relevista o suplente que solo aparece
 *      en el boxscore en vivo, p.ej. un pinch hitter) → una tarjeta reducida
 *      con lo único que hay disponible: su línea de este partido.
 *   4. Si ni siquiera eso hay, un aviso simple en vez de una ventana vacía.
 */

import React from "react";
import { X } from "lucide-react";
import { MLBGame } from "../../types";
import { PitcherStatsModal } from "./PitcherStatsModal";
import { BatterStatsModal } from "./BatterStatsModal";

interface PlayerStatsModalProps {
  game: MLBGame;
  side: "home" | "away";
  name: string;
  onClose: () => void;
}

const normalize = (s?: string | null) => (s || "").trim().toLowerCase();

const BoxscoreOnlyModal: React.FC<{
  name: string;
  side: "home" | "away";
  game: MLBGame;
  kind: "batter" | "pitcher";
  line: any;
  onClose: () => void;
}> = ({ name, side, game, kind, line, onClose }) => {
  const teamName = side === "home" ? game.metadata.homeTeam : game.metadata.awayTeam;
  const rows: Array<[string, any]> =
    kind === "pitcher"
      ? [
          ["IP", line.ip ?? "N/D"],
          ["H", line.h ?? 0],
          ["R", line.r ?? 0],
          ["ER", line.er ?? 0],
          ["BB", line.bb ?? 0],
          ["K", line.k ?? 0],
          ["Pitcheos", line.pitches ?? "N/D"],
        ]
      : [
          ["AB", line.ab ?? 0],
          ["Runs", line.r ?? 0],
          ["Hits", line.h ?? 0],
          ["RBI", line.rbi ?? 0],
          ["BB", line.bb ?? 0],
          ["K", line.k ?? 0],
          ["2B", line.doubles ?? 0],
          ["3B", line.triples ?? 0],
          ["HR", line.home_runs ?? 0],
          ["Bases totales", line.total_bases ?? 0],
        ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" onClick={() => onClose()}>
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {side === "home" ? "Local" : "Visitante"} · {teamName}
            </div>
            <h3 className="truncate text-lg font-display font-bold text-slate-900">{name}</h3>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Solo hay datos de este partido — no forma parte del abridor ni de la alineación titular registrada.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onClose()}
            className="shrink-0 rounded-md border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-900"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-1.5 px-5 py-4">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3 rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px]">
              <span className="text-slate-500">{label}</span>
              <strong className="text-slate-800 font-mono">{value}</strong>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const EmptyStatsModal: React.FC<{ name: string; onClose: () => void }> = ({ name, onClose }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" onClick={() => onClose()}>
    <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white shadow-2xl p-5 text-center" onClick={(e) => e.stopPropagation()}>
      <h3 className="text-base font-display font-bold text-slate-900 mb-1">{name}</h3>
      <p className="text-xs text-slate-500 mb-4">No hay estadísticas disponibles para este jugador todavía.</p>
      <button
        type="button"
        onClick={() => onClose()}
        className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700"
      >
        Cerrar
      </button>
    </div>
  </div>
);

export const PlayerStatsModal: React.FC<PlayerStatsModalProps> = ({ game, side, name, onClose }) => {
  const targetName = normalize(name);

  const starterPitcher = game.pitchers?.[side];
  if (starterPitcher && normalize(starterPitcher.name) === targetName) {
    return <PitcherStatsModal game={game} side={side} onClose={onClose} />;
  }

  const lineupBatter = game.lineups?.[side]?.find((p) => normalize(p.name) === targetName);
  if (lineupBatter) {
    const boxscoreLine = game.liveBoxscore?.[side]?.batters?.find((p: any) => normalize(p.name) === targetName) ?? null;
    return <BatterStatsModal game={game} side={side} batter={lineupBatter} boxscoreLine={boxscoreLine} onClose={onClose} />;
  }

  const boxscorePitcherLine = game.liveBoxscore?.[side]?.pitchers?.find((p: any) => normalize(p.name) === targetName);
  if (boxscorePitcherLine) {
    return <BoxscoreOnlyModal name={name} side={side} game={game} kind="pitcher" line={boxscorePitcherLine} onClose={onClose} />;
  }

  const boxscoreBatterLine = game.liveBoxscore?.[side]?.batters?.find((p: any) => normalize(p.name) === targetName);
  if (boxscoreBatterLine) {
    return <BoxscoreOnlyModal name={name} side={side} game={game} kind="batter" line={boxscoreBatterLine} onClose={onClose} />;
  }

  return <EmptyStatsModal name={name} onClose={onClose} />;
};

export default PlayerStatsModal;
