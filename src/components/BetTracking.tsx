/**
 * BetTracking v2 — Registro de apuestas MLB
 * Persistencia: localStorage (Firebase-ready, solo cambiar la capa de storage)
 *
 * Fase 6, punto 1 del plan de mejora (`audit_2026-08-31/PLAN_DE_MEJORA_MLBDATAENGINE.md`):
 * este archivo medía 108 KB / 1915 líneas mezclando tipos, storage en
 * localStorage, utilidades de odds/formato/export, el resolutor de progreso
 * en vivo, y cuatro subcomponentes (StatusBadge, LiveProgressBar,
 * AnalyticsDashboard, UserModal) junto con el componente principal. Se
 * dividió así, sin cambiar ningún comportamiento:
 *   - `betTracking/betTrackingTypes.ts`   → Bet, LiveProgress, ResolvedBet, etc.
 *   - `betTracking/betTrackingHelpers.ts` → storage, odds/formato/export, live progress
 *   - `betTracking/StatusBadge.tsx`
 *   - `betTracking/LiveProgressBar.tsx`
 *   - `betTracking/AnalyticsDashboard.tsx`
 *   - `betTracking/UserModal.tsx`
 *   - `betTracking/BetList.tsx`          → lista filtrable de apuestas (antes
 *     JSX inline en este archivo; su estado de filtro/expansión es local a la lista)
 * Este archivo ahora mantiene el wizard de "Nueva Apuesta" (incluyendo Smart
 * Paste) y el estado que es realmente compartido entre piezas (usuario
 * activo, fecha, la lista de bets y sus totales).
 */

