/**
 * BetTracking v2 — Registro de apuestas MLB
 * Persistencia: localStorage (Firebase-ready, solo cambiar la capa de storage)
 */

import React, { useState, useMemo, useEffect, useCallback } from "react";
import {
  TrendingUp, CheckCircle2, XCircle, Clock, ChevronRight, Trophy,
  Target, DollarSign, BarChart2, Trash2, PlusCircle, Users, User,
  Zap, ListChecks, RefreshCw, AlertTriangle, Download, ChevronLeft,
  BookOpen, StickyNote, Flame, Award, Percent, ArrowRight, Edit2,
  ChevronDown, ChevronUp, X, Eye, EyeOff
} from "lucide-react";
import { MLBGame } from "../types";
import { syncBets, saveBetsDb, registerUserDb, syncUsers, deleteUserDb } from "../services/betService";
import { getTeamLogo, getTeamColor, getTeamAbbr } from "../utils/teamLogos";

// ════════════════════════════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════════════════════════════

type BetCategory = "pitcher" | "batter" | "team";
type BetStatus = "pending" | "won" | "lost" | "void";
type BetTypeKey = "pitcher_k" | "batter_tb" | "team_ml" | "team_f5";

interface Bet {
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

interface LiveProgress {
  current: number;
  pct: number;
  display: string;
  hint: string;
  startLabel?: string;
  isLive: boolean;
  isFinal: boolean;
  autoStatus: BetStatus | null;
}

// ════════════════════════════════════════════════════════════════════════════
// STORAGE LAYER  — swap localStorage.getItem/setItem for Firestore calls
// ════════════════════════════════════════════════════════════════════════════

const BETS_KEY = (date: string) => `mlb_bets_${date}`;
const USER_KEY = "mlb_bet_username";

function loadBets(date: string): Bet[] {
  try { return JSON.parse(localStorage.getItem(BETS_KEY(date)) ?? "[]") ?? []; }
  catch { return []; }
}
function saveBets(date: string, bets: Bet[]): void {
  try { localStorage.setItem(BETS_KEY(date), JSON.stringify(bets)); } catch { }
}
const USERS_LIST_KEY = "mlb_bet_users_list";

function getRegisteredUsers(): string[] {
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

function saveRegisteredUsers(users: string[]): void {
  localStorage.setItem(USERS_LIST_KEY, JSON.stringify(users));
}

function registerUser(name: string): void {
  if (!name.trim()) return;
  const users = getRegisteredUsers();
  if (!users.includes(name.trim())) {
    users.push(name.trim());
    saveRegisteredUsers(users.sort());
  }
}

function loadUsername(): string { return localStorage.getItem(USER_KEY) ?? ""; }
function saveUsername(name: string): void {
  localStorage.setItem(USER_KEY, name);
  registerUser(name);
}
function datesWithBets(): string[] {
  return Object.keys(localStorage)
    .filter(k => k.startsWith("mlb_bets_"))
    .map(k => k.replace("mlb_bets_", ""))
    .filter(d => { try { return (JSON.parse(localStorage.getItem(`mlb_bets_${d}`) ?? "[]") as Bet[]).length > 0; } catch { return false; } });
}

// ════════════════════════════════════════════════════════════════════════════
// UTILS
// ════════════════════════════════════════════════════════════════════════════

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type OddsFormat = "american" | "decimal";
const ODDS_FORMAT_KEY = "mlb_bet_odds_format";
function loadOddsFormat(): OddsFormat {
  return (localStorage.getItem(ODDS_FORMAT_KEY) as OddsFormat) ?? "decimal";
}
function saveOddsFormat(f: OddsFormat): void {
  localStorage.setItem(ODDS_FORMAT_KEY, f);
}

function americanOddsToDecimal(odds: number): number | null {
  if (!Number.isFinite(odds) || odds === 0) return null;
  return odds > 0 ? 1 + odds / 100 : 1 + 100 / Math.abs(odds);
}

function decimalOddsToAmerican(decimal: number): number | null {
  if (!Number.isFinite(decimal) || decimal <= 1) return null;
  return decimal >= 2 ? Math.round((decimal - 1) * 100) : Math.round(-100 / (decimal - 1));
}

function isAmericanOddsString(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "—") return false;
  return /^[-+]\d+$/.test(trimmed) || (/^-?\d+$/.test(trimmed) && Math.abs(Number(trimmed)) >= 100);
}

function formatOddsDisplay(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "—") return "—";
  if (isAmericanOddsString(trimmed)) {
    const decimal = americanOddsToDecimal(Number(trimmed.replace("+", "")));
    return decimal ? decimal.toFixed(2) : trimmed;
  }
  const decimal = Number(trimmed);
  return Number.isFinite(decimal) && decimal > 1 ? decimal.toFixed(2) : trimmed;
}

function oddsForFormat(value: string, format: OddsFormat): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "—") return "";
  if (format === "decimal") return formatOddsDisplay(trimmed);
  if (isAmericanOddsString(trimmed)) return trimmed.startsWith("+") || trimmed.startsWith("-") ? trimmed : `+${trimmed}`;
  const decimal = Number(trimmed);
  const american = decimalOddsToAmerican(decimal);
  return american === null ? trimmed : american > 0 ? `+${american}` : String(american);
}

function calcPotentialWin(amount: number, oddsStr: string, format: OddsFormat): number {
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

function exportCSV(bets: Bet[], date: string): void {
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

function exportJSON(bets: Bet[], date: string): void {
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob([JSON.stringify(bets, null, 2)], { type: "application/json" })),
    download: `bets_${date}.json`,
  });
  a.click();
}

// ════════════════════════════════════════════════════════════════════════════
// LIVE PROGRESS RESOLVER
// ════════════════════════════════════════════════════════════════════════════

const FINAL_STATUSES = ["Final", "Game Over", "Postponed", "Cancelled"];
const LIVE_STATUSES = ["In Progress", "Live", "Delayed"];

function getGameStartLabel(game: MLBGame | undefined): string {
  const time = game?.metadata?.time?.trim();
  return time && time !== "TBD" ? `Inicio ${time}` : "Inicio TBD";
}

