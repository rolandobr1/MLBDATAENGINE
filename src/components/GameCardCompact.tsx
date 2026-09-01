/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * GameCardCompact — versión ultra-reducida de `GameCard`, pensada para la
 * "Vista Compacta" del panel de juegos: un mini-marcador (logo + abreviación
 * + carrera/hora) por juego, para que quepan todos los juegos del día en una
 * sola cuadrícula sin necesidad de hacer scroll ni de expandir/contraer cada
 * tarjeta una por una. Al hacer click, `App.tsx` cambia a la Vista Completa y
 * hace scroll hasta la tarjeta detallada de ese juego (ver `focusRequest` en
 * `App.tsx` y el prop `focusRequest` de `GameCard`).
 */

import React from "react";
import { MLBGame } from "../types";
import { getTeamLogo, getTeamAbbr } from "../utils/teamLogos";
import { Pin } from "lucide-react";

interface GameCardCompactProps {
  game: MLBGame;
  isPinned?: boolean;
  onSelect: (gameId: string) => void;
}

const TeamRow: React.FC<{ teamName: string; score: number | null }> = ({ teamName, score }) => {
  const logo = getTeamLogo(teamName);
  return (
    <div className="flex items-center justify-between gap-1 w-full">
      <div className="flex items-center gap-1.5 min-w-0">
        {logo ? (
          <img src={logo} alt={teamName} className="w-5 h-5 object-contain shrink-0" />
        ) : (
          <div className="w-5 h-5 rounded-full bg-slate-200 shrink-0" />
        )}
        <span className="text-[11px] font-display font-bold text-slate-700 truncate">
          {getTeamAbbr(teamName)}
        </span>
      </div>
      {score !== null && (
        <span className="text-sm font-mono font-bold text-slate-900 tabular-nums shrink-0">{score}</span>
      )}
    </div>
  );
};

export const GameCardCompact: React.FC<GameCardCompactProps> = ({ game, isPinned, onSelect }) => {
  const status = game.game_result?.gameStatus || "Scheduled";
  const hasStarted = !!game.game_result && !["Scheduled", "Pre-Game", "Warmup"].includes(status);
  const awayScore = hasStarted ? (game.linescore?.awayTotals?.runs ?? game.game_result?.awayScore ?? null) : null;
  const homeScore = hasStarted ? (game.linescore?.homeTotals?.runs ?? game.game_result?.homeScore ?? null) : null;
  const isFinal = status.includes("Final") || status === "Game Over";
  const isLive = hasStarted && !isFinal;

  let badgeLabel: string;
  let badgeClass: string;
  if (isFinal) {
    badgeLabel = "Final";
    badgeClass = "bg-slate-800 text-slate-100";
  } else if (isLive) {
    badgeLabel = game.linescore?.currentInning
      ? `${game.linescore.inningHalf === "Top" ? "Alta" : "Baja"} ${game.linescore.currentInning}°`
      : "En Vivo";
    badgeClass = "bg-red-100 text-red-700 border border-red-200 animate-pulse";
  } else {
    badgeLabel = game.metadata.time || "Por jugar";
    badgeClass = "bg-slate-100 text-slate-500 border border-slate-200";
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(String(game.id))}
      className="relative flex flex-col gap-1.5 p-2 rounded-lg border border-slate-200 bg-white shadow-sm hover:shadow-md hover:border-blue-300 transition text-left w-full cursor-pointer"
      title={`${game.metadata.awayTeam} @ ${game.metadata.homeTeam} — click para ver el detalle completo`}
    >
      {isPinned && (
        <Pin size={10} className="absolute top-1.5 right-1.5 fill-blue-600 text-blue-600" />
      )}
      <TeamRow teamName={game.metadata.awayTeam} score={awayScore} />
      <TeamRow teamName={game.metadata.homeTeam} score={homeScore} />
      <div className={`text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded text-center ${badgeClass}`}>
        {badgeLabel}
      </div>
    </button>
  );
};
