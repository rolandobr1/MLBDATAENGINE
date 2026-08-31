/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tab "Sabermetría" de GameCard — ofensiva avanzada.
 * Extraído de GameCard.tsx (Fase 6, punto 1 del plan de mejora).
 */

import React from "react";
import { MLBGame } from "../../types";
import { formatFloat } from "./gameCardHelpers";

interface SabermetricsTabProps {
  game: MLBGame;
}

export const SabermetricsTab: React.FC<SabermetricsTabProps> = ({ game }) => {
  if (!game.advanced_offense) return null;

  return (
              <div className="space-y-4">
                {/* Advanced Offense */}
                <div className="bg-white rounded-lg border border-slate-200/60 overflow-hidden shadow-sm p-4 space-y-3">
                  <h5 className="font-display font-bold text-xs uppercase tracking-wider text-slate-850 border-b pb-1.5">
                    Ofensiva de Equipos - Sabermetría Real Calculada
                  </h5>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs font-mono">
                    <div className="space-y-1.5 bg-slate-50/50 p-2.5 rounded">
                      <div className="font-sans font-bold text-[10px] text-blue-900 uppercase mb-1">Ataque Visitante</div>
                      <div className="flex justify-between"><span>wOBA (Calculado):</span> <strong>{formatFloat(game.advanced_offense.away.wOba, 3)}</strong></div>
                      <div className="flex justify-between"><span title="BABIP: Bateo de bolas en juego. Ayuda a ver si hay suerte involucrada." className="cursor-help border-b border-dotted border-slate-400">BABIP:</span> <strong>{formatFloat(game.advanced_offense.away.babip, 3)}</strong></div>
                      <div className="flex justify-between"><span>ISO (Poder):</span> <strong>{formatFloat(game.advanced_offense.away.iso, 3)}</strong></div>
                    </div>
                    <div className="space-y-1.5 bg-slate-50/50 p-2.5 rounded">
                      <div className="font-sans font-bold text-[10px] text-red-900 uppercase mb-1">Ataque Local</div>
                      <div className="flex justify-between"><span>wOBA (Calculado):</span> <strong>{formatFloat(game.advanced_offense.home.wOba, 3)}</strong></div>
                      <div className="flex justify-between"><span title="BABIP: Bateo de bolas en juego. Ayuda a ver si hay suerte involucrada." className="cursor-help border-b border-dotted border-slate-400">BABIP:</span> <strong>{formatFloat(game.advanced_offense.home.babip, 3)}</strong></div>
                      <div className="flex justify-between"><span>ISO (Poder):</span> <strong>{formatFloat(game.advanced_offense.home.iso, 3)}</strong></div>
                    </div>
                  </div>
                </div>
              </div>
  );
};

export default SabermetricsTab;