function resolveLiveProgress(bet: Bet, game: MLBGame | undefined): LiveProgress {
  const NONE: LiveProgress = { current: 0, pct: 0, display: "Sin datos", hint: "Esperando inicio", isLive: false, isFinal: false, autoStatus: null };
  if (!game) return NONE;
  const status = game.game_result?.gameStatus ?? "";
  const isLive = LIVE_STATUSES.some(s => status.includes(s));
  const isFinal = FINAL_STATUSES.some(s => status.includes(s));

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
    const pitchers = game.liveBoxscore?.[bet.teamSide]?.pitchers ?? [];
    const pitcherIndex = pitchers.findIndex(p => p.name === bet.subject);
    const pitcher = pitcherIndex >= 0 ? pitchers[pitcherIndex] : pitchers[0];
    const current = pitcher?.k ?? 0;
    const exceeded = current >= bet.line;
    const isPulled = (isLive || isFinal) && pitcherIndex >= 0 && pitchers.slice(pitcherIndex + 1).some(p => (p.pitches || 0) > 0 || (p.ip && p.ip !== "0.0" && p.ip !== "0"));
    const pct = bet.line > 0 ? Math.min(100, Math.round((current / bet.line) * 100)) : 0;

    let autoStatus: BetStatus | null = null;
    if (isFinal || exceeded || isPulled) {
      autoStatus = bet.isOver ? (exceeded ? "won" : "lost") : (current < bet.line ? "won" : "lost");
    }

    let hint = "";
    if (exceeded) {
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
    const batters = game.liveBoxscore?.[bet.teamSide]?.batters ?? [];
    const batter = batters.find(b => b.name === bet.subject);
    const current = batter?.total_bases ?? 0;
    const exceeded = current >= bet.line;
    const pct = bet.line > 0 ? Math.min(100, Math.round((current / bet.line) * 100)) : 0;
    let autoStatus: BetStatus | null = null;
    if (isFinal || exceeded) autoStatus = bet.isOver ? (exceeded ? "won" : "lost") : (current < bet.line ? "won" : "lost");
    return { current, pct: autoStatus === "won" ? 100 : pct, display: `${current} / ${bet.line} bases`, hint: exceeded ? "¡Línea superada!" : isFinal ? `Final — ${current} bases` : `Necesita ${Math.ceil(bet.line - current)} más`, isLive, isFinal, autoStatus };
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
    if (isFinal) { autoStatus = winning ? "won" : "lost"; pct = autoStatus === "won" ? 100 : 0; }
    return { current: myScore, pct, display: `${myScore} - ${oppScore}`, hint: isFinal ? (winning ? "¡Equipo ganó!" : "Equipo perdió") : (winning ? "Ganando" : "Perdiendo"), isLive, isFinal, autoStatus };
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

function hasResultDataForBet(bet: Bet, game: MLBGame | undefined): boolean {
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

// ════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ════════════════════════════════════════════════════════════════════════════

const CATEGORY_CFG: Record<BetCategory, { label: string; color: string; bg: string }> = {
  pitcher: { label: "Pitcher", color: "text-blue-700", bg: "bg-blue-50 border-blue-200" },
  batter: { label: "Bateador", color: "text-violet-700", bg: "bg-violet-50 border-violet-200" },
  team: { label: "Equipo", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
};

const BOOKMAKERS = ["DraftKings", "FanDuel", "BetMGM", "Caesars", "Pinnacle", "bet365", "ESPNBet", "Otra"];

const StatusBadge: React.FC<{ status: BetStatus }> = ({ status }) => {
  const cfg = {
    pending: { cls: "bg-amber-100 text-amber-700 border-amber-200", label: "Pendiente", Icon: Clock },
    won: { cls: "bg-emerald-100 text-emerald-700 border-emerald-200", label: "Ganada", Icon: CheckCircle2 },
    lost: { cls: "bg-red-100 text-red-600 border-red-200", label: "Perdida", Icon: XCircle },
    void: { cls: "bg-slate-100 text-slate-600 border-slate-200", label: "Nula / Push", Icon: AlertTriangle },
  }[status];
  return <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border ${cfg.cls}`}><cfg.Icon size={11} />{cfg.label}</span>;
};

const LiveProgressBar: React.FC<{ progress: LiveProgress; betStatus: BetStatus; compact?: boolean }> = ({ progress, betStatus, compact }) => {
  const { pct, display, hint, startLabel, isLive, isFinal, autoStatus } = progress;
  const effectiveStatus = betStatus !== "pending" ? betStatus : autoStatus;
  let bar = "from-violet-500 to-indigo-500";
  let dot: React.ReactNode = <Clock size={11} className="text-amber-500" />;
  let label = "Esperando";
  if (effectiveStatus === "won") { bar = "from-emerald-400 to-emerald-600"; dot = <CheckCircle2 size={11} className="text-emerald-600" />; label = "¡Ganó!"; }
  else if (effectiveStatus === "lost") { bar = "from-red-400 to-red-500"; dot = <XCircle size={11} className="text-red-500" />; label = "Perdió"; }
  else if (effectiveStatus === "void") { bar = "from-slate-300 to-slate-450"; dot = <AlertTriangle size={11} className="text-slate-500" />; label = "Push / Nula"; }
  else if (isLive) { dot = <span className="inline-block w-2 h-2 bg-red-500 rounded-full animate-pulse" />; label = "En vivo"; }
  else if (isFinal) { bar = "from-slate-400 to-slate-500"; label = "Finalizado"; }
  else if (startLabel) { label = startLabel; }
  return (
    <div className={`space-y-1.5 ${compact ? "mt-1.5" : "mt-3"}`}>
      <div className="flex justify-between items-center text-[11px]">
        <span className="font-bold text-slate-700">{display}</span>
        <span className="flex items-center gap-1 font-semibold text-slate-500">{dot} {label}</span>
      </div>
      <div className={`w-full bg-slate-100 rounded-full overflow-hidden ${compact ? "h-1" : "h-2"}`}>
        <div className={`h-full rounded-full bg-gradient-to-r transition-all duration-700 ${bar}`} style={{ width: `${pct}%` }} />
      </div>
      {!compact && <p className="text-[10px] text-slate-400 italic">{hint}</p>}
    </div>
  );
};

// Analytics dashboard
const AnalyticsDashboard: React.FC<{ bets: Bet[] }> = ({ bets }) => {
  const closed = bets.filter(b => b.status !== "pending" && b.status !== "void");
  const wins = closed.filter(b => b.status === "won");
  const winRate = closed.length > 0 ? Math.round((wins.length / closed.length) * 100) : 0;
  const totalRisk = closed.reduce((s, b) => s + b.amount, 0);
  const totalReturn = wins.reduce((s, b) => s + b.potentialWin, 0) - closed.filter(b => b.status === "lost").reduce((s, b) => s + b.amount, 0);
  const roi = totalRisk > 0 ? Math.round((totalReturn / totalRisk) * 100) : 0;

  // Streak
  let streak = 0, streakType: "W" | "L" | null = null;
  for (let i = bets.filter(b => b.status !== "pending").length - 1; i >= 0; i--) {
    const b = bets.filter(b => b.status !== "pending")[i];
    const t = b.status === "won" ? "W" : "L";
    if (streakType === null) { streakType = t; streak = 1; }
    else if (t === streakType) streak++;
    else break;
  }

  // Best category
  const catWinRates = (["pitcher", "batter", "team"] as BetCategory[]).map(cat => {
    const c = closed.filter(b => b.betCategory === cat);
    const w = c.filter(b => b.status === "won");
    return { cat, rate: c.length > 0 ? Math.round((w.length / c.length) * 100) : 0, count: c.length };
  }).filter(x => x.count > 0).sort((a, b) => b.rate - a.rate);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 p-4 bg-slate-900 rounded-xl border border-slate-800">
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 bg-violet-900/60 rounded-lg flex items-center justify-center"><Percent size={16} className="text-violet-400" /></div>
        <div><p className="text-[10px] text-slate-500 font-semibold uppercase">Tasa de Acierto</p><p className="text-lg font-bold text-white">{winRate}%</p><p className="text-[10px] text-slate-500">{wins.length}/{closed.length} apuestas</p></div>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 bg-emerald-900/60 rounded-lg flex items-center justify-center"><TrendingUp size={16} className="text-emerald-400" /></div>
        <div><p className="text-[10px] text-slate-500 font-semibold uppercase">ROI</p><p className={`text-lg font-bold ${roi >= 0 ? "text-emerald-400" : "text-red-400"}`}>{roi >= 0 ? "+" : ""}{roi}%</p><p className="text-[10px] text-slate-500">retorno neto</p></div>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 bg-amber-900/60 rounded-lg flex items-center justify-center"><Flame size={16} className="text-amber-400" /></div>
        <div><p className="text-[10px] text-slate-500 font-semibold uppercase">Racha</p>
          <p className={`text-lg font-bold ${streakType === "W" ? "text-emerald-400" : streakType === "L" ? "text-red-400" : "text-slate-400"}`}>
            {streak > 0 && streakType ? `${streak} ${streakType}` : "—"}
          </p>
          <p className="text-[10px] text-slate-500">consecutivas</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 bg-blue-900/60 rounded-lg flex items-center justify-center"><Award size={16} className="text-blue-400" /></div>
        <div><p className="text-[10px] text-slate-500 font-semibold uppercase">Mejor Categoría</p>
          <p className="text-sm font-bold text-white">{catWinRates[0] ? CATEGORY_CFG[catWinRates[0].cat].label : "—"}</p>
          <p className="text-[10px] text-slate-500">{catWinRates[0] ? `${catWinRates[0].rate}% WR` : "sin datos"}</p>
        </div>
      </div>
    </div>
  );
};

// User modal
const UserModal: React.FC<{ onSave: (name: string) => void, onClose: () => void, onDeleteUser: (name: string) => void, globalUsers?: string[] }> = ({ onSave, onClose, onDeleteUser, globalUsers = [] }) => {
  const [name, setName] = useState("");
  const existingUsers = Array.from(new Set([...globalUsers]));

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 space-y-4 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200 p-1.5 rounded-full transition-colors">
          <X size={16} />
        </button>
        <div className="flex flex-col items-center gap-2">
          <div className="w-14 h-14 bg-violet-100 rounded-full flex items-center justify-center"><User size={28} className="text-violet-600" /></div>
          <h2 className="font-bold text-lg text-slate-800">Bienvenido a Bet Tracking</h2>
          <p className="text-xs text-slate-500 text-center">Selecciona un usuario existente o escribe tu nombre.</p>
        </div>

        {existingUsers.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            {existingUsers.map(u => (
              <div key={u} className="relative group">
                <button onClick={() => { setName(u); onSave(u); }}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-violet-100 text-slate-600 hover:text-violet-700 text-xs font-bold rounded-lg border border-slate-200 transition-colors">
                  {u}
                </button>
                <button onClick={(e) => { e.stopPropagation(); onDeleteUser(u); }}
                  className="absolute -top-1.5 -right-1.5 bg-red-100 text-red-600 p-0.5 rounded-full sm:opacity-0 sm:group-hover:opacity-100 transition-opacity z-10"
                  title="Eliminar usuario">
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}

        <input type="text" placeholder="Nuevo usuario o alias" value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && name.trim() && onSave(name.trim())}
          className="w-full border border-slate-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
          autoFocus />
        <button onClick={() => name.trim() && onSave(name.trim())}
          className="w-full py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold rounded-xl hover:from-violet-700 hover:to-indigo-700 transition-all">
          Continuar
        </button>
      </div>
    </div>
  );
};

// Wizard step indicator
const STEPS = [
  { id: 1, label: "Juego", Icon: Users },
  { id: 2, label: "Tipo", Icon: ListChecks },
  { id: 3, label: "Jugador", Icon: User },
  { id: 4, label: "Apuesta", Icon: Zap },
  { id: 5, label: "Detalles", Icon: DollarSign },
];

// ════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════════════════

interface BetTrackingProps {
  games: MLBGame[];
  onRefreshGame: (gameId: string, date: string) => Promise<MLBGame | void>;
}

export const BetTracking: React.FC<BetTrackingProps> = ({ games, onRefreshGame }) => {

  // ── User ──────────────────────────────────────────────────────────────────
  const [userName, setUserName] = useState<string>(() => loadUsername());
  const [showUserModal, setShowUserModal] = useState<boolean>(() => !loadUsername());
  const [showGameModal, setShowGameModal] = useState<boolean>(false);

  // ── Date ─────────────────────────────────────────────────────────────────
  const [betDate, setBetDate] = useState<string>(todayStr);
  const [dateGames, setDateGames] = useState<MLBGame[]>([]);
  const markedDates = useMemo(() => new Set(datesWithBets()), [betDate]);
  const [oddsFormat, setOddsFormat] = useState<OddsFormat>(() => loadOddsFormat());
  const handleOddsFormat = (f: OddsFormat) => { setOddsFormat(f); saveOddsFormat(f); };

  useEffect(() => {
    fetch(`/api/games?date=${betDate}`)
      .then(r => r.json())
      .then(d => setDateGames(d.games || []))
      .catch(e => console.error("Error al cargar dateGames para bets:", e));
  }, [betDate]);

  // ── Bets ──────────────────────────────────────────────────────────────────
  const [bets, setBets] = useState<Bet[]>(() => loadBets(todayStr()));
  const [filter, setFilter] = useState<"all" | BetStatus>("all");
  const [userFilter, setUserFilter] = useState<string>("all");
  const [expandedBets, setExpandedBets] = useState<Set<number>>(new Set());
  const [refreshingIds, setRefreshingIds] = useState<Set<string>>(new Set());
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
  const autoHydratedResultGamesRef = React.useRef<Set<string>>(new Set());
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Load and Sync bets when date changes
  useEffect(() => {
    // Initial local load
    setBets(loadBets(betDate));

    // Sync with Firestore
    const unsubscribe = syncBets(betDate, (dbBets) => {
      // Avoid overwriting if db is empty and we have local bets (migration)
      const currentLocal = loadBets(betDate);
      if (dbBets.length === 0 && currentLocal.length > 0) {
        void saveBetsDb(betDate, currentLocal).catch(error => {
          console.error("Error migrando apuestas locales a Firestore:", error);
        });
      } else {
        setBets(dbBets);
        saveBets(betDate, dbBets);
      }
    });

    return () => unsubscribe();
  }, [betDate]);

  const [globalUsers, setGlobalUsers] = useState<string[]>([]);
  useEffect(() => {
    const unsub = syncUsers((users) => setGlobalUsers(users));
    return () => unsub();
  }, []);

  const updateBets = (updater: (prev: Bet[]) => Bet[]) => {
    setBets(prev => {
      const next = updater(prev);
      saveBets(betDate, next); // local
      void saveBetsDb(betDate, next).catch(error => {
        console.error("Error guardando apuestas en Firestore:", error);
      });
      return next;
    });
  };

  // ── Wizard ────────────────────────────────────────────────────────────────
  const [editingBetId, setEditingBetId] = useState<number | null>(null);
  const [step, setStep] = useState(1);
  const [selectedGameId, setSelectedGameId] = useState("");
  const [selectedTeamSide, setSelectedTeamSide] = useState<"home" | "away" | "">("");
  const [category, setCategory] = useState<BetCategory | "">("");
  const [subject, setSubject] = useState("");
  const [betTypeKey, setBetTypeKey] = useState<BetTypeKey | "">("");
  const [betLabel, setBetLabel] = useState("");
  const [isOver, setIsOver] = useState(true);
  const [line, setLine] = useState("");
  const [bookmaker, setBookmaker] = useState("");
  const [amount, setAmount] = useState("");
  const [odds, setOdds] = useState("");
  const [note, setNote] = useState("");
  const [showSmartPaste, setShowSmartPaste] = useState(false);
  const [smartPasteText, setSmartPasteText] = useState("");
  const [smartPasteError, setSmartPasteError] = useState("");

  const potentialWin = useMemo(() => calcPotentialWin(parseFloat(amount) || 0, odds, oddsFormat), [amount, odds, oddsFormat]);

  const selectedGame = useMemo(() => games.find(g => String(g.id) === selectedGameId) ?? null, [games, selectedGameId]);
  const teamName = selectedGame ? (selectedTeamSide === "home" ? selectedGame.metadata.homeTeam : selectedGame.metadata.awayTeam) : "";
  const opponentName = selectedGame ? (selectedTeamSide === "home" ? selectedGame.metadata.awayTeam : selectedGame.metadata.homeTeam) : "";
  const pitcherName = selectedGame && selectedTeamSide ? (selectedTeamSide === "home" ? selectedGame.pitchers.home.name : selectedGame.pitchers.away.name) : "";
  const lineupBatters = useMemo((): string[] => {
    if (!selectedGame || !selectedTeamSide) return [];
    return (selectedTeamSide === "home" ? selectedGame.lineups.home : selectedGame.lineups.away).map(b => b.name).filter(Boolean);
  }, [selectedGame, selectedTeamSide]);

  const needsLine = betTypeKey === "pitcher_k" || betTypeKey === "batter_tb";

  const canNext = () => {
    if (step === 1) return !!selectedGameId && !!selectedTeamSide;
    if (step === 2) return !!category;
    if (step === 3) return !!subject;
    if (step === 4) return !!betLabel && (!needsLine || line.trim() !== "");
    return true;
  };

  const resetForm = () => {
    setEditingBetId(null);
    setStep(1); setSelectedGameId(""); setSelectedTeamSide(""); setCategory("");
    setSubject(""); setBetTypeKey(""); setBetLabel(""); setIsOver(true);
    setLine(""); setBookmaker(""); setAmount(""); setOdds(""); setNote("");
    setShowSmartPaste(false); setSmartPasteText(""); setSmartPasteError("");
  };

  // ── Smart Paste Parser ──────────────────────────────────────────────────
  const parseSmartPaste = () => {
    setSmartPasteError("");
    const text = smartPasteText;
    if (!text.trim()) { setSmartPasteError("Pega el texto de la apuesta."); return; }

    // Extract teams
    const teamsMatch = text.match(/(?:Juego:)?\s*([A-Z][A-Za-z\s\.]+)\s+vs\.?\s+([A-Z][A-Za-z\s\.]+)(?:\r?\n|$)/i) || text.match(/([A-Z][A-Za-z\s\.]+)\s+vs\.?\s+([A-Z][A-Za-z\s\.]+)/i);
    const awayTeamRaw = teamsMatch ? teamsMatch[1].trim() : "";
    const homeTeamRaw = teamsMatch ? teamsMatch[2].trim() : "";

    // Find matching game
    const allGames = [...games, ...dateGames];
    let matchedGame: typeof games[0] | null = null;
    let matchedSide: "home" | "away" = "away";
    for (const g of allGames) {
      const home = g.metadata.homeTeam.toLowerCase();
      const away = g.metadata.awayTeam.toLowerCase();
      const h6 = homeTeamRaw.toLowerCase().slice(0, 6);
      const a6 = awayTeamRaw.toLowerCase().slice(0, 6);
      if ((home.includes(h6) || h6.includes(home.slice(0, 6))) &&
        (away.includes(a6) || a6.includes(away.slice(0, 6)))) {
        matchedGame = g; break;
      }
    }
    if (!matchedGame) {
      setSmartPasteError("No se encontró el juego. Verifica que los datos estén cargados.");
      return;
    }

    // Extract subject and pick
    const explicitSubject = text.match(/(?:🎯|Target:|Player:|1️⃣)\s*([^\n—\-]+)/i);
    const explicitPick = text.match(/(?:📌\s*(?:Pick|Lean|Play|Apuesta):?|📌|(?:Pick|Lean|Play|Apuesta):)\s*([^\n]+)/i);
    const firstLineMatch = text.match(/(?:^|\n)(?:.*?)\b([A-Za-z\s\.]+?)\s*[—\-]\s*([^\n]+)/i);

    const subjectRaw = explicitSubject ? explicitSubject[1].trim() : (firstLineMatch ? firstLineMatch[1].trim() : "");
    const pickLine = explicitPick ? explicitPick[1].trim() : (firstLineMatch ? firstLineMatch[2].trim() : text);

    // Over/Under & line value
    const overUnderMatch = pickLine.match(/(over|under)\s*([\d.]+)/i);
    const isOverParsed = overUnderMatch ? overUnderMatch[1].toLowerCase() === "over" : true;
    const lineParsed = overUnderMatch ? overUnderMatch[2] : "";

    // Bet type detection
    let betTypeParsed: BetTypeKey = "pitcher_k";
    let betLabelParsed = pickLine;
    let categoryParsed: BetCategory = "pitcher";
    if (/\bk\b|strikeout|ponche/i.test(pickLine)) {
      betTypeParsed = "pitcher_k"; categoryParsed = "pitcher";
      betLabelParsed = `${isOverParsed ? "Over" : "Under"} ${lineParsed} Ks`;
    } else if (/total base|tb\b/i.test(pickLine)) {
      betTypeParsed = "batter_tb"; categoryParsed = "batter";
      betLabelParsed = `${isOverParsed ? "Over" : "Under"} ${lineParsed} TB`;
    } else if (/\bml\b|moneyline/i.test(pickLine)) {
      betTypeParsed = "team_ml"; categoryParsed = "team";
      betLabelParsed = "Moneyline";
    } else if (/\bf5\b|first 5/i.test(pickLine)) {
      betTypeParsed = "team_f5"; categoryParsed = "team";
      betLabelParsed = "First 5 Innings";
    }

    // Odds
    let oddsParsed = "";
    const oddsMatch = text.match(/(?:@|Cuota:\s*)([+-]?\d+(?:\.\d+)?)(?:\s*\/\s*([+-]?\d+(?:\.\d+)?))?/i);
    if (oddsMatch) {
      const val1 = oddsMatch[1];
      const val2 = oddsMatch[2];
      if (val2) {
        const isVal1American = val1.startsWith('+') || val1.startsWith('-') || Math.abs(parseFloat(val1)) >= 100;
        const val1MatchesFormat = (oddsFormat === "american" && isVal1American) || (oddsFormat === "decimal" && !isVal1American);
        oddsParsed = val1MatchesFormat ? val1 : val2;
      } else {
        oddsParsed = val1;
      }
      oddsParsed = oddsForFormat(oddsParsed, oddsFormat);
    }

    // Amount
    const amountMatch = text.match(/(?:monto|amount|stake)[:\s]*\$?([\d.]+)/i) || text.match(/\$([\d.]+)/i);
    const amountParsed = amountMatch ? amountMatch[1] : "";

    // Determine team side
    if (subjectRaw) {
      const homePitcher = matchedGame.pitchers?.home?.name || "";
      const awayPitcher = matchedGame.pitchers?.away?.name || "";
      const homeLineup = (matchedGame.lineups?.home || []).map((p: any) => (p.name || "").toLowerCase());
      const awayLineup = (matchedGame.lineups?.away || []).map((p: any) => (p.name || "").toLowerCase());
      const s6 = subjectRaw.toLowerCase().slice(0, 6);
      if (homePitcher.toLowerCase().includes(s6) || homeLineup.some((n: string) => n.includes(s6))) {
        matchedSide = "home";
      } else if (awayPitcher.toLowerCase().includes(s6) || awayLineup.some((n: string) => n.includes(s6))) {
        matchedSide = "away";
      } else {
        matchedSide = text.toLowerCase().includes(matchedGame.metadata.homeTeam.toLowerCase().slice(0, 6)) ? "home" : "away";
      }
    }

    // Fill form fields
    setSelectedGameId(String(matchedGame.id));
    setSelectedTeamSide(matchedSide);
    setCategory(categoryParsed);
    setSubject(subjectRaw || (matchedSide === "home" ? matchedGame.metadata.homeTeam : matchedGame.metadata.awayTeam));
    setBetTypeKey(betTypeParsed);
    setBetLabel(betLabelParsed);
    setIsOver(isOverParsed);
    setLine(lineParsed);
    if (oddsParsed) setOdds(oddsParsed);
    if (amountParsed) setAmount(amountParsed);
    
    setStep(5);
    setShowSmartPaste(false);
    setSmartPasteText("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (step !== 5) {
      if (canNext()) setStep(s => s + 1);
      return;
    }
    if (!selectedGame || !category || !subject || !betLabel || !betTypeKey) return;

    if (editingBetId) {
      updateBets(prev => prev.map(b => b.id === editingBetId ? {
        ...b,
        gameId: selectedGameId,
        teamName,
        opponentName,
        teamSide: selectedTeamSide as "home" | "away",
        subject,
        betLabel,
        betCategory: category as BetCategory,
        line: parseFloat(line) || 0,
        isOver,
        betTypeKey: betTypeKey as BetTypeKey,
        bookmaker,
        amount: parseFloat(amount) || 0,
        odds: odds.trim() || "—",
        potentialWin,
        note: note.trim(),
      } : b));
    } else {
      const newBet: Bet = {
        id: Date.now(),
        date: betDate,
        userName,
        gameId: selectedGameId,
        teamName,
        opponentName,
        teamSide: selectedTeamSide as "home" | "away",
        subject,
        betLabel,
        betCategory: category as BetCategory,
        line: parseFloat(line) || 0,
        isOver,
        betTypeKey: betTypeKey as BetTypeKey,
        bookmaker,
        amount: parseFloat(amount) || 0,
        odds: odds.trim() || "—",
        potentialWin,
        note: note.trim(),
        createdAt: new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }),
        status: "pending",
      };
      updateBets(prev => [newBet, ...prev]);
    }
    resetForm();
  };

  const editBet = (bet: Bet) => {
    setEditingBetId(bet.id);
    setSelectedGameId(bet.gameId);
    setSelectedTeamSide(bet.teamSide);
    setCategory(bet.betCategory);
    setSubject(bet.subject);
    setBetTypeKey(bet.betTypeKey);
    setBetLabel(bet.betLabel);
    setIsOver(bet.isOver);
    setLine(bet.line ? String(bet.line) : "");
    setBookmaker(bet.bookmaker || "");
    setAmount(bet.amount ? String(bet.amount) : "");
    setOdds(oddsForFormat(bet.odds, oddsFormat));
    setNote(bet.note || "");
    setNote(bet.note || "");
    setStep(5);
  };

  // Auto-resolve
  const resolvedBets = useMemo(() => bets.map(bet => {
    // Buscar en games (prop live) primero, y si no, en dateGames
    const game = games.find(g => String(g.id) === bet.gameId) || dateGames.find(g => String(g.id) === bet.gameId);
    const progress = resolveLiveProgress(bet, game);
    const status = bet.status === "pending" && progress.autoStatus ? progress.autoStatus : bet.status;
    return { bet: { ...bet, status }, progress, game };
  }), [bets, dateGames, games]);

  useEffect(() => {
    const betsToUpdate = resolvedBets.filter(r => {
      const original = bets.find(b => b.id === r.bet.id);
      return original && original.status !== r.bet.status;
    });

    if (betsToUpdate.length > 0) {
      updateBets(prev => {
        let changed = false;
        const next = prev.map(b => {
          const r = resolvedBets.find(res => res.bet.id === b.id);
          if (r && r.bet.status !== b.status) {
            changed = true;
            return r.bet;
          }
          return b;
        });
        return changed ? next : prev;
      });
    }
  }, [resolvedBets]);

  const replaceDateGame = (updatedGame: MLBGame | void) => {
    if (!updatedGame) return;
    setDateGames(prev => {
      const exists = prev.some(g => String(g.id) === String(updatedGame.id));
      if (!exists) return [...prev, updatedGame];
      return prev.map(g => String(g.id) === String(updatedGame.id) ? updatedGame : g);
    });
  };

  useEffect(() => {
    const missingResultGameIds = Array.from(new Set(
      bets
        .filter(b => b.status !== "pending")
        .filter(b => {
          const game = dateGames.find(g => String(g.id) === b.gameId) || games.find(g => String(g.id) === b.gameId);
          return !hasResultDataForBet(b, game);
        })
        .map(b => b.gameId)
        .filter(gameId => !autoHydratedResultGamesRef.current.has(`${betDate}:${gameId}`))
    ));

    if (missingResultGameIds.length === 0) return;

    missingResultGameIds.forEach(gameId => autoHydratedResultGamesRef.current.add(`${betDate}:${gameId}`));
    missingResultGameIds.forEach(async (gameId) => {
      setRefreshingIds(prev => new Set(prev).add(gameId));
      try {
        const updatedGame = await onRefreshGame(gameId, betDate);
        replaceDateGame(updatedGame);
      } catch (error) {
        console.error("Error hidratando resultados de apuesta cerrada:", error);
      } finally {
        setRefreshingIds(prev => {
          const next = new Set(prev);
          next.delete(gameId);
          return next;
        });
      }
    });
  }, [betDate, bets, dateGames, games, onRefreshGame]);

  const deleteBet = (id: number) => updateBets(prev => prev.filter(b => b.id !== id));

  const handleRefreshBet = async (gameId: string) => {
    setRefreshingIds(prev => new Set(prev).add(gameId));
    try {
      const updatedGame = await onRefreshGame(gameId, betDate);
      replaceDateGame(updatedGame);
    }
    finally { setRefreshingIds(prev => { const n = new Set(prev); n.delete(gameId); return n; }); }
  };

  const handleRefreshPending = async () => {
    const pendingGameIds = Array.from(new Set(bets.filter(b => b.status === "pending").map(b => b.gameId)));
    if (pendingGameIds.length === 0) return;

    setIsRefreshingAll(true);
    try {
      await Promise.all(pendingGameIds.map(async (gid) => {
        setRefreshingIds(prev => new Set(prev).add(gid));
        try {
          const updatedGame = await onRefreshGame(gid, betDate);
          replaceDateGame(updatedGame);
        }
        finally { setRefreshingIds(prev => { const n = new Set(prev); n.delete(gid); return n; }); }
      }));
    } finally {
      setIsRefreshingAll(false);
    }
  };

  const uniqueUsers = useMemo(() => {
    return Array.from(new Set(resolvedBets.map(r => r.bet.userName).filter(Boolean)));
  }, [resolvedBets]);

  const filteredByUser = userFilter === "all" ? resolvedBets : resolvedBets.filter(r => r.bet.userName === userFilter);

  const allBets = filteredByUser.map(r => r.bet);
  const won = allBets.filter(b => b.status === "won").reduce((s, b) => s + b.amount, 0);
  const wonReturn = allBets.filter(b => b.status === "won").reduce((s, b) => s + b.potentialWin, 0);
  const lost = allBets.filter(b => b.status === "lost").reduce((s, b) => s + b.amount, 0);
  const pending = allBets.filter(b => b.status === "pending").reduce((s, b) => s + b.amount, 0);
  const net = wonReturn - lost;

  const filtered = filter === "all" ? filteredByUser : filteredByUser.filter(r => r.bet.status === filter);

  const handleUserSave = (name: string) => {
    saveUsername(name);
    setUserName(name);
    setShowUserModal(false);
    void registerUserDb(name).catch(error => {
      console.error("Error registrando usuario de apuestas en Firestore:", error);
    });
  };

  const handleDeleteUser = (name: string) => {
    if (window.confirm(`¿Estás seguro de que deseas eliminar al usuario "${name}"? Esto no borrará sus apuestas existentes, solo lo quitará de la lista.`)) {
      void deleteUserDb(name).catch(error => {
        console.error("Error eliminando usuario de apuestas en Firestore:", error);
      });
      if (userName === name) {
        saveUsername("");
        setUserName("");
      }
    }
  };

  const changeDate = (delta: number) => {
    const d = new Date(betDate + "T12:00:00");
    d.setDate(d.getDate() + delta);
    setBetDate(d.toISOString().split("T")[0]);
  };

  const toggleCollapse = (id: number) => {
    setExpandedBets(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 font-sans">
      {showUserModal && <UserModal onSave={handleUserSave} onClose={() => setShowUserModal(false)} onDeleteUser={handleDeleteUser} globalUsers={globalUsers} />}

      {showGameModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[85vh] animate-fade-in">
            <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-slate-50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Trophy size={16} className="text-violet-600" />
                Selecciona un Juego
              </h3>
              <button onClick={() => setShowGameModal(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-200 transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="p-3 overflow-y-auto space-y-3 bg-slate-50/50">
              {games.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-6">No hay juegos cargados para este día.</p>
              ) : (
                games.map(g => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => {
                      setSelectedGameId(String(g.id));
                      setSelectedTeamSide("");
                      setShowGameModal(false);
                    }}
                    className="w-full rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all border border-slate-200 group text-left relative focus:outline-none focus:ring-2 focus:ring-violet-400"
                  >
                    <div className="absolute inset-0 opacity-10 group-hover:opacity-20 transition-opacity" style={{
                      background: `linear-gradient(110deg, ${getTeamColor(g.metadata.awayTeam)} 0%, ${getTeamColor(g.metadata.awayTeam)} 50%, ${getTeamColor(g.metadata.homeTeam)} 50%, ${getTeamColor(g.metadata.homeTeam)} 100%)`
                    }} />
                    <div className="relative p-3 flex justify-between items-center bg-white/90 backdrop-blur-sm">
                      {/* Away */}
                      <div className="flex flex-col items-center gap-1 w-[40%]">
                        <div className="w-12 h-12 bg-white rounded-full shadow-sm border border-slate-100 flex items-center justify-center p-1.5 shrink-0">
                          <img src={getTeamLogo(g.metadata.awayTeam) as string} className="w-full h-full object-contain" alt="" />
                        </div>
                        <span className="text-xs font-bold text-slate-800 text-center leading-tight">
                          {getTeamAbbr(g.metadata.awayTeam)}
                        </span>
                      </div>

                      {/* @ */}
                      <div className="text-xs font-black text-slate-300 italic shrink-0 w-[20%] text-center">
                        @
                      </div>

                      {/* Home */}
                      <div className="flex flex-col items-center gap-1 w-[40%]">
                        <div className="w-12 h-12 bg-white rounded-full shadow-sm border border-slate-100 flex items-center justify-center p-1.5 shrink-0">
                          <img src={getTeamLogo(g.metadata.homeTeam) as string} className="w-full h-full object-contain" alt="" />
                        </div>
                        <span className="text-xs font-bold text-slate-800 text-center leading-tight">
                          {getTeamAbbr(g.metadata.homeTeam)}
                        </span>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
        {/* Date nav */}
        <div className="flex items-center gap-2">
          <button onClick={() => changeDate(-1)} className="p-1.5 rounded-lg hover:bg-slate-100 border border-slate-200 transition-colors"><ChevronLeft size={14} /></button>
          <div className="relative">
            <input type="date" value={betDate} onChange={e => setBetDate(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white" />
            {markedDates.has(betDate) && (
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-violet-500 rounded-full" />
            )}
          </div>
          <button onClick={() => changeDate(1)} disabled={betDate >= todayStr()} className="p-1.5 rounded-lg hover:bg-slate-100 border border-slate-200 transition-colors disabled:opacity-40"><ArrowRight size={14} /></button>
          {betDate !== todayStr() && (
            <button onClick={() => setBetDate(todayStr())} className="text-[11px] font-semibold text-violet-600 hover:underline">Hoy</button>
          )}
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2">
          {/* Refresh All */}
          <button onClick={handleRefreshPending} disabled={isRefreshingAll || bets.filter(b => b.status === "pending").length === 0}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-violet-100 hover:bg-violet-200 text-violet-700 rounded-lg text-xs font-bold transition-colors disabled:opacity-40 shadow-sm border border-violet-200">
            <RefreshCw size={12} className={isRefreshingAll ? "animate-spin" : ""} />
            Actualizar Apuestas Activas
          </button>

          {/* User */}
          <button onClick={() => setShowUserModal(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-semibold text-slate-700 transition-colors border border-slate-200">
            <User size={12} className="text-violet-600" />
            {userName || "Sin nombre"}
          </button>

          {/* Analytics */}
          <button onClick={() => setShowAnalytics(v => !v)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${showAnalytics ? "bg-violet-600 text-white border-violet-600" : "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200"}`}>
            <BarChart2 size={12} /> Stats
          </button>

          {/* Export */}
          <div className="relative">
            <button onClick={() => setShowExportMenu(v => !v)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-semibold text-slate-700 transition-colors border border-slate-200">
              <Download size={12} /> Exportar
            </button>
            {showExportMenu && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-20 min-w-[120px]">
                <button onClick={() => { exportCSV(allBets, betDate); setShowExportMenu(false); }}
                  className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                  <BookOpen size={12} /> CSV
                </button>
                <button onClick={() => { exportJSON(allBets, betDate); setShowExportMenu(false); }}
                  className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                  <BookOpen size={12} /> JSON
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Analytics ──────────────────────────────────────────────────────── */}
      {showAnalytics && <AnalyticsDashboard bets={allBets} />}

      {/* ── Summary cards ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "En juego", value: `$${pending.toFixed(0)}`, Icon: Clock, color: "text-amber-600 bg-amber-50 border-amber-200" },
          { label: "Ganadas", value: `+$${wonReturn.toFixed(0)}`, Icon: Trophy, color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
          { label: "Perdidas", value: `-$${lost.toFixed(0)}`, Icon: XCircle, color: "text-red-600 bg-red-50 border-red-200" },
          { label: "Neto", value: `${net >= 0 ? "+" : ""}$${net.toFixed(0)}`, Icon: TrendingUp, color: net >= 0 ? "text-emerald-600 bg-emerald-50 border-emerald-200" : "text-red-600 bg-red-50 border-red-200" },
        ].map(({ label, value, Icon, color }) => (
          <div key={label} className={`border rounded-xl p-3 flex items-center gap-3 ${color}`}>
            <div className="p-2 rounded-lg bg-white shadow-sm"><Icon size={14} /></div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider opacity-70">{label}</p>
              <p className="text-base font-bold leading-tight">{value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* ── Wizard ──────────────────────────────────────────────────────────── */}
        <div className="lg:col-span-2 bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PlusCircle size={14} className="text-violet-600" />
              <h3 className="font-bold text-sm text-slate-800">{editingBetId ? "Editar Apuesta" : "Nueva Apuesta"}</h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { setShowSmartPaste(v => !v); setSmartPasteError(""); }}
                title="Pegar texto de apuesta"
                className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg border transition ${showSmartPaste
                  ? "bg-violet-600 text-white border-violet-600"
                  : "bg-white text-violet-600 border-violet-300 hover:bg-violet-50"
                  }`}
              >
                <Zap size={10} /> Smart Paste
              </button>
              {editingBetId && (
                <button onClick={resetForm} className="text-xs font-semibold text-slate-500 hover:text-slate-700 border border-slate-200 px-2 py-1 rounded-md bg-white">
                  Cancelar edición
                </button>
              )}
            </div>
          </div>

          {/* Smart Paste Panel */}
          {showSmartPaste && (
            <div className="bg-violet-50 border border-violet-200 rounded-xl p-3 space-y-2 mt-3 animate-fade-in">
              <p className="text-[10px] text-violet-700 font-semibold flex items-center gap-1">
                <Zap size={10} /> Pega el slip de tu apuesta aqui:
              </p>
              <textarea
                className="w-full text-[11px] font-mono border border-violet-200 rounded-lg p-2 bg-white resize-none focus:outline-none focus:ring-1 focus:ring-violet-400 leading-relaxed"
                rows={6}
                placeholder="7:45 PM ET\nArizona Diamondbacks vs St. Louis Cardinals\nMichael McGreevy - St. Louis Cardinals\nPick: Over 2.5 Ks @-168\nmonto: $55"
                value={smartPasteText}
                onChange={e => setSmartPasteText(e.target.value)}
              />
              {smartPasteError && (
                <p className="text-[10px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-2 py-1 flex items-center gap-1">
                  <AlertTriangle size={10} /> {smartPasteError}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={parseSmartPaste}
                  className="flex-1 bg-violet-600 hover:bg-violet-700 text-white text-[11px] font-bold py-1.5 rounded-lg transition flex items-center justify-center gap-1"
                >
                  <Zap size={11} /> Importar apuesta
                </button>
                <button
                  type="button"
                  onClick={() => { setShowSmartPaste(false); setSmartPasteText(""); setSmartPasteError(""); }}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-[11px] text-slate-500 hover:bg-slate-100 bg-white"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Steps */}
          <div className="flex items-center gap-1 flex-wrap">
            {STEPS.map((s, i) => (
              <React.Fragment key={s.id}>
                <button type="button" onClick={() => s.id < step && setStep(s.id)}
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${step === s.id ? "bg-violet-600 text-white shadow-sm" : s.id < step ? "bg-violet-100 text-violet-700 cursor-pointer hover:bg-violet-200" : "bg-slate-200 text-slate-400 cursor-default"}`}>
                  <s.Icon size={10} />{s.label}
                </button>
                {i < STEPS.length - 1 && <ChevronRight size={10} className="text-slate-300 shrink-0" />}
              </React.Fragment>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">

            {/* Step 1 */}
            {step === 1 && (
              <div className="space-y-3 animate-fade-in">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Juego del día</label>
                  {games.length === 0
                    ? <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-2"><AlertTriangle size={13} /> Extrae datos primero.</p>
                    : (
                      <button
                        type="button"
                        onClick={() => setShowGameModal(true)}
                        className="w-full border border-slate-200 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white text-left flex justify-between items-center transition-shadow hover:shadow-sm"
                      >
                        {selectedGame ? (
                          <div className="flex items-center gap-3">
                            <div className="flex items-center">
                              <img src={getTeamLogo(selectedGame.metadata.awayTeam) as string} className="w-6 h-6 object-contain" alt="" />
                              <span className="mx-1.5 text-xs text-slate-400 font-bold italic">@</span>
                              <img src={getTeamLogo(selectedGame.metadata.homeTeam) as string} className="w-6 h-6 object-contain" alt="" />
                            </div>
                            <span className="font-semibold text-slate-800">{getTeamAbbr(selectedGame.metadata.awayTeam)} @ {getTeamAbbr(selectedGame.metadata.homeTeam)}</span>
                          </div>
                        ) : (
                          <span className="text-slate-500 font-medium">— Selecciona el juego —</span>
                        )}
                        <ChevronDown size={16} className="text-slate-400" />
                      </button>
                    )}
                </div>
                {selectedGame && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">¿A qué equipo le juegas?</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(["away", "home"] as const).map(side => {
                        const name = side === "home" ? selectedGame.metadata.homeTeam : selectedGame.metadata.awayTeam;
                        return <button key={side} type="button" onClick={() => setSelectedTeamSide(side)}
                          className={`py-2.5 px-3 rounded-lg border text-xs font-bold transition-all ${selectedTeamSide === side ? "bg-violet-600 text-white border-violet-600 shadow" : "bg-white border-slate-200 text-slate-700 hover:border-violet-300"}`}>
                          {name}<span className={`block text-[10px] font-normal mt-0.5 ${selectedTeamSide === side ? "text-violet-200" : "text-slate-400"}`}>{side === "home" ? "Local" : "Visitante"}</span>
                        </button>;
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Step 2 */}
            {step === 2 && (
              <div className="space-y-2 animate-fade-in">
                <label className="block text-xs font-semibold text-slate-600 mb-1">¿A qué le apuestas?</label>
                <p className="text-[11px] text-slate-500 mb-2">{teamName} vs {opponentName}</p>
                {[
                  { val: "pitcher" as BetCategory, label: "🎯 Pitcher — Ponches (K's)", desc: pitcherName || "Sin abridor" },
                  { val: "batter" as BetCategory, label: "⚾ Bateador — Total de bases", desc: `${lineupBatters.length} jugadores` },
                  { val: "team" as BetCategory, label: "🏟️ Equipo — Resultado", desc: "Al juego o al 5to inning" },
                ].map(opt => (
                  <button key={opt.val} type="button" onClick={() => { setCategory(opt.val); setSubject(""); setBetTypeKey(""); setBetLabel(""); }}
                    className={`w-full text-left px-3 py-2.5 rounded-lg border text-xs font-semibold transition-all ${category === opt.val ? "bg-violet-600 text-white border-violet-600 shadow" : "bg-white border-slate-200 text-slate-700 hover:border-violet-300"}`}>
                    <span className="block">{opt.label}</span>
                    <span className={`block font-normal mt-0.5 ${category === opt.val ? "text-violet-200" : "text-slate-400"}`}>{opt.desc}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Step 3 */}
            {step === 3 && (
              <div className="space-y-2 animate-fade-in">
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  {category === "pitcher" ? "Pitcher titular" : category === "batter" ? "Selecciona el bateador" : "Equipo"}
                </label>
                {category === "pitcher" && (
                  <button type="button" onClick={() => setSubject(pitcherName)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm font-bold transition-all ${subject === pitcherName ? "bg-violet-600 text-white border-violet-600" : "bg-white border-slate-200 text-slate-700 hover:border-violet-300"}`}>
                    {pitcherName || "Sin datos de pitcher"}
                  </button>
                )}
                {category === "batter" && (
                  <div className="max-h-52 overflow-y-auto space-y-1 pr-0.5">
                    {lineupBatters.length === 0
                      ? <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-3"><AlertTriangle size={12} className="inline mr-1" />Sin lineup disponible.</p>
                      : lineupBatters.map(s => <button key={s} type="button" onClick={() => setSubject(s)}
                        className={`w-full text-left px-3 py-2 rounded-lg border text-xs font-semibold transition-all ${subject === s ? "bg-violet-600 text-white border-violet-600" : "bg-white border-slate-200 text-slate-700 hover:border-violet-300"}`}>{s}</button>)}
                  </div>
                )}
                {category === "team" && (
                  <button type="button" onClick={() => setSubject(teamName)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm font-bold transition-all ${subject === teamName ? "bg-violet-600 text-white border-violet-600" : "bg-white border-slate-200 text-slate-700 hover:border-violet-300"}`}>
                    {teamName}
                  </button>
                )}
              </div>
            )}

            {/* Step 4 */}
            {step === 4 && (
              <div className="space-y-2 animate-fade-in">
                <label className="block text-xs font-semibold text-slate-600 mb-1">Tipo de apuesta</label>
                <p className="text-[11px] text-slate-500 mb-2"><strong>{subject}</strong> · {teamName}</p>
                {(category === "pitcher" || category === "batter") && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { key: category === "pitcher" ? "pitcher_k" : "batter_tb", label: category === "pitcher" ? "Más de (Over) K's" : "Más de (Over) Bases", over: true },
                        { key: category === "pitcher" ? "pitcher_k" : "batter_tb", label: category === "pitcher" ? "Menos de (Under) K's" : "Menos de (Under) Bases", over: false },
                      ].map(opt => (
                        <button key={opt.label} type="button"
                          onClick={() => { setBetTypeKey(opt.key as BetTypeKey); setIsOver(opt.over); setBetLabel(opt.label); }}
                          className={`py-2.5 px-2 rounded-lg border text-xs font-bold transition-all ${betLabel === opt.label ? "bg-violet-600 text-white border-violet-600 shadow" : "bg-white border-slate-200 text-slate-700 hover:border-violet-300"}`}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    {betLabel && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Línea</label>
                        <input type="number" min="0" step="0.5" placeholder={category === "pitcher" ? "Ej. 5.5" : "Ej. 1.5"} value={line} onChange={e => setLine(e.target.value)}
                          className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white" />
                      </div>
                    )}
                  </>
                )}
                {category === "team" && (
                  <div className="space-y-1">
                    {[
                      { key: "team_ml" as const, label: "Moneyline — al final del juego" },
                      { key: "team_f5" as const, label: "Moneyline — al 5to inning (F5)" },
                    ].map(opt => (
                      <button key={opt.key} type="button" onClick={() => { setBetTypeKey(opt.key); setBetLabel(opt.label); setIsOver(true); }}
                        className={`w-full text-left px-3 py-2.5 rounded-lg border text-xs font-semibold transition-all ${betTypeKey === opt.key ? "bg-violet-600 text-white border-violet-600 shadow" : "bg-white border-slate-200 text-slate-700 hover:border-violet-300"}`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Step 5 */}
            {step === 5 && (
              <div className="space-y-3 animate-fade-in">
                {/* Bet summary pill */}
                <div className={`p-2.5 rounded-lg border text-xs font-semibold ${CATEGORY_CFG[category as BetCategory]?.bg} ${CATEGORY_CFG[category as BetCategory]?.color}`}>
                  <strong>{subject}</strong> · {betLabel}{needsLine && line ? ` ${line}` : ""}
                  <br /><span className="font-normal opacity-80">{teamName} vs {opponentName}</span>
                </div>

                {/* Monto — prominente */}
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">💵 Monto apostado (USD)</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-3 flex items-center text-slate-400 font-bold text-lg pointer-events-none">$</span>
                    <input
                      type="number" min="0" step="any" placeholder="0.00"
                      value={amount} onChange={e => setAmount(e.target.value)}
                      autoFocus
                      className="w-full border-2 border-violet-300 rounded-xl pl-8 pr-4 py-3 text-xl font-bold focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white text-slate-800"
                    />
                  </div>
                </div>

                {/* Odds con toggle de formato */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-sm font-bold text-slate-700">📊 Odds / Cuota</label>
                    <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-lg">
                      <button type="button"
                        onClick={() => { handleOddsFormat("american"); setOdds(""); }}
                        className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all ${oddsFormat === "american" ? "bg-white shadow text-violet-700" : "text-slate-500 hover:text-slate-700"}`}>
                        Americano
                      </button>
                      <button type="button"
                        onClick={() => { handleOddsFormat("decimal"); setOdds(""); }}
                        className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all ${oddsFormat === "decimal" ? "bg-white shadow text-violet-700" : "text-slate-500 hover:text-slate-700"}`}>
                        Decimal
                      </button>
                    </div>
                  </div>
                  <input
                    type="text"
                    placeholder={oddsFormat === "american" ? "Ej. -110 o +150" : "Ej. 1.91 o 2.50"}
                    value={odds}
                    onChange={e => setOdds(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl p-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white"
                  />
                  {oddsFormat === "decimal" && (
                    <p className="text-[10px] text-slate-400 mt-1">Decimal: &gt;1.0 · Ej: 1.91 = -110 americano · 2.50 = +150</p>
                  )}
                </div>

                {/* Ganancia potencial preview */}
                {amount && odds && potentialWin > 0 && (
                  <div className="flex items-center justify-between bg-emerald-50 border-2 border-emerald-200 rounded-xl px-4 py-3">
                    <div>
                      <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider">Si ganas</p>
                      <p className="text-2xl font-bold text-emerald-700">+${potentialWin.toFixed(2)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider">Total retorno</p>
                      <p className="text-lg font-bold text-emerald-800">${(potentialWin + (parseFloat(amount) || 0)).toFixed(2)}</p>
                    </div>
                  </div>
                )}

                {/* Casa de apuestas */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">🏦 Casa de apuestas</label>
                  <select value={bookmaker} onChange={e => setBookmaker(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white">
                    <option value="">— Opcional —</option>
                    {BOOKMAKERS.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>

                {/* Nota */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1"><StickyNote size={11} /> Nota <span className="font-normal text-slate-400">(opcional)</span></label>
                  <textarea placeholder='Ej. "Pitcher cansado, steam move..."' value={note} onChange={e => setNote(e.target.value)} rows={2}
                    className="w-full border border-slate-200 rounded-lg p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white resize-none" />
                </div>
              </div>
            )}

            {/* Nav */}
            <div className="flex gap-2 pt-1">
              {step > 1 && <button type="button" onClick={() => setStep(s => s - 1)}
                className="flex-1 py-2 border border-slate-300 text-slate-600 text-xs rounded-lg hover:bg-slate-100 font-semibold">← Atrás</button>}
              {step < 5
                ? <button key="btn-next" type="button" onClick={(e) => { e.preventDefault(); if (canNext()) setStep(s => s + 1); }} disabled={!canNext()}
                  className="flex-1 py-2 bg-violet-600 text-white text-xs font-bold rounded-lg hover:bg-violet-700 disabled:opacity-40 flex items-center justify-center gap-1">
                  Siguiente <ChevronRight size={12} />
                </button>
                : <button key="btn-submit" type="submit"
                  className="flex-1 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-xs font-bold rounded-lg hover:from-violet-700 hover:to-indigo-700 shadow flex items-center justify-center gap-1">
                  <Target size={12} /> {editingBetId ? "Guardar cambios" : "Registrar"}
                </button>}
            </div>
          </form>
        </div>

        {/* ── Bet list ──────────────────────────────────────────────────────────── */}
        <div className="lg:col-span-3 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg w-fit">
                {(["all", "pending", "won", "lost"] as const).map(f => (
                  <button key={f} onClick={() => setFilter(f)}
                    className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${filter === f ? "bg-white shadow text-slate-800" : "text-slate-500 hover:text-slate-700"}`}>
                    {f === "all" ? "Todas" : f === "pending" ? "Pendientes" : f === "won" ? "Ganadas" : "Perdidas"}
                    <span className={`ml-1 text-[10px] px-1 rounded-full ${filter === f ? "bg-violet-100 text-violet-700" : "bg-slate-200 text-slate-500"}`}>
                      {f === "all" ? allBets.length : allBets.filter(b => b.status === f).length}
                    </span>
                  </button>
                ))}
              </div>
              <button
                onClick={() => {
                  if (expandedBets.size === filtered.length && filtered.length > 0) {
                    setExpandedBets(new Set());
                  } else {
                    setExpandedBets(new Set(filtered.map(r => r.bet.id!)));
                  }
                }}
                className="p-1.5 rounded-lg bg-slate-100 text-slate-500 hover:text-slate-800 transition border border-transparent hover:border-slate-300"
                title={expandedBets.size === filtered.length && filtered.length > 0 ? "Contraer Todas" : "Expandir Todas"}
              >
                {expandedBets.size === filtered.length && filtered.length > 0 ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {uniqueUsers.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500 flex items-center gap-1"><Users size={12} /> Filtro:</span>
                <select value={userFilter} onChange={e => setUserFilter(e.target.value)}
                  className="bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-400">
                  <option value="all">Todos los usuarios ({resolvedBets.length})</option>
                  {uniqueUsers.map(u => (
                    <option key={u} value={u}>{u} ({resolvedBets.filter(r => r.bet.userName === u).length})</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {filtered.length === 0
            ? <div className="flex flex-col items-center justify-center py-14 text-slate-400 bg-slate-50 border border-dashed border-slate-200 rounded-xl">
              <BarChart2 size={28} className="mb-2 opacity-40" />
              <p className="text-sm font-semibold">Sin apuestas para este día</p>
              <p className="text-xs mt-1">Registra tu primera jugada con el wizard</p>
            </div>
            : <div className="space-y-3 max-h-[680px] overflow-y-auto pr-0.5">
              {filtered.map(({ bet, progress, game }) => {
                const catCfg = CATEGORY_CFG[bet.betCategory];
                const isRefreshing = refreshingIds.has(bet.gameId);

                let extraDetails = null;
                if (game && expandedBets.has(bet.id)) {
                  const isLiveOrFinal = game.game_result?.gameStatus?.includes("In Progress") || game.game_result?.gameStatus?.includes("Live") || game.game_result?.gameStatus?.includes("Final");
                  if (isLiveOrFinal) {
                    const ls = game.linescore;
                    const scoreText = ls ? `${game.teams.away} ${ls.awayTotals.runs} - ${ls.homeTotals.runs} ${game.teams.home}` : "";
                    const inningText = ls?.inningState ? `${ls.inningState === "Top" ? "Alta" : ls.inningState === "Bottom" ? "Baja" : ls.inningState === "Middle" ? "Mitad" : ls.inningState === "End" ? "Fin" : ls.inningState} ${ls.currentInning}` : "";

                    let statsText = "";
                    if (bet.betCategory === "pitcher") {
                      const side = bet.teamSide;
                      const p = game.liveBoxscore?.[side]?.pitchers?.find(p => p.name === bet.subject) || game.liveBoxscore?.[side]?.pitchers?.[0];
                      if (p) statsText = `IP: ${p.ip || "0.0"} | Picheos: ${p.pitches || 0} | ER: ${p.er || 0}`;
                    } else if (bet.betCategory === "batter") {
                      const side = bet.teamSide;
                      const b = game.liveBoxscore?.[side]?.batters?.find(b => b.name === bet.subject) || game.liveBoxscore?.[side]?.batters?.[0];
                      if (b) statsText = `AB: ${b.ab || 0} | H: ${b.h || 0} | R: ${b.r || 0} | RBI: ${b.rbi || 0} | K: ${b.k || 0}`;
                    }

                    extraDetails = (scoreText || statsText) ? (
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-500 mt-3 bg-slate-50 p-2 rounded-lg border border-slate-100 font-semibold">
                        {scoreText && <span><span className="text-slate-400">Score:</span> {scoreText}</span>}
                        {inningText && <span><span className="text-slate-400">Inning:</span> {inningText}</span>}
                        {statsText && <span><span className="text-slate-400">Stats:</span> {statsText}</span>}
                      </div>
                    ) : null;
                  }
                }

                return (
                  <div key={bet.id}
                    className={`bg-white border rounded-xl p-4 shadow-sm hover:shadow-md transition-all ${bet.status === "won" ? "border-emerald-200" : bet.status === "lost" ? "border-red-200" : "border-slate-200"}`}>

                    {!expandedBets.has(bet.id) ? (
                      <div className="cursor-pointer group" onClick={() => toggleCollapse(bet.id)}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 truncate min-w-0">
                            <div className="shrink-0"><StatusBadge status={bet.status} /></div>
                            <span className="font-bold text-sm text-slate-800 truncate">{bet.subject}</span>
                            <span className="text-xs text-slate-500 truncate hidden sm:inline">· {bet.betLabel}</span>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="font-bold text-sm text-slate-800">${bet.amount}</span>
                            {bet.potentialWin > 0 && <span className="text-xs font-bold text-emerald-600 hidden sm:inline">+${bet.potentialWin.toFixed(2)}</span>}
                            <button className="text-slate-400 hover:text-violet-600 transition-colors">
                              <ChevronDown size={14} />
                            </button>
                          </div>
                        </div>
                        <div className="pl-0 sm:pl-24">
                          <LiveProgressBar progress={progress} betStatus={bet.status} compact />
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-start justify-between gap-2 cursor-pointer group" onClick={() => toggleCollapse(bet.id)}>
                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${catCfg.bg} ${catCfg.color}`}>{catCfg.label}</span>
                              <StatusBadge status={bet.status} />
                              {bet.bookmaker && <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{bet.bookmaker}</span>}
                            </div>
                            <p className="font-bold text-sm text-slate-800 truncate">{bet.subject}</p>
                            <p className="text-xs text-slate-500">{bet.teamName} <span className="text-slate-300">vs</span> {bet.opponentName}</p>
                            <p className="text-xs font-semibold text-slate-700">{bet.betLabel}</p>
                            {bet.note && (
                              <p className="text-[10px] italic text-slate-400 flex items-start gap-1 mt-1">
                                <StickyNote size={10} className="shrink-0 mt-0.5" />{bet.note}
                              </p>
                            )}
                          </div>
                          <div className="text-right shrink-0 space-y-0.5">
                            <p className="text-xs text-slate-400 font-semibold">{bet.userName}</p>
                            <p className="text-sm font-bold text-slate-800">{bet.amount > 0 ? `$${bet.amount}` : "—"}</p>
                            {bet.potentialWin > 0 && (
                              <p className="text-[11px] font-bold text-emerald-600">+${bet.potentialWin.toFixed(2)}</p>
                            )}
                            <p className="text-xs font-semibold text-slate-500">{formatOddsDisplay(bet.odds)}</p>
                            <p className="text-[10px] text-slate-400">{bet.createdAt}</p>
                            <div className="flex items-center justify-end gap-2 mt-1">
                              <button onClick={(e) => { e.stopPropagation(); handleRefreshBet(bet.gameId); }} disabled={isRefreshing}
                                className="inline-flex items-center gap-1 text-[10px] text-slate-400 hover:text-violet-600 transition-colors disabled:opacity-40 font-semibold">
                                <RefreshCw size={10} className={isRefreshing ? "animate-spin" : ""} />
                              </button>
                              <button className="inline-flex items-center text-slate-400 hover:text-violet-600 transition-colors">
                                <ChevronUp size={14} />
                              </button>
                            </div>
                          </div>
                        </div>

                        <LiveProgressBar progress={progress} betStatus={bet.status} />

                        {extraDetails}

                        <div className="mt-3 flex justify-end gap-3 pt-3 border-t border-slate-100">
                          <button onClick={(e) => { e.stopPropagation(); editBet(bet); }}
                            className="text-[11px] text-slate-400 hover:text-violet-600 flex items-center gap-1 transition-colors font-semibold">
                            <Edit2 size={10} /> Editar
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); if (window.confirm("¿Estás seguro de que deseas eliminar esta apuesta? Esta acción no se puede deshacer.")) deleteBet(bet.id); }}
                            className="text-[11px] text-slate-400 hover:text-red-500 flex items-center gap-1 transition-colors font-semibold">
                            <Trash2 size={10} /> Eliminar
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>}
        </div>
      </div>
    </div>
  );
};
