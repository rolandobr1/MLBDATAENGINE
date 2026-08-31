/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * GameCard — tarjeta de un juego con resumen, alineaciones, boxscore, splits,
 * descanso, sabermetría y lesiones.
 *
 * Fase 6, punto 1 del plan de mejora (`audit_2026-08-31/PLAN_DE_MEJORA_MLBDATAENGINE.md`):
 * este archivo medía 146 KB / 2043 líneas con todo mezclado (helpers puros,
 * el modal de detalle de lanzador, y las 7 pestañas) en un solo componente
 * gigante. Se dividió así, sin cambiar ningún comportamiento:
 *   - `gameCard/gameCardHelpers.ts`   → funciones puras de formateo/cálculo
 *   - `gameCard/LiveFieldUI.tsx`      → el diamante animado de juegos en vivo
 *   - `gameCard/PitcherStatsModal.tsx`→ el modal de Totales/Promedios/Proyecciones
 *   - `gameCard/ResumenTab.tsx`       → pestaña "Resumen General"
 *   - `gameCard/LineupsTab.tsx`       → pestaña "Alineaciones"
 *   - `gameCard/BoxscoreTab.tsx`      → pestaña "Boxscore & PxP"
 *   - `gameCard/SplitsTab.tsx`        → pestaña "Splits LHP/RHP"
 *   - `gameCard/FatigueTab.tsx`       → pestaña "Descanso"
 *   - `gameCard/SabermetricsTab.tsx`  → pestaña "Sabermetría"
 *   - `gameCard/InjuriesTab.tsx`      → pestaña "Lesiones"
 * Este archivo ahora solo mantiene el estado que es realmente compartido
 * entre esas piezas (si la tarjeta está expandida, cuál pestaña está activa,
 * el spinner de refresh, y qué lanzador se seleccionó para el modal) y arma
 * el layout: banner del juego, barra de info/acciones, selector de pestañas
 * y el modal. El estado que era local de una sola pestaña (el toggle
 * Temp/Últ.7/Vs Opp, qué jugador está expandido, los buscadores de jugadas y
 * lesiones) se movió junto con esa pestaña.
 */

import React from "react";
import { MLBGame } from "../types";
import { getTeamLogo, getTeamColor, getTeamAbbr } from "../utils/teamLogos";
import {
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Pin,
  Download,
  Eye,
  EyeOff,
} from "lucide-react";

import LiveFieldUI from "./gameCard/LiveFieldUI";
import { PitcherStatsModal } from "./gameCard/PitcherStatsModal";
import { ResumenTab } from "./gameCard/ResumenTab";
import { LineupsTab } from "./gameCard/LineupsTab";
import { BoxscoreTab } from "./gameCard/BoxscoreTab";
import { SplitsTab } from "./gameCard/SplitsTab";
import { FatigueTab } from "./gameCard/FatigueTab";
import { SabermetricsTab } from "./gameCard/SabermetricsTab";
import { InjuriesTab } from "./gameCard/InjuriesTab";

interface GameCardProps {
  game: MLBGame;
  onRefresh?: (gameId: string, date: string) => Promise<void>;
  isPinned?: boolean;
  onTogglePin?: (gameId: string) => void;
  globalExpandToggle?: number;
  globalExpandTarget?: boolean;
}

/**
 * Fase 7 (Tanda D, mejora de rendimiento): envuelto en `React.memo` para que
 * una tarjeta no se vuelva a renderizar (ni recalcule sus estadísticas
 * derivadas) cuando el polling automático de `App.tsx` trae datos donde este
 * juego en particular no cambió. Para que esto funcione de verdad, `App.tsx`
 * ahora conserva la misma referencia de objeto `game` cuando el contenido no
 * cambió, y pasa `onRefresh`/`onTogglePin` como funciones estables (useCallback)
 * en vez de una función nueva por tarjeta en cada render.
 */
