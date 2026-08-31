/**
 * Helpers de Bet Tracking: capa de storage (localStorage), utilidades de
 * odds/formato/export, y el resolutor de progreso en vivo.
 * Extraído de BetTracking.tsx (Fase 6, punto 1 del plan de mejora) — mismo
 * contenido, sin cambios de comportamiento.
 */

import { MLBGame } from "../../types";
import { Bet, LiveProgress, OddsFormat, BetCategory, BetStatus } from "./betTrackingTypes";

// ════════════════════════════════════════════════════════════════════════════
// STORAGE LAYER  — swap localStorage.getItem/setItem for Firestore calls
// ════════════════════════════════════════════════════════════════════════════

export const BETS_KEY = (date: string) => `mlb_bets_${date}`;
export const USER_KEY = "mlb_bet_username";

export function loadBets(date: string): Bet[] {
  try { return JSON.parse(localStorage.getItem(BETS_KEY(date)) ?? "[]") ?? []; }
  catch { return []; }
}
export function saveBets(date: string, bets: Bet[]): void {
  try { localStorage.setItem(BETS_KEY(date), JSON.stringify(bets)); } catch { }
}
export const USERS_LIST_KEY = "mlb_bet_users_list";

export function getRegisteredUsers(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(USERS_LIST_KEY) || "[]");
    if (Array.isArray(list) && list.length > 0) return list;
  } catch { }

  // Fallback: scan bets
  const users = new Set<string>();
  datesWithBets().forEach(d => {
    loadBets(d).forEach(b => {
      if (b.userName) users.add(b.userName);
    });
  });
  const arr = Array.from(users).sort();
  if (arr.length > 0) saveRegisteredUsers(arr);
  return arr;
}

export function saveRegisteredUsers(users: string[]): void {
  localStorage.setItem(USERS_LIST_KEY, JSON.stringify(users));
}

export function registerUser(name: string): void {
  if (!name.trim()) return;
  const users = getRegisteredUsers();
  if (!users.includes(name.trim())) {
    users.push(name.trim());
    saveRegisteredUsers(users.sort());
  }
}

export function loadUsername(): string { return localStorage.getItem(USER_KEY) ?? ""; }
export function saveUsername(name: string): void {
  localStorage.setItem(USER_KEY, name);
  registerUser(name);
}
export function datesWithBets(): string[] {
  return Object.keys(localStorage)
    .filter(k => k.startsWith("mlb_bets_"))
    .map(k => k.replace("mlb_bets_", ""))
    .filter(d => { try { return (JSON.parse(localStorage.getItem(`mlb_bets_${d}`) ?? "[]") as Bet[]).length > 0; } catch { return false; } });
}

// ════════════════════════════════════════════════════════════════════════════
// UTILS
// ════════════════════════════════════════════════════════════════════════════

export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const ODDS_FORMAT_KEY = "mlb_bet_odds_format";
export function loadOddsFormat(): OddsFormat {
  return (localStorage.getItem(ODDS_FORMAT_KEY) as OddsFormat) ?? "decimal";
}
export function saveOddsFormat(f: OddsFormat): void {
  localStorage.setItem(ODDS_FORMAT_KEY, f);
}

export function americanOddsToDecimal(odds: number): number | null {
  if (!Number.isFinite(odds) || odds === 0) return null;
  return odds > 0 ? 1 + odds / 100 : 1 + 100 / Math.abs(odds);
}

export function decimalOddsToAmerican(decimal: number): number | null {
  if (!Number.isFinite(decimal) || decimal <= 1) return null;
  return decimal >= 2 ? Math.round((decimal - 1) * 100) : Math.round(-100 / (decimal - 1));
}

export function isAmericanOddsString(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "—") return false;
  return /^[-+]\d+$/.test(trimmed) || (/^-?\d+$/.test(trimmed) && Math.abs(Number(trimmed)) >= 100);
}

export function formatOddsDisplay(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "—") return "—";
  if (isAmericanOddsString(trimmed)) {
    const decimal = americanOddsToDecimal(Number(trimmed.replace("+", "")));
    return decimal ? decimal.toFixed(2) : trimmed;
  }
  const decimal = Number(trimmed);
  return Number.isFinite(decimal) && decimal > 1 ? decimal.toFixed(2) : trimmed;
}