import React, { useState, useMemo, useEffect, useCallback } from "react";
import {
  TrendingUp, XCircle, ChevronRight, Trophy,
  Target, DollarSign, PlusCircle, Users, User,
  Zap, ListChecks, RefreshCw, AlertTriangle, Download, ChevronLeft,
  BookOpen, Clock, ArrowRight, X, BarChart2, ChevronDown, StickyNote,
} from "lucide-react";
import { MLBGame } from "../types";
import { syncBets, saveBetsDb, registerUserDb, syncUsers, deleteUserDb } from "../services/betService";
import { getTeamLogo, getTeamColor, getTeamAbbr } from "../utils/teamLogos";
import { Bet, BetTypeKey, BetCategory, BetStatus, OddsFormat } from "./betTracking/betTrackingTypes";
import {
  loadBets, saveBets, getRegisteredUsers,
  loadUsername, saveUsername, datesWithBets, todayStr,
  loadOddsFormat, saveOddsFormat,
  oddsForFormat, calcPotentialWin, exportCSV, exportJSON,
  resolveLiveProgress, hasResultDataForBet, CATEGORY_CFG, BOOKMAKERS,
} from "./betTracking/betTrackingHelpers";
import { AnalyticsDashboard } from "./betTracking/AnalyticsDashboard";
import { UserModal } from "./betTracking/UserModal";
import { BetList } from "./betTracking/BetList";



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
  const [isWizardOpen, setIsWizardOpen] = useState<boolean>(() => bets.length === 0);
  const [userFilter, setUserFilter] = useState<string>("all");
  const [refreshingIds, setRefreshingIds] = useState<Set<string>>(new Set());
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
  const autoHydratedResultGamesRef = React.useRef<Set<string>>(new Set());
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = React.useRef<HTMLDivElement>(null);

  // Cierra el menú de "Exportar" al hacer click afuera
  useEffect(() => {
    if (!showExportMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showExportMenu]);

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
  const [editUserName, setEditUserName] = useState<string>("");
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
  const [editStatus, setEditStatus] = useState<BetStatus>("pending");
  const [showSmartPaste, setShowSmartPaste] = useState(false);
  const [smartPasteText, setSmartPasteText] = useState("");
  const [smartPasteError, setSmartPasteError] = useState("");

  const potentialWin = useMemo(() => calcPotentialWin(parseFloat(amount) || 0, odds, oddsFormat), [amount, odds, oddsFormat]);

  const selectedGame = useMemo(() => (games.find(g => String(g.id) === selectedGameId) || dateGames.find(g => String(g.id) === selectedGameId)) ?? null, [games, dateGames, selectedGameId]);
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
    setEditStatus("pending");
    setShowSmartPaste(false); setSmartPasteText(""); setSmartPasteError("");
    setEditUserName("");
  };

  // ── Smart Paste Parser ──────────────────────────────────────────────────
  // Motor de extracción tolerante al formato. No asume orden ni estructura fija.
  // Funciona con slips de DraftKings, FanDuel, BetMGM, texto copiado de Telegram, etc.
  const parseSmartPaste = () => {
    setSmartPasteError("");
    const raw = smartPasteText;
    if (!raw.trim()) { setSmartPasteError("Pega el texto de la apuesta."); return; }

    // ── Normalizar texto ───────────────────────────────────────────────────
    const text = raw.replace(/[\u200B-\u200D\uFEFF]/g, "").trim(); // quitar chars invisibles
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const lower = text.toLowerCase();

    // ── Helpers ────────────────────────────────────────────────────────────
    const fuzzyMatch = (a: string, b: string, minLen = 4) => {
      const al = a.toLowerCase().replace(/[^a-z0-9]/g, "");
      const bl = b.toLowerCase().replace(/[^a-z0-9]/g, "");
      const len = Math.min(minLen, Math.min(al.length, bl.length));
      return al.slice(0, len) === bl.slice(0, len) || al.includes(bl.slice(0, len)) || bl.includes(al.slice(0, len));
    };

    const extractFirst = (patterns: RegExp[]): string | null => {
      for (const p of patterns) {
        const m = text.match(p);
        if (m) return m[1]?.trim() || null;
      }
      return null;
    };

    const extractAll = (patterns: RegExp[]): RegExpMatchArray | null => {
      for (const p of patterns) {
        const m = text.match(p);
        if (m) return m;
      }
      return null;
    };

    // ── 1. Extraer equipos ─────────────────────────────────────────────────
    // Soporta: "TeamA vs TeamB", "TeamA @ TeamB", "TeamA - TeamB", con o sin prefijo
    const vsMatch = extractAll([
      /([A-Z][A-Za-zÀ-ÿ\s'.]+?)\s+(?:vs\.?|@|at)\s+([A-Z][A-Za-zÀ-ÿ\s'.]+?)(?:\s*[-—|,\n]|$)/im,
      /([A-Z]{2,})\s+(?:vs\.?|@)\s+([A-Z]{2,})/i,
    ]);

    let awayTeamRaw = vsMatch ? vsMatch[1].trim() : "";
    let homeTeamRaw = vsMatch ? vsMatch[2].trim() : "";

    // Limpiar artefactos comunes al final del nombre de equipo
    const cleanTeamName = (t: string) => t.replace(/\s*([\-—|:].*)?$/, "").trim();
    awayTeamRaw = cleanTeamName(awayTeamRaw);
    homeTeamRaw = cleanTeamName(homeTeamRaw);

    // ── Resolver abreviaciones MLB (STL → St. Louis Cardinals, etc.) ───────
    const MLB_ABBR: Record<string, string> = {
      ARI: "Arizona Diamondbacks", ATL: "Atlanta Braves", BAL: "Baltimore Orioles",
      BOS: "Boston Red Sox",       CHC: "Chicago Cubs",   CWS: "Chicago White Sox",
      CIN: "Cincinnati Reds",      CLE: "Cleveland Guardians", COL: "Colorado Rockies",
      DET: "Detroit Tigers",       HOU: "Houston Astros", KC:  "Kansas City Royals",
      KCR: "Kansas City Royals",   LAA: "Los Angeles Angels", LAD: "Los Angeles Dodgers",
      MIA: "Miami Marlins",        MIL: "Milwaukee Brewers",  MIN: "Minnesota Twins",
      NYM: "New York Mets",        NYY: "New York Yankees",   OAK: "Oakland Athletics",
      ATH: "Oakland Athletics",    PHI: "Philadelphia Phillies", PIT: "Pittsburgh Pirates",
      SD:  "San Diego Padres",     SDP: "San Diego Padres",   SF:  "San Francisco Giants",
      SFG: "San Francisco Giants", SEA: "Seattle Mariners",   STL: "St. Louis Cardinals",
      TB:  "Tampa Bay Rays",       TBR: "Tampa Bay Rays",     TEX: "Texas Rangers",
      TOR: "Toronto Blue Jays",    WSH: "Washington Nationals", WAS: "Washington Nationals",
    };
    const resolveTeamName = (t: string): string => {
      const upper = t.toUpperCase().trim();
      return MLB_ABBR[upper] || t;
    };
    awayTeamRaw = resolveTeamName(awayTeamRaw);
    homeTeamRaw = resolveTeamName(homeTeamRaw);

    // ── 2. Buscar juego en la lista de juegos ──────────────────────────────
    const allGames = [...games, ...dateGames];
    let matchedGame: typeof games[0] | null = null;
    let matchedSide: "home" | "away" = "away";

    // Intentar match por VS primero
    if (awayTeamRaw && homeTeamRaw) {
      for (const g of allGames) {
        if (fuzzyMatch(g.metadata.homeTeam, homeTeamRaw) && fuzzyMatch(g.metadata.awayTeam, awayTeamRaw)) {
          matchedGame = g; break;
        }
        // Invertido (algunos slips ponen local primero)
        if (fuzzyMatch(g.metadata.homeTeam, awayTeamRaw) && fuzzyMatch(g.metadata.awayTeam, homeTeamRaw)) {
          matchedGame = g; 
          [awayTeamRaw, homeTeamRaw] = [homeTeamRaw, awayTeamRaw]; // corregir inversión
          break;
        }
      }
    }

    // Si no matcheó por VS, buscar cualquier equipo mencionado en el texto
    if (!matchedGame) {
      for (const g of allGames) {
        const homeWords = g.metadata.homeTeam.split(" ").filter(w => w.length > 3);
        const awayWords = g.metadata.awayTeam.split(" ").filter(w => w.length > 3);
        const homeHit = homeWords.some(w => lower.includes(w.toLowerCase()));
        const awayHit = awayWords.some(w => lower.includes(w.toLowerCase()));
        if (homeHit || awayHit) { matchedGame = g; break; }
      }
    }

    if (!matchedGame) {
      setSmartPasteError("No se encontró el juego. Verifica que los datos estén cargados para esta fecha.");
      return;
    }

    // ── 3. Extraer nombre del jugador / subject ────────────────────────────
    // Estrategia: buscar explícito → buscar en líneas por posición → inferir
    const subjectRaw = (
      extractFirst([
        /(?:🎯|👤|Player:|Jugador:|Target:|1️⃣)\s*([A-Za-zÀ-ÿ\s'.,-]+?)(?:\s*[-—|,\n]|$)/i,
        /^([A-Z][a-zÀ-ÿ]+(?:\s+[A-Z][a-zÀ-ÿ]+){1,3})\s*[-—|]\s*/m,  // "Name - something"
      ]) ||
      // buscar línea que contiene nombre de pitcher
      lines.find(l => {
        const lw = l.toLowerCase();
        const hp = (matchedGame!.pitchers?.home?.name || "").toLowerCase();
        const ap = (matchedGame!.pitchers?.away?.name || "").toLowerCase();
        return (hp.length > 3 && lw.includes(hp.slice(0, 5))) || (ap.length > 3 && lw.includes(ap.slice(0, 5)));
      })?.split(/[-—|]/)[0].trim() || ""
    ).replace(/^(pick|lean|play|apuesta|target)[:\s]*/i, "").trim();

    // ── 4. Determinar el lado (home/away) del jugador ─────────────────────
    if (subjectRaw) {
      const homePitcher = matchedGame.pitchers?.home?.name || "";
      const awayPitcher = matchedGame.pitchers?.away?.name || "";
      const homeLineup = (matchedGame.lineups?.home || []).map((p: any) => (p.name || "").toLowerCase());
      const awayLineup = (matchedGame.lineups?.away || []).map((p: any) => (p.name || "").toLowerCase());

      if (fuzzyMatch(homePitcher, subjectRaw, 5) || homeLineup.some(n => fuzzyMatch(n, subjectRaw, 5))) {
        matchedSide = "home";
      } else if (fuzzyMatch(awayPitcher, subjectRaw, 5) || awayLineup.some(n => fuzzyMatch(n, subjectRaw, 5))) {
        matchedSide = "away";
      } else {
        // Inferir por equipos mencionados en texto
        const homeWords = matchedGame.metadata.homeTeam.split(" ").filter(w => w.length > 3);
        const awayWords = matchedGame.metadata.awayTeam.split(" ").filter(w => w.length > 3);
        const homeScore = homeWords.filter(w => lower.includes(w.toLowerCase())).length;
        const awayScore = awayWords.filter(w => lower.includes(w.toLowerCase())).length;
        matchedSide = homeScore >= awayScore ? "home" : "away";
      }
    }

    // ── 5. Extraer la línea y Over/Under ──────────────────────────────────
    // Soporta: "Over 4.5", "OVER4.5", "O 4.5", "U 2.5", "Más de 4.5", "Menos de 7.5",
    // "Más de (Over) 7.5", "4.5+ Ks", etc.

    // Normalizar primero: remover paréntesis redundantes como "(Over)" → "Over"
    const textNorm = text
      .replace(/más\s+de\s*\(over\)/gi, "over")
      .replace(/menos\s+de\s*\(under\)/gi, "under")
      .replace(/más\s+de/gi, "over")
      .replace(/menos\s+de/gi, "under")
      .replace(/\(over\)/gi, "over")
      .replace(/\(under\)/gi, "under");

    const extractNorm = (patterns: RegExp[]): RegExpMatchArray | null => {
      for (const p of patterns) {
        const m = textNorm.match(p);
        if (m) return m;
      }
      return null;
    };

    const ouMatch = extractNorm([
      /\b(over|under)\s*([0-9]+(?:\.[0-9]+)?)\s*(?:k|ks|tb|bases|strikeout|ponche)?/i,
      /\b(o|u)\s+([0-9]+(?:\.[0-9]+)?)\s*(?:k|ks|tb|bases|strikeout|ponche)?/i,
      /([0-9]+(?:\.[0-9]+)?)\s*\+\s*(?:k|ks|strikeout)/i,  // "4.5+ Ks"
    ]);
    const isOverParsed = ouMatch
      ? /^(over|o)$/i.test(ouMatch[1])
      : !lower.includes("under") && !lower.includes("menos de") && !lower.includes(" u ");
    const lineParsed = ouMatch ? ouMatch[2] : (extractFirst([/([0-9]+\.[0-9]+)/]) || "");

    // ── 6. Detectar tipo de apuesta ───────────────────────────────────────
    let betTypeParsed: BetTypeKey = "pitcher_k";
    let betLabelParsed = "";
    let categoryParsed: BetCategory = "pitcher";

    if (/\bk\b|strikeout|ponche|ks\b/i.test(text)) {
      betTypeParsed = "pitcher_k"; categoryParsed = "pitcher";
      betLabelParsed = `${isOverParsed ? "Over" : "Under"} ${lineParsed} Ks`;
    } else if (/total.?base|bases\s+totales|\btb\b/i.test(text)) {
      betTypeParsed = "batter_tb"; categoryParsed = "batter";
      betLabelParsed = `${isOverParsed ? "Over" : "Under"} ${lineParsed} TB`;
    } else if (/moneyline|money.?line|\bml\b/i.test(text)) {
      betTypeParsed = "team_ml"; categoryParsed = "team";
      betLabelParsed = "Moneyline";
    } else if (/first\s+5|f5\s+innings|\bf5\b/i.test(text)) {
      betTypeParsed = "team_f5"; categoryParsed = "team";
      betLabelParsed = "First 5 Innings";
    } else {
      // Inferir por contexto: si hay pitcher y línea numérica → Ks por defecto
      const hasPitcherContext = (matchedGame.pitchers?.home?.name && fuzzyMatch(matchedGame.pitchers.home.name, subjectRaw, 4))
        || (matchedGame.pitchers?.away?.name && fuzzyMatch(matchedGame.pitchers.away.name, subjectRaw, 4));
      if (hasPitcherContext && lineParsed) {
        betTypeParsed = "pitcher_k"; categoryParsed = "pitcher";
        betLabelParsed = `${isOverParsed ? "Over" : "Under"} ${lineParsed} Ks`;
      }
    }

    // ── 7. Extraer cuotas (odds) ───────────────────────────────────────────
    // Soporta: "@-168", "@ +105", "Cuota: -168", "Odds: 1.85", "(−115)"
    let oddsParsed = "";
    const oddsMatch = extractAll([
      /(?:@|odds:|cuota:)\s*([+-]?\d{3,4}(?:\.\d+)?)/i,   // americanas
      /(?:@|odds:|cuota:)\s*([12]\.?\d{2,3})/i,            // decimales
      /\(\s*([+\-−]\d{3,4})\s*\)/,                         // (−115)
      /\b([+\-]\d{3,4})\b/,                                 // +105 o -168 suelto
    ]);
    if (oddsMatch) {
      let raw = oddsMatch[1].replace("−", "-"); // unicode minus → regular
      oddsParsed = oddsForFormat(raw, oddsFormat);
    }

    // ── 8. Extraer monto ──────────────────────────────────────────────────
    // Soporta: "$55", "Monto: 55", "Stake: 100", "50u", "Unidades: 2"
    const amountMatch = extractAll([
      /(?:monto|amount|stake|jugado|wager|riesgo)[:\s]*\$?\s*([0-9]+(?:\.[0-9]+)?)(?!\s*%)/i,
      /\$\s*([0-9]+(?:\.[0-9]+)?)/,
      /([0-9]+(?:\.[0-9]+)?)\s*(?:u\b|unidades?)/i,
    ]);
    const amountParsed = amountMatch ? amountMatch[1] : "";

    // ── 9. Aplicar al formulario ──────────────────────────────────────────
    setSelectedGameId(String(matchedGame.id));
    setSelectedTeamSide(matchedSide);
    setCategory(categoryParsed);
    setSubject(subjectRaw || (matchedSide === "home" ? matchedGame.metadata.homeTeam : matchedGame.metadata.awayTeam));
    setBetTypeKey(betTypeParsed);
    setBetLabel(betLabelParsed || `${isOverParsed ? "Over" : "Under"} ${lineParsed}`);
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

    const needsLine = betTypeKey === "pitcher_k" || betTypeKey === "batter_tb";
    let finalBetLabel = betLabel;
    if (needsLine && line && !finalBetLabel.includes(String(line))) {
      finalBetLabel = finalBetLabel.replace(/K's|Ks|TB|Bases/i, `${line} $&`);
    }

    if (editingBetId) {
      updateBets(prev => prev.map(b => b.id === editingBetId ? {
        ...b,
        gameId: selectedGameId,
        teamName,
        opponentName,
        teamSide: selectedTeamSide as "home" | "away",
        subject,
        betLabel: finalBetLabel,
        betCategory: category as BetCategory,
        line: parseFloat(line) || 0,
        isOver,
        betTypeKey: betTypeKey as BetTypeKey,
        bookmaker,
        amount: parseFloat(amount) || 0,
        odds: odds.trim() || "—",
        potentialWin,
        note: note.trim(),
        status: editStatus,
        userName: editUserName || b.userName,
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
        betLabel: finalBetLabel,
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
    setEditStatus(bet.status);
    setEditUserName(bet.userName || "");
    setStep(5);
    setIsWizardOpen(true);
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


  const filteredByUser = userFilter === "all" ? resolvedBets : resolvedBets.filter(r => r.bet.userName === userFilter);

  const allBets = filteredByUser.map(r => r.bet);
  const won = allBets.filter(b => b.status === "won").reduce((s, b) => s + b.amount, 0);
  const wonReturn = allBets.filter(b => b.status === "won").reduce((s, b) => s + b.potentialWin, 0);
  const lost = allBets.filter(b => b.status === "lost").reduce((s, b) => s + b.amount, 0);
  const pending = allBets.filter(b => b.status === "pending").reduce((s, b) => s + b.amount, 0);
  const net = wonReturn - lost;


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
            title="Actualizar Apuestas Activas"
            aria-label="Actualizar Apuestas Activas"
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-violet-100 hover:bg-violet-200 text-violet-700 rounded-lg text-xs font-bold transition-colors disabled:opacity-40 shadow-sm border border-violet-200">
            <RefreshCw size={12} className={isRefreshingAll ? "animate-spin" : ""} />
            <span className="hidden sm:inline">Actualizar Apuestas Activas</span>
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
          <div className="relative" ref={exportMenuRef}>
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
      {(() => {
        const summaryItems = [
          { label: "En juego", value: `$${pending.toFixed(0)}`, Icon: Clock, textColor: "text-amber-600", color: "text-amber-600 bg-amber-50 border-amber-200" },
          { label: "Ganadas", value: `+$${wonReturn.toFixed(0)}`, Icon: Trophy, textColor: "text-emerald-600", color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
          { label: "Perdidas", value: `-$${lost.toFixed(0)}`, Icon: XCircle, textColor: "text-red-600", color: "text-red-600 bg-red-50 border-red-200" },
          { label: "Neto", value: `${net >= 0 ? "+" : ""}$${net.toFixed(0)}`, Icon: TrendingUp, textColor: net >= 0 ? "text-emerald-600" : "text-red-600", color: net >= 0 ? "text-emerald-600 bg-emerald-50 border-emerald-200" : "text-red-600 bg-red-50 border-red-200" },
        ];
        return (
          <>
            {/* Mobile: fila compacta de números, sin tarjetas individuales */}
            <div className="grid grid-cols-4 gap-2 sm:hidden">
              {summaryItems.map(({ label, value, textColor }) => (
                <div key={label} className="text-center">
                  <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400 truncate">{label}</p>
                  <p className={`text-sm font-bold leading-tight ${textColor}`}>{value}</p>
                </div>
              ))}
            </div>
            {/* Desktop: tarjetas con ícono y borde */}
            <div className="hidden sm:grid sm:grid-cols-4 gap-3">
              {summaryItems.map(({ label, value, Icon, color }) => (
                <div key={label} className={`border rounded-xl p-3 flex items-center gap-3 ${color}`}>
                  <div className="p-2 rounded-lg bg-white shadow-sm"><Icon size={14} /></div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider opacity-70">{label}</p>
                    <p className="text-base font-bold leading-tight">{value}</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        );
      })()}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* ── Wizard ──────────────────────────────────────────────────────────── */}
        <div className="order-2 lg:order-1 lg:col-span-2 bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setIsWizardOpen(v => !v)}
              title={isWizardOpen ? "Colapsar formulario" : "Mostrar formulario"}
              aria-label={isWizardOpen ? "Colapsar formulario" : "Mostrar formulario"}
              aria-expanded={isWizardOpen}
              className="flex items-center gap-2 sm:cursor-default"
            >
              <PlusCircle size={14} className="text-violet-600" />
              <h3 className="font-bold text-sm text-slate-800">{editingBetId ? "Editar Apuesta" : "Nueva Apuesta"}</h3>
              <ChevronDown size={14} className={`text-slate-400 transition-transform sm:hidden ${isWizardOpen ? "rotate-180" : ""}`} />
            </button>
            <div className={`items-center gap-2 ${isWizardOpen ? "flex" : "hidden"} sm:flex`}>
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

          <div className={`${isWizardOpen ? "" : "hidden"} sm:block space-y-4`}>

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
                        { key: category === "pitcher" ? "pitcher_k" : "batter_tb", label: category === "pitcher" ? "Over K's" : "Over Bases", baseLabel: category === "pitcher" ? "Over {LINE} Ks" : "Over {LINE} TB", over: true },
                        { key: category === "pitcher" ? "pitcher_k" : "batter_tb", label: category === "pitcher" ? "Under K's" : "Under Bases", baseLabel: category === "pitcher" ? "Under {LINE} Ks" : "Under {LINE} TB", over: false },
                      ].map(opt => {
                        const dir = opt.over ? "Over" : "Under";
                        const suffix = category === "pitcher" ? "Ks" : "TB";
                        const fullLabel = line ? `${dir} ${line} ${suffix}` : opt.label;
                        const isSelected = isOver === opt.over && betTypeKey === opt.key;
                        return (
                          <button key={opt.label} type="button"
                            onClick={() => { setBetTypeKey(opt.key as BetTypeKey); setIsOver(opt.over); setBetLabel(fullLabel); }}
                            className={`py-2.5 px-2 rounded-lg border text-xs font-bold transition-all ${isSelected ? "bg-violet-600 text-white border-violet-600 shadow" : "bg-white border-slate-200 text-slate-700 hover:border-violet-300"}`}>
                            {opt.label}
                          </button>
                        );
                      })}
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
                  <strong>{subject}</strong> · {(() => {
                    const needsLine = betTypeKey === "pitcher_k" || betTypeKey === "batter_tb";
                    if (needsLine && line && !betLabel.includes(String(line))) {
                      return betLabel.replace(/K's|Ks|TB|Bases/i, `${line} $&`);
                    }
                    return betLabel;
                  })()}
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

                {editingBetId && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Estado de la apuesta</label>
                      <select value={editStatus} onChange={e => setEditStatus(e.target.value as BetStatus)}
                        className="w-full border border-slate-200 rounded-lg p-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white">
                        <option value="pending">Pendiente</option>
                        <option value="won">Ganada</option>
                        <option value="lost">Perdida</option>
                        <option value="void">Anulada (Push/Void)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Usuario que registró</label>
                      <select
                        value={editUserName}
                        onChange={e => setEditUserName(e.target.value)}
                        className="w-full border border-slate-200 rounded-lg p-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white"
                      >
                        {getRegisteredUsers().map(u => (
                          <option key={u} value={u}>{u}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
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
        </div>

        {/* ── Bet list ──────────────────────────────────────────────────────────── */}
        <div className="order-1 lg:order-2 lg:col-span-3 space-y-3">
          <BetList
            resolvedBets={resolvedBets}
            userFilter={userFilter}
            onUserFilterChange={setUserFilter}
            refreshingIds={refreshingIds}
            onRefreshBet={handleRefreshBet}
            onEditBet={editBet}
            onDeleteBet={deleteBet}
          />
        </div>
      </div>
    </div>
  );
};