const GameCardComponent: React.FC<GameCardProps> = ({ game, onRefresh, isPinned, onTogglePin, globalExpandToggle, globalExpandTarget }) => {
  const [isCardExpanded, setIsCardExpanded] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<"resumen" | "lineups" | "boxscore" | "splits" | "fatigue" | "sabermetrics" | "injuries">("resumen");
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [selectedPitcherSide, setSelectedPitcherSide] = React.useState<"home" | "away" | null>(null);

  React.useEffect(() => {
    if (globalExpandToggle !== undefined && globalExpandToggle > 0) {
      setIsCardExpanded(!!globalExpandTarget);
    }
  }, [globalExpandToggle, globalExpandTarget]);

  const handleRefreshClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onRefresh) return;
    setIsRefreshing(true);
    try {
      await onRefresh(String(game.id), game.metadata.date);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleExportGameClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const link = document.createElement("a");
    link.setAttribute("href", `/api/game/${encodeURIComponent(String(game.id))}/csv?date=${encodeURIComponent(game.metadata.date)}&_=${Date.now()}`);
    link.setAttribute("download", `MLB_GAME_${game.id}_${game.metadata.date}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="rounded-xl overflow-hidden shadow-sm hover:shadow-md transition duration-200 font-sans bg-white border border-slate-200">
      {selectedPitcherSide && (
        <PitcherStatsModal game={game} side={selectedPitcherSide} onClose={() => setSelectedPitcherSide(null)} />
      )}

      {/* Game Card Header Block (Colorful Banner) */}
      <div
        className="text-white flex flex-row justify-between items-stretch overflow-hidden rounded-t-xl border-b border-slate-200 h-[100px] sm:h-[160px]"
        style={{
          background: `linear-gradient(110deg, ${getTeamColor(game.metadata.awayTeam)} 0%, ${getTeamColor(game.metadata.awayTeam)} 49.5%, #ffffff30 49.5%, #ffffff30 50%, ${getTeamColor(game.metadata.homeTeam)} 50%, ${getTeamColor(game.metadata.homeTeam)} 100%)`
        }}
      >
        <div className="w-full flex flex-row items-center justify-between px-3 sm:px-12 py-0 h-full">
            {/* Away Team */}
            <div className="flex items-center justify-start gap-2 sm:gap-4 w-1/2 pr-2">
              {getTeamLogo(game.metadata.awayTeam) && (
                <div className="w-12 h-12 sm:w-20 sm:h-20 bg-white rounded-full flex items-center justify-center p-1.5 sm:p-2 shadow-xl shrink-0 border-2 border-white/20">
                  <img src={getTeamLogo(game.metadata.awayTeam) as string} alt={game.metadata.awayTeam} className="w-full h-full object-contain" />
                </div>
              )}
              <div className="flex flex-col items-start">
                <h3 className="font-display font-bold text-xl leading-tight drop-shadow-lg tracking-tight sm:hidden">
                  {getTeamAbbr(game.metadata.awayTeam)}
                </h3>
                <h3 className="font-display font-bold text-3xl leading-tight drop-shadow-lg tracking-tight hidden sm:block">
                  {game.metadata.awayTeam}
                </h3>
                {game.trends?.away?.recordHome && game.trends.away.recordHome !== "N/D" && (
                  <span className="text-[10px] sm:text-xs font-mono font-bold tracking-wider text-white/90 drop-shadow-md mt-0.5">
                    {game.trends.away.recordHome}
                  </span>
                )}
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-[9px] sm:text-[11px] font-mono font-bold uppercase tracking-widest text-white/80 drop-shadow-md bg-black/20 px-1.5 py-0.5 rounded backdrop-blur-sm">
                    Visitante
                  </span>
                </div>
              </div>
            </div>

            {/* Home Team */}
            <div className="flex items-center justify-end gap-2 sm:gap-4 w-1/2 pl-2">
              <div className="flex flex-col items-end">
                <h3 className="font-display font-bold text-xl leading-tight drop-shadow-lg tracking-tight sm:hidden text-right">
                  {getTeamAbbr(game.metadata.homeTeam)}
                </h3>
                <h3 className="font-display font-bold text-3xl leading-tight drop-shadow-lg text-right tracking-tight hidden sm:block">
                  {game.metadata.homeTeam}
                </h3>
                {game.trends?.home?.recordHome && game.trends.home.recordHome !== "N/D" && (
                  <span className="text-[10px] sm:text-xs font-mono font-bold tracking-wider text-white/90 drop-shadow-md mt-0.5 text-right">
                    {game.trends.home.recordHome}
                  </span>
                )}
                <div className="flex items-center justify-end gap-1.5 mt-1">
                  <span className="text-[9px] sm:text-[11px] font-mono font-bold uppercase tracking-widest text-white/80 drop-shadow-md bg-black/20 px-1.5 py-0.5 rounded backdrop-blur-sm text-right">
                    Local
                  </span>
                </div>
              </div>
              {getTeamLogo(game.metadata.homeTeam) && (
                <div className="w-12 h-12 sm:w-20 sm:h-20 bg-white rounded-full flex items-center justify-center p-1.5 sm:p-2 shadow-xl shrink-0 border-2 border-white/20">
                  <img src={getTeamLogo(game.metadata.homeTeam) as string} alt={game.metadata.homeTeam} className="w-full h-full object-contain" />
                </div>
              )}
            </div>
        </div>
      </div>

      {/* Game Info & Actions Bar */}
      <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex flex-col lg:flex-row justify-between items-center gap-4">
        {/* Left Side: Metadata */}
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto justify-center lg:justify-start">
          <span className="text-[10px] font-mono tracking-widest text-slate-500 uppercase">
            Estadio: <strong className="text-slate-700">{game.metadata.venue}</strong>
          </span>
          <span className="text-slate-300 hidden sm:inline">•</span>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-slate-500">ID: {game.id}</span>
            {game.validation?.isValid ? (
              <span className="bg-emerald-100 border border-emerald-200 text-emerald-700 text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
                <CheckCircle size={10} />
                <span>Validado</span>
              </span>
            ) : (
              <span className="bg-amber-100 border border-amber-200 text-amber-700 text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
                <AlertTriangle size={10} />
                <span>Error</span>
              </span>
            )}
          </div>
          <span className="text-slate-300 hidden sm:inline">•</span>
          <div className="text-slate-500 text-[10px] uppercase font-mono">
            {game.metadata.date} • {game.metadata.time}
          </div>
        </div>

        {/* Right Side: Score & Buttons */}
        <div className="flex flex-wrap items-center justify-center lg:justify-end gap-4 w-full lg:w-auto">
          {/* Score / Status */}
          <div className="flex items-center gap-3">
            {game.game_result && !["Scheduled", "Pre-Game", "Warmup"].includes(game.game_result.gameStatus) ? (
              <>
                <div className="font-display font-bold text-lg text-slate-800 leading-none">
                  {game.linescore?.awayTotals?.runs ?? game.game_result.awayScore} - {game.linescore?.homeTotals?.runs ?? game.game_result.homeScore}
                </div>
                <div className={`text-[9px] font-mono font-bold uppercase px-2 py-1 rounded shadow-sm ${game.game_result.gameStatus.includes("Final") || game.game_result.gameStatus === "Game Over"
                    ? "bg-slate-800 text-slate-100"
                    : "bg-red-100 text-red-700 animate-pulse border border-red-200"
                  }`}>
                  {game.game_result.gameStatus}
                  {game.linescore?.currentInning && !game.game_result.gameStatus.includes("Final") && game.game_result.gameStatus !== "Game Over" && (
                    ` • ${game.linescore.inningHalf === "Top" ? "Alta" : "Baja"} ${game.linescore.currentInning}°`
                  )}
                </div>
              </>
            ) : (
              <div className="text-slate-500 font-bold text-xs tracking-wide uppercase">Por Jugar</div>
            )}
          </div>

          {/* Buttons */}
          <div className="flex items-center gap-2 border-l border-slate-200 pl-4">
            <button
              onClick={(e) => { e.stopPropagation(); setIsCardExpanded(!isCardExpanded); }}
              className={`p-2 rounded-lg border transition duration-150 flex items-center justify-center shrink-0 cursor-pointer shadow-sm ${isCardExpanded ? "bg-emerald-100 border-emerald-200 text-emerald-700" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}
              title={isCardExpanded ? "Ocultar detalles del juego" : "Mostrar detalles del juego"}
              aria-label={isCardExpanded ? "Ocultar detalles del juego" : "Mostrar detalles del juego"}
            >
              {isCardExpanded ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
            {onTogglePin && (
              <button
                onClick={(e) => { e.stopPropagation(); onTogglePin(String(game.id)); }}
                className={`p-2 rounded-lg border transition duration-150 flex items-center justify-center shrink-0 cursor-pointer shadow-sm ${isPinned ? "bg-blue-100 border-blue-200 text-blue-700" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}
                title={isPinned ? "Desfijar de la lista" : "Fijar arriba de la lista"}
                aria-label={isPinned ? "Desfijar de la lista" : "Fijar arriba de la lista"}
              >
                <Pin size={14} className={isPinned ? "fill-blue-600" : ""} />
              </button>
            )}
            {onRefresh && (
              <button
                onClick={handleRefreshClick}
                disabled={isRefreshing}
                className="p-2 rounded-lg border bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition duration-150 flex items-center justify-center shrink-0 cursor-pointer disabled:opacity-50 shadow-sm"
                title="Actualizar datos de este encuentro"
                aria-label="Actualizar datos de este encuentro"
              >
                <RefreshCw size={14} className={isRefreshing ? "animate-spin" : ""} />
              </button>
            )}
            <button
              onClick={handleExportGameClick}
              className="p-2 rounded-lg border bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition duration-150 flex items-center justify-center shrink-0 cursor-pointer shadow-sm"
              title="Exportar solo este juego"
              aria-label="Exportar solo este juego"
            >
              <Download size={14} />
            </button>
          </div>
        </div>
      </div>

      {isCardExpanded && (
        <div className="bg-slate-50 border-t border-slate-200">

          {/* Live Progress Indicator — solo para juegos en curso */}
          {(() => {
            const status = game.game_result?.gameStatus || '';
            const isActuallyLive =
              status.includes('In Progress') ||
              status.includes('Challenge') ||
              status.includes('Delayed') ||
              status === 'Live' ||
              (status.includes('Postponed') && !!game.linescore?.currentInning);
            return isActuallyLive && game.linescore ? (
              <div className="mb-4">
                <LiveFieldUI
                  linescore={game.linescore}
                  liveBoxscore={game.liveBoxscore}
                  gameStatus={status}
                  homeTeam={game.teams.home}
                  awayTeam={game.teams.away}
                />
              </div>
            ) : null;
          })()}

          {/* Tab Selector — select nativo en mobile, grilla de botones desde sm */}
          <div className="border-b border-slate-200 p-4 bg-slate-100/50">
            <select
              value={activeTab}
              onChange={(e) => setActiveTab(e.target.value as typeof activeTab)}
              className="sm:hidden w-full px-3 py-2.5 rounded-lg text-xs font-semibold border border-slate-200 bg-white text-slate-700 shadow-sm outline-none"
            >
              <option value="resumen">Resumen General</option>
              <option value="lineups">Alineaciones</option>
              <option value="boxscore">Boxscore & PxP</option>
              <option value="splits">Splits LHP/RHP</option>
              <option value="fatigue">Descanso</option>
              <option value="sabermetrics">Sabermetría</option>
              <option value="injuries">Lesiones</option>
            </select>

            <div className="hidden sm:grid sm:grid-cols-3 lg:grid-cols-7 gap-2">
              <button
                onClick={() => setActiveTab("resumen")}
                className={`sm:col-span-3 lg:col-span-1 px-2 py-2 rounded-lg text-[11px] lg:text-xs font-semibold transition cursor-pointer flex items-center justify-center text-center shadow-sm ${activeTab === "resumen" ? "bg-slate-900 text-white shadow-md" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"}`}
              >
                Resumen General
              </button>
              <button
                onClick={() => setActiveTab("lineups")}
                className={`px-1 py-2 rounded-lg text-[10px] lg:text-xs font-semibold transition cursor-pointer flex items-center justify-center text-center shadow-sm ${activeTab === "lineups" ? "bg-slate-900 text-white shadow-md" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"}`}
              >
                Alineaciones
              </button>
              <button
                onClick={() => setActiveTab("boxscore")}
                className={`px-1 py-2 rounded-lg text-[10px] lg:text-xs font-semibold transition cursor-pointer flex items-center justify-center text-center shadow-sm ${activeTab === "boxscore" ? "bg-slate-900 text-white shadow-md" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"}`}
              >
                Boxscore & PxP
              </button>
              <button
                onClick={() => setActiveTab("splits")}
                className={`px-1 py-2 rounded-lg text-[10px] lg:text-xs font-semibold transition cursor-pointer flex items-center justify-center text-center shadow-sm ${activeTab === "splits" ? "bg-slate-900 text-white shadow-md" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"}`}
              >
                Splits LHP/RHP
              </button>
              <button
                onClick={() => setActiveTab("fatigue")}
                className={`px-1 py-2 rounded-lg text-[10px] lg:text-xs font-semibold transition cursor-pointer flex items-center justify-center text-center shadow-sm ${activeTab === "fatigue" ? "bg-slate-900 text-white shadow-md" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"}`}
              >
                Descanso
              </button>
              <button
                onClick={() => setActiveTab("sabermetrics")}
                className={`px-1 py-2 rounded-lg text-[10px] lg:text-xs font-semibold transition cursor-pointer flex items-center justify-center text-center shadow-sm ${activeTab === "sabermetrics" ? "bg-slate-900 text-white shadow-md" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"}`}
              >
                Sabermetría
              </button>
              <button
                onClick={() => setActiveTab("injuries")}
                className={`px-1 py-2 rounded-lg text-[10px] lg:text-xs font-semibold transition cursor-pointer flex items-center justify-center text-center shadow-sm ${activeTab === "injuries" ? "bg-slate-900 text-white shadow-md" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"}`}
              >
                Lesiones
              </button>
            </div>
          </div>

          <div className="p-0 sm:p-6 font-sans text-slate-700 text-sm leading-relaxed space-y-4">
            {activeTab === "resumen" && (
              <ResumenTab game={game} onSelectPitcher={(side) => setSelectedPitcherSide(side)} />
            )}

            {activeTab === "lineups" && (
              <LineupsTab game={game} />
            )}

            {activeTab === "boxscore" && (
              <BoxscoreTab game={game} isRefreshing={isRefreshing} onRefreshClick={handleRefreshClick} />
            )}

            {activeTab === "splits" && (
              <SplitsTab game={game} />
            )}

            {activeTab === "fatigue" && (
              <FatigueTab game={game} />
            )}

            {activeTab === "sabermetrics" && (
              <SabermetricsTab game={game} />
            )}

            {activeTab === "injuries" && (
              <InjuriesTab game={game} />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const GameCard = React.memo(GameCardComponent);