export function oddsForFormat(value: string, format: OddsFormat): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "—") return "";
  if (format === "decimal") return formatOddsDisplay(trimmed);
  if (isAmericanOddsString(trimmed)) return trimmed.startsWith("+") || trimmed.startsWith("-") ? trimmed : `+${trimmed}`;
  const decimal = Number(trimmed);
  const american = decimalOddsToAmerican(decimal);
  return american === null ? trimmed : american > 0 ? `+${american}` : String(american);
}

export function calcPotentialWin(amount: number, oddsStr: string, format: OddsFormat): number {
  if (amount <= 0 || !oddsStr || oddsStr === "—") return 0;
  if (format === "decimal") {
    const dec = parseFloat(oddsStr);
    if (isNaN(dec) || dec <= 1) return 0;
    return Math.round(amount * (dec - 1) * 100) / 100;
  }
  // American
  const odds = parseInt(oddsStr);
  if (isNaN(odds)) return 0;
  if (odds > 0) return Math.round(amount * (odds / 100) * 100) / 100;
  if (odds < 0) return Math.round(amount * (100 / Math.abs(odds)) * 100) / 100;
  return 0;
}

export function exportCSV(bets: Bet[], date: string): void {
  const headers = ["Fecha", "Usuario", "Casa", "Equipo", "vs", "Jugador", "Tipo", "Línea", "Odds", "Monto($)", "Ganancia Pot.($)", "Nota", "Estado"];
  const rows = bets.map(b => [
    b.date, b.userName, b.bookmaker, b.teamName, b.opponentName,
    b.subject, b.betLabel, b.line || "—", formatOddsDisplay(b.odds), b.amount, b.potentialWin, `"${b.note}"`, b.status
  ]);
  const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })),
    download: `bets_${date}.csv`,
  });
  a.click();
}

export function exportJSON(bets: Bet[], date: string): void {
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob([JSON.stringify(bets, null, 2)], { type: "application/json" })),
    download: `bets_${date}.json`,
  });
  a.click();
}

// ════════════════════════════════════════════════════════════════════════════
// LIVE PROGRESS RESOLVER
// ════════════════════════════════════════════════════════════════════════════

export const FINAL_STATUSES = ["Final", "Game Over", "Postponed", "Cancelled"];
export const LIVE_STATUSES = ["In Progress", "Live", "Delayed"];

export function getGameStartLabel(game: MLBGame | undefined): string {
  const time = game?.metadata?.time?.trim();
  return time && time !== "TBD" ? `Inicio ${time}` : "Inicio TBD";
}

/**
 * Convierte la hora del partido (`game.metadata.time`, ej. "7:05 PM") a
 * minutos desde medianoche, para poder ordenar apuestas por hora de juego.
 * Devuelve `Infinity` si la hora no está disponible o no se puede parsear
 * (partidos "TBD" quedan al final de su grupo, nunca se asumen "los más
 * tempranos" por falta de dato). Misma lógica de AM/PM que el filtro de
 * hora en App.tsx.
 */
