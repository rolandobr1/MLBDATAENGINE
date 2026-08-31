/**
 * Tipos compartidos de Bet Tracking.
 * Extraído de BetTracking.tsx (Fase 6, punto 1 del plan de mejora: dividir
 * BetTracking.tsx en piezas más chicas) — mismo contenido, sin cambios.
 */

export type BetCategory = "pitcher" | "batter" | "team";
export type BetStatus = "pending" | "won" | "lost" | "void";
export type BetTypeKey = "pitcher_k" | "batter_tb" | "team_ml" | "team_f5";
export type OddsFormat = "american" | "decimal";

export interface Bet {
  id: number;
  date: string;
  userName: string;
  gameId: string;
  teamName: string;
  opponentName: string;
  teamSide: "home" | "away";
  subject: string;
  betLabel: string;
  betCategory: BetCategory;
  line: number;
  isOver: boolean;
  betTypeKey: BetTypeKey;
  bookmaker: string;
  amount: number;
  odds: string;
  potentialWin: number;
  note: string;
  createdAt: string;
  status: BetStatus;
}

export interface LiveProgress {
  current: number;
  pct: number;
  display: string;
  hint: string;
  startLabel?: string;
  isLive: boolean;
  isFinal: boolean;
  autoStatus: BetStatus | null;
}

/**
 * Forma de cada elemento de `resolvedBets` en BetTracking: una apuesta ya
 * cruzada con el progreso en vivo y el juego correspondiente (si se encontró).
 * No existía como tipo nombrado antes de la Fase 6 — `resolvedBets` era un
 * `useMemo` inline; se nombra acá para poder pasarlo como prop a BetList.
 */
export interface ResolvedBet {
  bet: Bet;
  progress: LiveProgress;
  game: import("../../types").MLBGame | undefined;
}