export function parseGameTimeToMinutes(timeStr?: string | null): number {
  if (!timeStr) return Number.POSITIVE_INFINITY;
  const trimmed = timeStr.trim();
  if (!trimmed || trimmed.toUpperCase() === "TBD") return Number.POSITIVE_INFINITY;
  const match = trimmed.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return Number.POSITIVE_INFINITY;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const lower = trimmed.toLowerCase();
  const isPm = lower.includes("p");
  const isAm = lower.includes("a");
  if (isPm && hours !== 12) hours += 12;
  if (isAm && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

export function resolveLiveProgress(bet: Bet, game: MLBGame | undefined): LiveProgress {
  const NONE: LiveProgress = { current: 0, pct: 0, display: "Sin datos", hint: "Esperando inicio", isLive: false, isFinal: false, autoStatus: null };
  if (!game) return NONE;
  const status = game.game_result?.gameStatus ?? "";
  const isLive = LIVE_STATUSES.some(s => status.includes(s));
  const isFinal = FINAL_STATUSES.some(s => status.includes(s));
  const isPostponed = ["Postponed", "Cancelled"].some(s => status.includes(s));

  // Si el partido no ha comenzado (no está en vivo ni finalizado), forzar estado de espera a 0%
  if (!isLive && !isFinal) {
    return {
      current: 0,
      pct: 0,
      display: bet.betTypeKey === "team_f5"
        ? "0 - 0 (0/5 inn)"
        : bet.betTypeKey === "team_ml"
          ? "0 - 0"
          : `0 / ${bet.line} ${bet.betTypeKey === "pitcher_k" ? "K's" : "bases"}`,
      hint: getGameStartLabel(game),
      startLabel: getGameStartLabel(game),
      isLive: false,
      isFinal: false,
      autoStatus: null
    };
  }

  if (bet.betTypeKey === "pitcher_k") {
    let pitchers = game.liveBoxscore?.[bet.teamSide]?.pitchers ?? [];
    let pitcherIndex = pitchers.findIndex(p => p.name === bet.subject || (bet.subject.split(" ").length > 1 && p.name.toLowerCase().includes(bet.subject.split(" ").pop()!.toLowerCase())));
    if (pitcherIndex < 0) {
      const otherSide = bet.teamSide === "home" ? "away" : "home";
      pitchers = game.liveBoxscore?.[otherSide]?.pitchers ?? [];
      pitcherIndex = pitchers.findIndex(p => p.name === bet.subject || (bet.subject.split(" ").length > 1 && p.name.toLowerCase().includes(bet.subject.split(" ").pop()!.toLowerCase())));
    }
    const pitcher = pitcherIndex >= 0 ? pitchers[pitcherIndex] : undefined;
    const current = pitcher?.k ?? 0;
    const exceeded = current >= bet.line;
    const isPulled = (isLive || isFinal) && pitcherIndex >= 0 && pitchers.slice(pitcherIndex + 1).some(p => (p.pitches || 0) > 0 || (p.ip && p.ip !== "0.0" && p.ip !== "0"));
    const pct = bet.line > 0 ? Math.min(100, Math.round((current / bet.line) * 100)) : 0;

    let autoStatus: BetStatus | null = null;
    if (isPostponed) {
      autoStatus = "void";
    } else if (isFinal || exceeded || isPulled) {
      autoStatus = bet.isOver ? (exceeded ? "won" : "lost") : (current < bet.line ? "won" : "lost");
    }

    let hint = "";
    if (isPostponed) {
      hint = "Juego Pospuesto/Cancelado";
    } else if (exceeded) {
      hint = "¡Línea superada!";
    } else if (isFinal) {
      hint = `Final — ${current} K's`;
    } else if (isPulled) {
      hint = `Pitcher relevado — ${current} K's`;
    } else {
      hint = `Necesita ${Math.ceil(bet.line - current)} más`;
    }

    return { current, pct: autoStatus === "won" ? 100 : pct, display: `${current} / ${bet.line} K's`, hint, isLive, isFinal, autoStatus };
  }

  if (bet.betTypeKey === "batter_tb") {
    let batters = game.liveBoxscore?.[bet.teamSide]?.batters ?? [];
    let batter = batters.find(b => b.name === bet.subject || (bet.subject.split(" ").length > 1 && b.name.toLowerCase().includes(bet.subject.split(" ").pop()!.toLowerCase())));
    if (!batter) {
      const otherSide = bet.teamSide === "home" ? "away" : "home";
      batters = game.liveBoxscore?.[otherSide]?.batters ?? [];
      batter = batters.find(b => b.name === bet.subject || (bet.subject.split(" ").length > 1 && b.name.toLowerCase().includes(bet.subject.split(" ").pop()!.toLowerCase())));
    }
    const current = batter?.total_bases ?? 0;
    const exceeded = current >= bet.line;
    const pct = bet.line > 0 ? Math.min(100, Math.round((current / bet.line) * 100)) : 0;
    let autoStatus: BetStatus | null = null;
    if (isPostponed) autoStatus = "void";
    else if (isFinal || exceeded) autoStatus = bet.isOver ? (exceeded ? "won" : "lost") : (current < bet.line ? "won" : "lost");
    return { current, pct: autoStatus === "won" ? 100 : pct, display: `${current} / ${bet.line} bases`, hint: isPostponed ? "Juego Pospuesto/Cancelado" : exceeded ? "¡Línea superada!" : isFinal ? `Final — ${current} bases` : `Necesita ${Math.ceil(bet.line - current)} más`, isLive, isFinal, autoStatus };
  }

  if (bet.betTypeKey === "team_ml") {
    const homeScore = game.game_result?.homeScore ?? 0;
    const awayScore = game.game_result?.awayScore ?? 0;
    const myScore = bet.teamSide === "home" ? homeScore : awayScore;
    const oppScore = bet.teamSide === "home" ? awayScore : homeScore;
    const winning = myScore > oppScore;
    const total = myScore + oppScore;
    let pct = total === 0 ? 0 : winning ? 70 : myScore === oppScore ? 50 : 30;
    let autoStatus: BetStatus | null = null;
    if (isPostponed) { autoStatus = "void"; pct = 100; }
    else if (isFinal) { autoStatus = winning ? "won" : "lost"; pct = autoStatus === "won" ? 100 : 0; }
    return { current: myScore, pct, display: `${myScore} - ${oppScore}`, hint: isPostponed ? "Juego Pospuesto/Cancelado" : isFinal ? (winning ? "¡Equipo ganó!" : "Equipo perdió") : (winning ? "Ganando" : "Perdiendo"), isLive, isFinal, autoStatus };
  }

  if (bet.betTypeKey === "team_f5") {
    const innings = game.linescore?.innings ?? [];
    const first5 = innings.slice(0, 5);
    const cur5 = game.linescore?.currentInning ?? 0;

    // El F5 es oficial si ya se jugó el 6to inning (cur5 > 5) o si el juego terminó (isFinal) habiendo completado 5 innings
    // Si el juego concluyó y no se completaron 5 innings (ej. suspendido en el 4to), es nulo (void/push).
    const f5Completed = cur5 > 5 || (isFinal && cur5 >= 5);
    const f5Void = isFinal && cur5 < 5;

    const myRuns = first5.reduce((a, i) => a + ((bet.teamSide === "home" ? i.home : i.away)?.runs ?? 0), 0);
    const oppRuns = first5.reduce((a, i) => a + ((bet.teamSide === "home" ? i.away : i.home)?.runs ?? 0), 0);
    const winning = myRuns > oppRuns;
    const tied = myRuns === oppRuns;

    let autoStatus: BetStatus | null = null;
    if (f5Void) {
      autoStatus = "void";
    } else if (f5Completed) {
      if (tied) autoStatus = "void";
      else autoStatus = winning ? "won" : "lost";
    }

    let pct = f5Completed ? 100 : Math.min(100, Math.round((Math.min(cur5, 5) / 5) * 100));
    if (autoStatus === "won" || autoStatus === "void") pct = 100;

    return {
      current: myRuns,
      pct,
      display: `${myRuns} - ${oppRuns} (${Math.min(cur5, 5)}/5 inn)`,
      hint: autoStatus === "void"
        ? "Push / Nula (Empate o suspendido)"
        : f5Completed
          ? (winning ? "¡Ganó F5!" : "Perdió F5")
          : `Inning ${cur5}`,
      isLive,
      isFinal: f5Completed || f5Void,
      autoStatus
    };
  }

  return NONE;
}

export function hasResultDataForBet(bet: Bet, game: MLBGame | undefined): boolean {
  if (!game) return false;
  const status = game.game_result?.gameStatus ?? "";
  const isLiveOrFinal = LIVE_STATUSES.some(s => status.includes(s)) || FINAL_STATUSES.some(s => status.includes(s));
  if (!isLiveOrFinal) return false;

  if (bet.betTypeKey === "pitcher_k") {
    const pitchers = game.liveBoxscore?.[bet.teamSide]?.pitchers ?? [];
    return pitchers.some(p => p.name === bet.subject) || pitchers.length > 0;
  }

  if (bet.betTypeKey === "batter_tb") {
    const batters = game.liveBoxscore?.[bet.teamSide]?.batters ?? [];
    return batters.some(b => b.name === bet.subject);
  }

  if (bet.betTypeKey === "team_f5") {
    return Array.isArray(game.linescore?.innings) && game.linescore.innings.length > 0;
  }

  return game.game_result?.homeScore !== undefined && game.game_result?.awayScore !== undefined;
}

export const CATEGORY_CFG: Record<BetCategory, { label: string; color: string; bg: string }> = {
  pitcher: { label: "Pitcher", color: "text-blue-700", bg: "bg-blue-50 border-blue-200" },
  batter: { label: "Bateador", color: "text-violet-700", bg: "bg-violet-50 border-violet-200" },
  team: { label: "Equipo", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
};

export const BOOKMAKERS = ["DraftKings", "FanDuel", "BetMGM", "Caesars", "Pinnacle", "bet365", "ESPNBet", "Otra"];
