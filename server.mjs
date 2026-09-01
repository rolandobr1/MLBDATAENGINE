// src/etl/extractors/pybaseballApi.ts
import { exec } from "child_process";
import path from "path";
import fs from "fs";
var PYTHON_SCRIPT = path.join(process.cwd(), "src", "etl", "extractors", "pybaseball_scraper.py");
var VENV_PYTHON = path.join(process.cwd(), "venv", "Scripts", "python.exe");
var PYTHON_BIN = fs.existsSync(VENV_PYTHON) ? VENV_PYTHON : "python";
var CACHE_DIR = path.join(process.cwd(), "cache");
var cacheRequestsInFlight = /* @__PURE__ */ new Map();
var NEGATIVE_CACHE_TTL_MS = 30 * 60 * 1e3;
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}
function getCacheFilename(action, extraKey = "") {
  const dateStr = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const safeExtraKey = extraKey.replace(/[^a-z0-9_-]/gi, "_");
  return path.join(CACHE_DIR, `pybaseball_${action}_${dateStr}${safeExtraKey ? "_" + safeExtraKey : ""}.json`);
}
async function withCache(action, extraKey, fn) {
  const cacheFile = getCacheFilename(action, extraKey);
  if (fs.existsSync(cacheFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
      console.log(`[PyBaseball Cache] Using cached data for ${action} ${extraKey}`);
      return data;
    } catch (e) {
      console.warn(`[PyBaseball Cache] Failed to read cache for ${action}, fetching fresh data...`);
    }
  }
  const requestKey = `${action}|${extraKey}`;
  const existingRequest = cacheRequestsInFlight.get(requestKey);
  if (existingRequest) return existingRequest;
  const request = (async () => {
    const result = await fn();
    try {
      fs.writeFileSync(cacheFile, JSON.stringify(result));
      console.log(`[PyBaseball Cache] Saved fresh data for ${action} ${extraKey}`);
    } catch (e) {
      console.error(`[PyBaseball Cache] Failed to write cache for ${action}`);
    }
    return result;
  })().finally(() => cacheRequestsInFlight.delete(requestKey));
  cacheRequestsInFlight.set(requestKey, request);
  return request;
}
function getPerPitcherCacheFilename(action, dateStr, pitcherId2) {
  return path.join(CACHE_DIR, `pybaseball_${action}_${dateStr}_${pitcherId2}.json`);
}
async function withPerPitcherCache(action, dateStr, pitcherIds, fetchMissing) {
  const result = {};
  const missingIds = [];
  for (const id of pitcherIds) {
    const cacheFile = getPerPitcherCacheFilename(action, dateStr, id);
    if (fs.existsSync(cacheFile)) {
      try {
        const cachedValue = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
        if (cachedValue === null) {
          const ageMs = Date.now() - fs.statSync(cacheFile).mtimeMs;
          if (ageMs >= NEGATIVE_CACHE_TTL_MS) missingIds.push(id);
        } else {
          result[id] = cachedValue;
        }
      } catch (e) {
        missingIds.push(id);
      }
    } else {
      missingIds.push(id);
    }
  }
  if (missingIds.length > 0) {
    console.log(`[PyBaseball Cache] Fetching fresh data for ${action} - missing ${missingIds.length} pitchers`);
    const fetchedData = await fetchMissing(missingIds);
    for (const id of missingIds) {
      if (fetchedData[id] !== void 0) {
        result[id] = fetchedData[id];
        const cacheFile = getPerPitcherCacheFilename(action, dateStr, id);
        try {
          fs.writeFileSync(cacheFile, JSON.stringify(fetchedData[id]));
        } catch (e) {
          console.error(`[PyBaseball Cache] Failed to write per-pitcher cache for ${action} ID: ${id}`);
        }
      } else {
        try {
          fs.writeFileSync(getPerPitcherCacheFilename(action, dateStr, id), "null");
        } catch (e) {
          console.error(`[PyBaseball Cache] Failed to write negative cache for ${action} ID: ${id}`);
        }
      }
    }
  }
  return result;
}
var getRecentStatcast = (startDate, endDate) => {
  return withCache("recent_statcast_v2", `${startDate}_${endDate}`, () => {
    return new Promise((resolve, reject) => {
      const command = `"${PYTHON_BIN}" "${PYTHON_SCRIPT}" --action recent_statcast --start "${startDate}" --end "${endDate}"`;
      exec(command, { maxBuffer: 1024 * 1024 * 10, timeout: 6e4 }, (error, stdout, stderr) => {
        if (error) {
          console.error(`[PyBaseball Recent] ${error.message}`);
          return resolve({ success: false, error: error.message, data: { pitchers_recent: [] } });
        }
        try {
          const jsonStart = stdout.indexOf("{");
          const jsonStr = jsonStart >= 0 ? stdout.substring(jsonStart) : stdout;
          const jsonResponse = JSON.parse(jsonStr);
          resolve(jsonResponse);
        } catch (parseError) {
          console.error("Failed to parse Python output:", stdout);
          resolve({ success: false, error: String(parseError), data: { pitchers_recent: [] } });
        }
      });
    });
  });
};
var getPitcherArsenals = (pitcherIds, year) => {
  return withPerPitcherCache("pitcher_arsenal", year, pitcherIds, (missingIds) => {
    return new Promise((resolve) => {
      const idsCsv = missingIds.join(",");
      const command = `"${PYTHON_BIN}" "${PYTHON_SCRIPT}" --action pitcher_arsenal --year "${year}" --pitcher_ids "${idsCsv}"`;
      exec(command, { maxBuffer: 1024 * 1024 * 10, timeout: 12e4 }, (error, stdout) => {
        if (error) {
          console.error(`[PyBaseball Arsenal] exec error: ${error.message}`);
          return resolve({});
        }
        try {
          const jsonStart = stdout.indexOf("{");
          const jsonStr = jsonStart >= 0 ? stdout.substring(jsonStart) : stdout;
          const parsed = JSON.parse(jsonStr);
          if (parsed.success && parsed.data) {
            console.log(`[PyBaseball Arsenal] OK \u2014 ${Object.keys(parsed.data).length} pitcher(s) con datos de arsenal`);
            resolve(parsed.data);
          } else {
            console.warn(`[PyBaseball Arsenal] Sin datos: ${parsed.error || "desconocido"}`);
            resolve({});
          }
        } catch (e) {
          console.error("[PyBaseball Arsenal] Error parseando JSON:", stdout.slice(0, 200));
          resolve({});
        }
      });
    });
  });
};

// server.ts
import dotenv from "dotenv";
import fs7 from "fs";
import path6 from "path";
import express from "express";
import { createServer as createViteServer } from "vite";

// src/config/firebase.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, initializeFirestore } from "firebase/firestore";
var getProcessEnv = (key) => {
  if (typeof process !== "undefined" && process.env) {
    const value = process.env[key];
    if (value) {
      return value.trim().replace(/[\r\n]/g, "");
    }
  }
  return void 0;
};
var metaEnv = typeof import.meta !== "undefined" ? import.meta.env : void 0;
var firebaseConfig = {
  apiKey: getProcessEnv("FIREBASE_API_KEY") || metaEnv?.VITE_FIREBASE_API_KEY || "AIzaSyABTa7InfS8xP9PAVACYxzk9kktbGVcFvg",
  authDomain: getProcessEnv("FIREBASE_AUTH_DOMAIN") || metaEnv?.VITE_FIREBASE_AUTH_DOMAIN || "studio-207019270-ff455.firebaseapp.com",
  projectId: getProcessEnv("FIREBASE_PROJECT_ID") || metaEnv?.VITE_FIREBASE_PROJECT_ID || "studio-207019270-ff455",
  storageBucket: getProcessEnv("FIREBASE_STORAGE_BUCKET") || metaEnv?.VITE_FIREBASE_STORAGE_BUCKET || "studio-207019270-ff455.firebasestorage.app",
  messagingSenderId: getProcessEnv("FIREBASE_MESSAGING_SENDER_ID") || metaEnv?.VITE_FIREBASE_MESSAGING_SENDER_ID || "1013252985995",
  appId: getProcessEnv("FIREBASE_APP_ID") || metaEnv?.VITE_FIREBASE_APP_ID || "1:1013252985995:web:9eef813ce94382d7c4b08e"
};
var hasFirebaseConfig = !!firebaseConfig.projectId;
var app = hasFirebaseConfig ? getApps().length === 0 ? initializeApp(firebaseConfig) : getApp() : null;
var db = app ? (() => {
  try {
    return initializeFirestore(app, {
      ignoreUndefinedProperties: true,
      experimentalForceLongPolling: true
    });
  } catch (e) {
    return getFirestore(app);
  }
})() : null;

// src/services/firestoreService.ts
import { doc, collection, setDoc, getDoc, getDocs, getCountFromServer, query, where, orderBy, limit, arrayUnion } from "firebase/firestore";
import { getAuth, signInAnonymously } from "firebase/auth";
var authInitialized = false;
var FIRESTORE_READ_TIMEOUT_MS = Number(process.env.FIRESTORE_READ_TIMEOUT_MS || 3e3);
async function ensureAnonymousAuth() {
  if (!app) return false;
  if (authInitialized) return true;
  try {
    const auth = getAuth(app);
    await signInAnonymously(auth);
    authInitialized = true;
    return true;
  } catch (authErr) {
    if (authErr.code === "auth/configuration-not-found") {
      console.error("\nERROR CRITICO DE FIREBASE: La Autenticacion Anonima no esta habilitada.");
      console.error("Ve a Firebase Console -> Authentication -> Sign-in method -> habilita 'Anonimo'.\n");
    } else {
      console.error("Error autenticando Firebase:", authErr);
    }
    return false;
  }
}
async function withFirestoreReadTimeout(promise, fallback, label, timeoutMs = FIRESTORE_READ_TIMEOUT_MS) {
  let timeout;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => {
        timeout = setTimeout(() => {
          console.warn(`[Firestore] Timeout leyendo ${label} despues de ${timeoutMs}ms.`);
          resolve(fallback);
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
var saveGameData = async (gameId2, gameData) => {
  try {
    if (!db || !app) {
      console.warn("Firestore db is not initialized. Skipping Firestore save.");
      return;
    }
    if (!authInitialized) {
      try {
        const auth = getAuth(app);
        await signInAnonymously(auth);
        authInitialized = true;
      } catch (authErr) {
        if (authErr.code === "auth/configuration-not-found") {
          console.error("\n\u274C ERROR CR\xCDTICO DE FIREBASE: La Autenticaci\xF3n An\xF3nima no est\xE1 habilitada.");
          console.error("\u{1F449} Ve a tu Consola de Firebase -> Authentication -> Sign-in method -> Habilita 'An\xF3nimo'.");
          console.error("El backend no puede guardar los juegos en la nube sin esto debido a tus reglas de seguridad.\n");
        } else {
          console.error("Error autenticando el backend:", authErr);
        }
        return;
      }
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const dataWithTimestamp = { ...gameData, timestamp: now };
    const gameRef = doc(collection(db, "games"), gameId2);
    await setDoc(gameRef, dataWithTimestamp, { merge: true });
    if (gameData.weather) {
      const weatherRef = doc(collection(gameRef, "weather"), "current");
      await setDoc(weatherRef, gameData.weather);
    }
    if (gameData.line_movements && gameData.line_movements.length > 0) {
      const lastLine = gameData.line_movements[gameData.line_movements.length - 1];
      if (lastLine) {
        const lineId = lastLine.timestamp ? String(lastLine.timestamp).replace(/[:.]/g, "-") : String(Date.now());
        const lineRef = doc(collection(gameRef, "line_movements"), lineId);
        await setDoc(lineRef, lastLine);
      }
    }
    if (gameData.betting_history && gameData.betting_history.length > 0) {
      const lastSnapshot = gameData.betting_history[gameData.betting_history.length - 1];
      if (lastSnapshot?.timestamp) {
        const snapshotId = String(lastSnapshot.timestamp).replace(/[:.]/g, "-");
        const bettingRef = doc(collection(gameRef, "betting_history"), snapshotId);
        await setDoc(bettingRef, lastSnapshot);
      }
    }
    if (gameData.offensive_splits) {
      const splitsRef = doc(collection(gameRef, "offensive_splits"), "current");
      await setDoc(splitsRef, gameData.offensive_splits);
    }
    if (gameData.fatigue_metrics) {
      const fatigueRef = doc(collection(gameRef, "fatigue_metrics"), "current");
      await setDoc(fatigueRef, gameData.fatigue_metrics);
    }
    if (gameData.advanced_pitching) {
      const advPitchingRef = doc(collection(gameRef, "advanced_pitching"), "current");
      await setDoc(advPitchingRef, gameData.advanced_pitching);
    }
    if (gameData.advanced_offense) {
      const advOffenseRef = doc(collection(gameRef, "advanced_offense"), "current");
      await setDoc(advOffenseRef, gameData.advanced_offense);
    }
    if (gameData.model_features) {
      const featuresRef = doc(collection(gameRef, "model_features"), "current");
      await setDoc(featuresRef, gameData.model_features);
    }
    if (gameData.game_result) {
      const resultRef = doc(collection(gameRef, "game_result"), "current");
      await setDoc(resultRef, gameData.game_result);
    }
    const snapshotRef = doc(collection(gameRef, "snapshots"), now);
    await setDoc(snapshotRef, dataWithTimestamp);
    const date = gameData?.metadata?.date;
    if (date) {
      const metadataRef = doc(db, "metadata", "extracted_dates");
      await setDoc(metadataRef, {
        dates: arrayUnion(date)
      }, { merge: true });
    }
    console.log(`Successfully saved game ${gameId2} and snapshot to Firestore.`);
  } catch (error) {
    console.error(`Error saving game ${gameId2} to Firestore:`, error);
    throw error;
  }
};
var loadAllGamesFromFirestore = async () => {
  try {
    if (!db) {
      console.warn("Firestore db is not initialized. Skipping Firestore load.");
      return [];
    }
    const isAuthed = await ensureAnonymousAuth();
    if (!isAuthed) return [];
    console.log("Cargando juegos desde Firestore...");
    const gamesColl = collection(db, "games");
    const snapshot = await withFirestoreReadTimeout(getDocs(gamesColl), null, "todos los juegos");
    if (!snapshot) return [];
    const games = [];
    snapshot.forEach((doc2) => {
      games.push(doc2.data());
    });
    console.log(`Se cargaron exitosamente ${games.length} juegos desde Firestore.`);
    return games;
  } catch (error) {
    console.error("Error al cargar juegos de Firestore:", error);
    return [];
  }
};
var emptyCache = /* @__PURE__ */ new Map();
var EMPTY_CACHE_TTL_MS = 5 * 60 * 1e3;
var loadGamesByDateFromFirestore = async (date) => {
  try {
    const now = Date.now();
    if (emptyCache.has(date) && now - emptyCache.get(date) < EMPTY_CACHE_TTL_MS) {
      console.log(`[Cach\xE9] D\xEDa vac\xEDo en cach\xE9 para ${date}, abortando consulta a Firebase instant\xE1neamente.`);
      return [];
    }
    if (!db) {
      console.warn("Firestore db is not initialized. Skipping Firestore date load.");
      return [];
    }
    const isAuthed = await ensureAnonymousAuth();
    if (!isAuthed) return [];
    const metadataRef = doc(db, "metadata", "extracted_dates");
    const metaSnapshot = await withFirestoreReadTimeout(getDoc(metadataRef), null, "metadatos de fechas r\xE1pidas");
    if (metaSnapshot && metaSnapshot.exists()) {
      const dates = metaSnapshot.data()?.dates || [];
      if (!dates.includes(date)) {
        console.log(`[Optimizaci\xF3n] La fecha ${date} no est\xE1 en metadatos. Evitando query completo.`);
        emptyCache.set(date, now);
        return [];
      }
    }
    const gamesQuery = query(collection(db, "games"), where("metadata.date", "==", date));
    const snapshot = await withFirestoreReadTimeout(getDocs(gamesQuery), null, `juegos de ${date}`);
    if (!snapshot || snapshot.empty) {
      emptyCache.set(date, now);
      return [];
    }
    const games = [];
    snapshot.forEach((doc2) => {
      games.push(doc2.data());
    });
    console.log(`Se cargaron ${games.length} juegos desde Firestore para ${date}.`);
    return games;
  } catch (error) {
    console.error(`Error al cargar juegos de Firestore para ${date}:`, error);
    return [];
  }
};
var loadGamesByDateRangeFromFirestore = async (startDate, endDate) => {
  try {
    if (!db) return [];
    const isAuthed = await ensureAnonymousAuth();
    if (!isAuthed) return [];
    const gamesQuery = query(
      collection(db, "games"),
      where("metadata.date", ">=", startDate),
      where("metadata.date", "<=", endDate),
      orderBy("metadata.date", "asc")
    );
    const snapshot = await withFirestoreReadTimeout(getDocs(gamesQuery), null, `juegos entre ${startDate} y ${endDate}`, 2e4);
    if (!snapshot) throw new Error("Firestore no respondi\xF3 dentro de 20 segundos");
    return snapshot.docs.map((gameDocument) => gameDocument.data());
  } catch (error) {
    console.error(`[Firestore] Error leyendo rango ${startDate}..${endDate}:`, error);
    throw error;
  }
};
var loadLatestGamesFromFirestore = async () => {
  try {
    if (!db) {
      console.warn("Firestore db is not initialized. Skipping Firestore latest load.");
      return [];
    }
    const isAuthed = await ensureAnonymousAuth();
    if (!isAuthed) return [];
    const latestQuery = query(collection(db, "games"), orderBy("metadata.date", "desc"), limit(1));
    const latestSnapshot = await withFirestoreReadTimeout(getDocs(latestQuery), null, "fecha mas reciente");
    if (!latestSnapshot) return [];
    const latestDate = latestSnapshot.docs[0]?.data()?.metadata?.date;
    if (!latestDate) return [];
    return loadGamesByDateFromFirestore(latestDate);
  } catch (error) {
    console.error("Error al cargar la fecha m\xC3\xA1s reciente desde Firestore:", error);
    return [];
  }
};
var loadExtractedDatesFromFirestore = async () => {
  try {
    if (!db) {
      console.warn("Firestore db is not initialized. Skipping Firestore dates load.");
      return [];
    }
    const isAuthed = await ensureAnonymousAuth();
    if (!isAuthed) return [];
    const metadataRef = doc(db, "metadata", "extracted_dates");
    const metaSnapshot = await withFirestoreReadTimeout(getDoc(metadataRef), null, "metadatos de fechas");
    if (metaSnapshot && metaSnapshot.exists()) {
      const dates2 = metaSnapshot.data()?.dates || [];
      return [...dates2].sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    }
    console.log("[Firestore] Documento metadata/extracted_dates no encontrado. Usando fallback pesado...");
    const datesQuery = query(collection(db, "games"), orderBy("metadata.date", "desc"));
    const snapshot = await withFirestoreReadTimeout(getDocs(datesQuery), null, "fechas extraidas");
    if (!snapshot) return [];
    const dates = /* @__PURE__ */ new Set();
    snapshot.forEach((doc2) => {
      const date = doc2.data()?.metadata?.date;
      if (typeof date === "string" && date) dates.add(date);
    });
    return Array.from(dates);
  } catch (error) {
    console.error("Error al cargar fechas extraidas desde Firestore:", error);
    return [];
  }
};

// src/etl/extractors/rotowireScraper.ts
async function scrapeStrikeoutProps() {
  const props = [];
  try {
    console.log("[Rotowire] Realizando petici\xF3n a player-props.php...");
    const response = await fetch("https://www.rotowire.com/betting/mlb/player-props.php?prop=strikeouts", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"
      }
    });
    if (!response.ok) {
      throw new Error(`Rotowire devolvi\xF3 status: ${response.status}`);
    }
    const html = await response.text();
    const regex = /data\s*:\s*(\[\{.*?\}\])\s*,/g;
    let match;
    let targetData = [];
    while ((match = regex.exec(html)) !== null) {
      try {
        const parsed = JSON.parse(match[1]);
        if (parsed.length > 0 && ("draftkings_strikeouts" in parsed[0] || "fanduel_strikeouts" in parsed[0])) {
          targetData = parsed;
          break;
        }
      } catch (e) {
      }
    }
    if (targetData.length === 0) {
      console.log("[Rotowire] No se encontraron datos de strikeouts en el HTML. Puede que no haya juegos.");
      return [];
    }
    console.log(`[Rotowire] Encontrados ${targetData.length} jugadores con datos. Parseando...`);
    for (const player of targetData) {
      const name = player.name;
      const sportsbooks = ["draftkings", "fanduel", "mgm", "caesars", "betrivers", "hardrock", "thescore"];
      const linesData = [];
      for (const book of sportsbooks) {
        const lineStr = player[`${book}_strikeouts`];
        const underStr = player[`${book}_strikeoutsUnder`];
        const overStr = player[`${book}_strikeoutsOver`];
        if (lineStr !== null && lineStr !== "") {
          const parsedOver = parseInt(overStr, 10);
          const parsedUnder = parseInt(underStr, 10);
          const line = parseFloat(lineStr);
          if (!isNaN(line)) {
            linesData.push({
              line,
              overOdds: isNaN(parsedOver) ? null : parsedOver,
              underOdds: isNaN(parsedUnder) ? null : parsedUnder,
              book
            });
          }
        }
      }
      if (linesData.length > 0) {
        const lineCounts = /* @__PURE__ */ new Map();
        for (const d of linesData) {
          lineCounts.set(d.line, (lineCounts.get(d.line) || 0) + 1);
        }
        let modeLine = linesData[0].line;
        let maxCount = 0;
        for (const [line, count] of lineCounts.entries()) {
          if (count > maxCount) {
            maxCount = count;
            modeLine = line;
          }
        }
        let bestLineData = linesData.find((d) => d.line === modeLine && d.book === "draftkings") || linesData.find((d) => d.line === modeLine);
        const matchingBooks = linesData.filter((d) => d.line === modeLine).map((d) => d.book);
        const sourceLabel = matchingBooks.length > 1 ? `Consenso (${matchingBooks.length} casas)` : bestLineData.book;
        props.push({
          playerName: name,
          line: bestLineData.line,
          overOdds: bestLineData.overOdds,
          underOdds: bestLineData.underOdds,
          sportsbook: sourceLabel
        });
      }
    }
    return props;
  } catch (error) {
    console.error("[Rotowire] Error al hacer scrape de Strikeouts:", error);
    return [];
  }
}

// src/etl/transformers/vortexMetrics.ts
var enrichWithVortexMetrics = (game) => {
  if (game.advanced_pitching && game.fatigue_metrics) {
    if (game.advanced_pitching.home && game.fatigue_metrics.pitchers?.home) {
      enrichPitcherMetrics(game.advanced_pitching.home, game.fatigue_metrics.pitchers.home);
    }
    if (game.advanced_pitching.away && game.fatigue_metrics.pitchers?.away) {
      enrichPitcherMetrics(game.advanced_pitching.away, game.fatigue_metrics.pitchers.away);
    }
  }
  if (game.lineups && game.advanced_offense) {
    if (game.lineups.home && game.advanced_offense.home) {
      enrichLineupMetrics(game.lineups.home, game.advanced_offense.home);
    }
    if (game.lineups.away && game.advanced_offense.away) {
      enrichLineupMetrics(game.lineups.away, game.advanced_offense.away);
    }
  }
  return game;
};
var enrichPitcherMetrics = (pitchingStats, fatigueStats) => {
  if (pitchingStats.last5PitchCountAvg != null && pitchingStats.last5BfAvg != null && pitchingStats.last5BfAvg > 0) {
    pitchingStats.pitcher_pitches_per_bf_last5 = pitchingStats.last5PitchCountAvg / pitchingStats.last5BfAvg;
  }
  if (pitchingStats.last5PitchCountAvg != null && pitchingStats.last5IpAvg != null && pitchingStats.last5IpAvg > 0) {
    pitchingStats.pitcher_pitches_per_ip_last5 = pitchingStats.last5PitchCountAvg / pitchingStats.last5IpAvg;
  }
  if (fatigueStats.pitchesLast3Starts != null) {
    pitchingStats.pitcher_avg_pitches_last3 = fatigueStats.pitchesLast3Starts / 3;
  }
  if (fatigueStats.daysSinceLastStart != null) {
    const days = fatigueStats.daysSinceLastStart;
    if (days <= 4) pitchingStats.pitcher_rest_status = "Short Rest";
    else if (days === 5) pitchingStats.pitcher_rest_status = "Normal";
    else pitchingStats.pitcher_rest_status = "Extra Rest";
  }
  const arsenal = [
    { name: "fastball", pct: pitchingStats.fastballPct || 0 },
    { name: "slider", pct: pitchingStats.sliderPct || 0 },
    { name: "curve", pct: pitchingStats.curvePct || 0 },
    { name: "changeup", pct: pitchingStats.changeupPct || 0 },
    { name: "splitter", pct: pitchingStats.splitterPct || 0 }
  ].sort((a, b) => b.pct - a.pct);
  if (arsenal[0].pct > 0) {
    pitchingStats.pitcher_primary_pitch = arsenal[0].name;
    pitchingStats.pitcher_primary_pitch_usage_pct = arsenal[0].pct;
  }
  if (arsenal[1].pct > 0) {
    pitchingStats.pitcher_secondary_pitch = arsenal[1].name;
    pitchingStats.pitcher_secondary_pitch_usage_pct = arsenal[1].pct;
  }
};
var enrichLineupMetrics = (batters, offenseStats) => {
  let lineupContactStress = 0;
  let lineupPitchRisk = 0;
  let lowKCount = 0;
  let highBabipCount = 0;
  let highHardhitCount = 0;
  for (const batter of batters) {
    const contactFactor = batter.contact_pct_vs_rhp || 0.8;
    const kFactor = batter.kPct || batter.strikeout_pct || 0.2;
    const batterStress = contactFactor * 100 - kFactor * 100;
    batter.batter_contact_stress_score = Math.max(0, batterStress);
    lineupContactStress += batter.batter_contact_stress_score;
    if (kFactor < 0.18) lowKCount++;
    if ((batter.babip || 0) > 0.3) highBabipCount++;
    if ((batter.hardHitPct || 0) > 0.4) highHardhitCount++;
    const bbPct = batter.walk_pct || 0.08;
    lineupPitchRisk += bbPct * 100;
  }
  if (batters.length > 0) {
    offenseStats.lineup_contact_stress_score = lineupContactStress / batters.length;
    offenseStats.lineup_pitch_count_risk_score = lineupPitchRisk / batters.length;
  }
  offenseStats.lineup_low_k_batters_count = lowKCount;
  offenseStats.lineup_high_babip_batters_count = highBabipCount;
  offenseStats.lineup_high_hardhit_batters_count = highHardhitCount;
};

// src/etl/extractors/savantScraper.ts
import { parse } from "csv-parse/sync";
var SavantCache = class {
  constructor() {
    this.pitcherStats = /* @__PURE__ */ new Map();
    this.batterStats = /* @__PURE__ */ new Map();
    this.catcherStats = /* @__PURE__ */ new Map();
    this.isLoaded = false;
    this.currentYear = 0;
    this.loadedAt = null;
  }
  async load(year) {
    if (this.isLoaded && this.currentYear === year) return;
    console.log(`[Savant] Descargando datos de Baseball Savant para el a\xF1o ${year}...`);
    try {
      const [
        pitcherExpected,
        pitcherStatcast,
        batterExpected,
        batterStatcast,
        pitcherArsenal,
        batterArsenal,
        catcherFraming
      ] = await Promise.all([
        this.fetchCSV(`https://baseballsavant.mlb.com/leaderboard/expected_statistics?type=pitcher&year=${year}&position=&team=&min=1&csv=true`),
        this.fetchCSV(`https://baseballsavant.mlb.com/leaderboard/statcast?type=pitcher&year=${year}&position=&team=&min=1&csv=true`),
        this.fetchCSV(`https://baseballsavant.mlb.com/leaderboard/expected_statistics?type=batter&year=${year}&position=&team=&min=1&csv=true`),
        this.fetchCSV(`https://baseballsavant.mlb.com/leaderboard/statcast?type=batter&year=${year}&position=&team=&min=1&csv=true`),
        this.fetchCSV(`https://baseballsavant.mlb.com/leaderboard/pitch-arsenal-stats?type=pitcher&year=${year}&team=&min=10&csv=true`),
        this.fetchCSV(`https://baseballsavant.mlb.com/leaderboard/pitch-arsenal-stats?type=batter&year=${year}&team=&min=10&csv=true`),
        this.fetchCSV(`https://baseballsavant.mlb.com/leaderboard/catcher-framing?year=${year}&csv=true`)
      ]);
      this.processPitcherData(pitcherExpected, pitcherStatcast, pitcherArsenal);
      this.processBatterData(batterExpected, batterStatcast, batterArsenal);
      this.processCatcherData(catcherFraming);
      this.isLoaded = true;
      this.currentYear = year;
      this.loadedAt = (/* @__PURE__ */ new Date()).toISOString();
      console.log(`[Savant] Datos cargados exitosamente: ${this.pitcherStats.size} pitchers, ${this.batterStats.size} batters, ${this.catcherStats.size} catchers.`);
    } catch (error) {
      console.error("[Savant] Error cargando datos:", error);
    }
  }
  async fetchCSV(url) {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Error fetching ${url}: ${res.statusText}`);
    }
    const text = await res.text();
    const records = parse(text, {
      columns: true,
      skip_empty_lines: true,
      cast: true
    });
    return records;
  }
  parseNumber(value) {
    const parsed = parseFloat(String(value));
    return Number.isFinite(parsed) ? parsed : null;
  }
  groupPitchType(pitchName) {
    const name = pitchName?.toLowerCase() || "";
    if (name.includes("fastball") || name.includes("sinker") || name.includes("cutter")) return "fastball";
    if (name.includes("slider") || name.includes("sweeper") || name.includes("slurve")) return "slider";
    if (name.includes("curve")) return "curve";
    if (name.includes("changeup")) return "changeup";
    if (name.includes("split") || name.includes("fork")) return "splitter";
    return "other";
  }
  processPitcherData(expectedData, statcastData, arsenalData) {
    this.pitcherStats.clear();
    for (const row of expectedData) {
      const playerId = String(row.player_id);
      this.pitcherStats.set(playerId, {
        playerId,
        xERA: this.parseNumber(row.xera),
        xwOBA: this.parseNumber(row.est_woba),
        hardHitPct: null,
        barrelPct: null,
        fastballPct: 0,
        sliderPct: 0,
        curvePct: 0,
        changeupPct: 0,
        splitterPct: 0,
        chasePct: null,
        spinRate: null
      });
    }
    for (const row of statcastData) {
      const playerId = String(row.player_id);
      const existing = this.pitcherStats.get(playerId) || {
        playerId,
        xERA: null,
        xwOBA: null,
        hardHitPct: null,
        barrelPct: null,
        fastballPct: 0,
        sliderPct: 0,
        curvePct: 0,
        changeupPct: 0,
        splitterPct: 0,
        chasePct: null,
        spinRate: null
      };
      existing.hardHitPct = this.parseNumber(row.ev95percent);
      existing.barrelPct = this.parseNumber(row.brl_percent);
      existing.chasePct = this.parseNumber(row.oz_swing_percent);
      this.pitcherStats.set(playerId, existing);
    }
    for (const row of arsenalData) {
      const playerId = String(row.player_id);
      const existing = this.pitcherStats.get(playerId);
      if (!existing) continue;
      const group = this.groupPitchType(row.pitch_name);
      const usage = this.parseNumber(row.pitch_usage) || 0;
      if (group === "fastball") existing.fastballPct += usage;
      if (group === "slider") existing.sliderPct += usage;
      if (group === "curve") existing.curvePct += usage;
      if (group === "changeup") existing.changeupPct += usage;
      if (group === "splitter") existing.splitterPct += usage;
    }
  }
  processBatterData(expectedData, statcastData, arsenalData) {
    this.batterStats.clear();
    for (const row of expectedData) {
      const playerId = String(row.player_id);
      this.batterStats.set(playerId, {
        playerId,
        xwOBA: this.parseNumber(row.est_woba),
        hardHitPct: null,
        barrelPct: null,
        chasePct: null,
        whiffPct: null,
        whiffPctVsFastball: null,
        whiffPctVsSlider: null,
        whiffPctVsCurve: null,
        whiffPctVsChangeup: null,
        whiffPctVsSplitter: null
      });
    }
    for (const row of statcastData) {
      const playerId = String(row.player_id);
      const existing = this.batterStats.get(playerId) || {
        playerId,
        xwOBA: null,
        hardHitPct: null,
        barrelPct: null,
        chasePct: null,
        whiffPct: null,
        whiffPctVsFastball: null,
        whiffPctVsSlider: null,
        whiffPctVsCurve: null,
        whiffPctVsChangeup: null,
        whiffPctVsSplitter: null
      };
      existing.hardHitPct = this.parseNumber(row.ev95percent);
      existing.barrelPct = this.parseNumber(row.brl_percent);
      existing.chasePct = this.parseNumber(row.oz_swing_percent);
      existing.whiffPct = this.parseNumber(row.whiff_percent);
      this.batterStats.set(playerId, existing);
    }
    const tempGroupWhiffs = {};
    const tempOverallWhiffs = {};
    for (const row of arsenalData) {
      const playerId = String(row.player_id);
      if (!this.batterStats.has(playerId)) continue;
      const group = this.groupPitchType(row.pitch_name);
      const whiff = this.parseNumber(row.whiff_percent);
      if (group !== "other" && whiff !== null) {
        if (!tempGroupWhiffs[playerId]) tempGroupWhiffs[playerId] = {};
        if (!tempGroupWhiffs[playerId][group]) tempGroupWhiffs[playerId][group] = { totalWhiff: 0, count: 0 };
        const pitches = this.parseNumber(row.pitches) || 1;
        if (!tempOverallWhiffs[playerId]) tempOverallWhiffs[playerId] = { totalWhiff: 0, count: 0 };
        tempOverallWhiffs[playerId].totalWhiff += whiff * pitches;
        tempOverallWhiffs[playerId].count += pitches;
        tempGroupWhiffs[playerId][group].totalWhiff += whiff * pitches;
        tempGroupWhiffs[playerId][group].count += pitches;
      }
    }
    for (const [playerId, groups] of Object.entries(tempGroupWhiffs)) {
      const existing = this.batterStats.get(playerId);
      if (existing) {
        const overall = tempOverallWhiffs[playerId];
        if (existing.whiffPct === null && overall?.count > 0) {
          existing.whiffPct = overall.totalWhiff / overall.count;
        }
        if (groups["fastball"]) existing.whiffPctVsFastball = groups["fastball"].totalWhiff / groups["fastball"].count;
        if (groups["slider"]) existing.whiffPctVsSlider = groups["slider"].totalWhiff / groups["slider"].count;
        if (groups["curve"]) existing.whiffPctVsCurve = groups["curve"].totalWhiff / groups["curve"].count;
        if (groups["changeup"]) existing.whiffPctVsChangeup = groups["changeup"].totalWhiff / groups["changeup"].count;
        if (groups["splitter"]) existing.whiffPctVsSplitter = groups["splitter"].totalWhiff / groups["splitter"].count;
      }
    }
  }
  processCatcherData(catcherData) {
    this.catcherStats.clear();
    for (const row of catcherData) {
      const playerId = String(row.id);
      this.catcherStats.set(playerId, {
        playerId,
        framingRuns: this.parseNumber(row.rv_tot)
      });
    }
  }
  getPitcher(playerId) {
    return this.pitcherStats.get(String(playerId)) || null;
  }
  getBatter(playerId) {
    return this.batterStats.get(String(playerId)) || null;
  }
  getCatcher(playerId) {
    return this.catcherStats.get(String(playerId)) || null;
  }
  /**
   * Fecha/hora (ISO) en que se descargó el snapshot de Baseball Savant actualmente en caché.
   * NOTA point-in-time: este snapshot es "temporada completa hasta hoy", no está recortado
   * a la fecha de cada juego. Úsalo para saber si las columnas derivadas de Savant
   * (xERA, xwOBA, hardHit%, barrel%, arsenal%, framing) son confiables para una fila histórica:
   * si la fecha del juego es anterior a esta fecha, esos valores pueden incluir información
   * posterior al juego (ver auditoría del pipeline, sección 3).
   */
  getSnapshotDate() {
    return this.loadedAt;
  }
};
var savantCache = new SavantCache();

// src/utils.ts
function escapeCsvValue(val) {
  if (val === void 0 || val === null || val === "") return "";
  return `"${String(val).replace(/"/g, '""')}"`;
}
function roundCsvNumber(val, decimals = 1) {
  if (val === void 0 || val === null || val === "") return "";
  const parsed = Number(val);
  if (!Number.isFinite(parsed)) return "";
  const factor = Math.pow(10, decimals);
  return Math.round(parsed * factor) / factor;
}
function parseNum(val) {
  if (val === null || val === void 0 || val === "") return null;
  const n2 = Number(val);
  return isNaN(n2) ? null : n2;
}
function calcLast3Stats(v1, v2, v3) {
  const nums = [parseNum(v1), parseNum(v2), parseNum(v3)].filter((n2) => n2 !== null);
  if (nums.length === 0) return { avg: "", min: "", under15: "", under18: "" };
  const sum = nums.reduce((a, b) => a + b, 0);
  const avg = (sum / nums.length).toFixed(1);
  const min = Math.min(...nums).toString();
  const under15 = nums.filter((v) => v < 15).length.toString();
  const under18 = nums.filter((v) => v < 18).length.toString();
  return { avg, min, under15, under18 };
}
var MLB_TEAM_ABBR = {
  "Arizona Diamondbacks": "ARI",
  "Athletics": "OAK",
  "Atlanta Braves": "ATL",
  "Baltimore Orioles": "BAL",
  "Boston Red Sox": "BOS",
  "Chicago Cubs": "CHC",
  "Chicago White Sox": "CHW",
  "Cincinnati Reds": "CIN",
  "Cleveland Guardians": "CLE",
  "Colorado Rockies": "COL",
  "Detroit Tigers": "DET",
  "Houston Astros": "HOU",
  "Kansas City Royals": "KC",
  "Los Angeles Angels": "LAA",
  "Los Angeles Dodgers": "LAD",
  "Miami Marlins": "MIA",
  "Milwaukee Brewers": "MIL",
  "Minnesota Twins": "MIN",
  "New York Mets": "NYM",
  "New York Yankees": "NYY",
  "Oakland Athletics": "OAK",
  "Philadelphia Phillies": "PHI",
  "Pittsburgh Pirates": "PIT",
  "San Diego Padres": "SD",
  "San Francisco Giants": "SF",
  "Seattle Mariners": "SEA",
  "St. Louis Cardinals": "STL",
  "Tampa Bay Rays": "TB",
  "Texas Rangers": "TEX",
  "Toronto Blue Jays": "TOR",
  "Washington Nationals": "WSH"
};
function getTeamAbbr(teamName) {
  return MLB_TEAM_ABBR[teamName] || null;
}
function getLineupAverageKPct(lineup) {
  if (!lineup || !Array.isArray(lineup) || lineup.length === 0) return "";
  let totalPA = 0;
  let totalSO = 0;
  for (const p of lineup) {
    const kPct = p.strikeout_pct ?? p.kPct ?? 0;
    const pa = p.pa || 0;
    if (pa > 0) {
      totalPA += pa;
      totalSO += kPct / 100 * pa;
    }
  }
  if (totalPA === 0) {
    const sum = lineup.reduce((acc, p) => acc + (p.strikeout_pct ?? p.kPct ?? 0), 0);
    return (sum / lineup.length).toFixed(1);
  }
  return (totalSO / totalPA * 100).toFixed(1);
}
function isFinalGameStatus(status) {
  const normalized = String(status || "").toLowerCase();
  return normalized.includes("final") || normalized === "game over" || normalized === "completed early" || normalized === "completed";
}
function hasRealBettingLines(game) {
  const summary = String(game.betting_lines?.lineMovementSummary || "").toLowerCase();
  if (summary.includes("estandar") || summary.includes("est\xE1ndar") || summary.includes("sin lineas reales") || summary.includes("sin l\xEDneas reales")) {
    return false;
  }
  const lines = game.betting_lines;
  const isSyntheticDefault = lines?.openingMoneylineHome === -110 && lines?.openingMoneylineAway === -110 && lines?.currentMoneylineHome === -110 && lines?.currentMoneylineAway === -110 && lines?.runLineHome === -1.5 && lines?.runLineHomeOdds === -110 && lines?.runLineAway === 1.5 && lines?.runLineAwayOdds === -110 && lines?.totalRuns === 8.5 && lines?.overOdds === -110 && lines?.underOdds === -110;
  if (isSyntheticDefault) return false;
  return [
    lines?.openingMoneylineHome,
    lines?.openingMoneylineAway,
    lines?.currentMoneylineHome,
    lines?.currentMoneylineAway,
    lines?.runLineHome,
    lines?.runLineHomeOdds,
    lines?.runLineAway,
    lines?.runLineAwayOdds,
    lines?.totalRuns,
    lines?.overOdds,
    lines?.underOdds
  ].some((value) => value !== null && value !== void 0);
}
function getBettingLineSource(game) {
  if (!hasRealBettingLines(game)) return "";
  const explicitSource = game.betting_lines?.lineSource;
  if (explicitSource) return explicitSource;
  const summary = String(game.betting_lines?.lineMovementSummary || "").toLowerCase();
  if (summary.includes("odds api")) return "the_odds_api";
  if (summary.includes("datastreak") || summary.includes("data streak")) return "datastreak";
  return "";
}
function getPropLineSource(source, book) {
  if (source) return source;
  const normalizedBook = String(book || "").toLowerCase();
  if (normalizedBook.includes("oddsapi") || normalizedBook.includes("odds api")) return "the_odds_api";
  if (normalizedBook.includes("datastreak") || normalizedBook.includes("data streak")) return "datastreak";
  if (normalizedBook) return "datastreak";
  return "";
}
function pitcherPitStatsBlockValues(pit) {
  return [
    pit?.era ?? "",
    pit?.whip ?? "",
    pit?.kPct ?? "",
    pit?.bbPct ?? "",
    pit?.wins ?? "",
    pit?.losses ?? "",
    escapeCsvValue(pit?.ip ?? ""),
    pit?.totalStrikeouts ?? "",
    pit?.gs ?? "",
    pit?.ipAvgPerStart ?? "",
    pit ? "pit" : ""
  ];
}
function getPitcherDerivedMetrics(g, side) {
  const p = g.pitchers?.[side + "_starter"] || g.pitchers?.[side] || {};
  const ap = g.advanced_pitching?.[side] || {};
  const pitches = [
    { name: "Fastball", pct: parseFloat(ap.fastballPct || "0") },
    { name: "Slider", pct: parseFloat(ap.sliderPct || "0") },
    { name: "Curveball", pct: parseFloat(ap.curvePct || "0") },
    { name: "Changeup", pct: parseFloat(ap.changeupPct || "0") },
    { name: "Splitter", pct: parseFloat(ap.splitterPct || "0") }
  ].sort((a, b) => b.pct - a.pct);
  const primary_pitch = pitches[0]?.pct > 0 ? pitches[0].name : "";
  const primary_usage = pitches[0]?.pct > 0 ? pitches[0].pct.toString() : "";
  const secondary_pitch = pitches[1]?.pct > 0 ? pitches[1].name : "";
  const secondary_usage = pitches[1]?.pct > 0 ? pitches[1].pct.toString() : "";
  const pitchesLast5 = parseFloat(p.pitchesLast5 || ap.last5PitchCountAvg || "0");
  const bfLast5 = parseFloat(p.bfLast5 || ap.last5BfAvg || "0");
  const ipLast5 = parseFloat(p.ipLast5 || ap.last5IpAvg || "0");
  const pitches_per_bf_last5 = pitchesLast5 > 0 && bfLast5 > 0 ? (pitchesLast5 / bfLast5).toFixed(2) : "";
  const pitches_per_ip_last5 = pitchesLast5 > 0 && ipLast5 > 0 ? (pitchesLast5 / ipLast5).toFixed(2) : "";
  const totalPitches = parseFloat(ap.projectedPitchCount || "0");
  const totalBf = parseFloat(ap.battersFacedPerStart || "0");
  const pitches_per_bf = totalPitches > 0 && totalBf > 0 ? (totalPitches / totalBf).toFixed(2) : "";
  const restDays = parseFloat(p.restDays || "0");
  const rest_status = restDays >= 5 ? "Fully Rested" : restDays === 4 ? "Normal Rest" : "Short Rest";
  return {
    primary_pitch: p.pitcher_primary_pitch || primary_pitch,
    primary_usage: p.pitcher_primary_pitch_usage_pct || primary_usage,
    secondary_pitch: p.pitcher_secondary_pitch || secondary_pitch,
    secondary_usage: p.pitcher_secondary_pitch_usage_pct || secondary_usage,
    pitches_per_bf_last5: p.pitcher_pitches_per_bf_last5 || pitches_per_bf_last5,
    pitches_per_ip_last5: p.pitcher_pitches_per_ip_last5 || pitches_per_ip_last5,
    pitches_per_bf,
    rest_status: p.pitcher_rest_status || rest_status
  };
}
function generateMLDatasetCSV(games, pitLookups = {}) {
  const headers = [
    // Metadata
    "game_id",
    "date",
    "time",
    "home_team",
    "away_team",
    "venue",
    // Pitchers standard
    "home_pitcher",
    "home_pitcher_era",
    "home_pitcher_whip",
    "home_pitcher_kPct",
    "home_pitcher_bbPct",
    "home_pitcher_wins",
    "home_pitcher_losses",
    "home_pitcher_ip",
    "home_pitcher_strikeouts",
    "home_pitcher_gs",
    "home_pitcher_ip_avg_start",
    "home_pitcher_stats_source",
    "away_pitcher",
    "away_pitcher_era",
    "away_pitcher_whip",
    "away_pitcher_kPct",
    "away_pitcher_bbPct",
    "away_pitcher_wins",
    "away_pitcher_losses",
    "away_pitcher_ip",
    "away_pitcher_strikeouts",
    "away_pitcher_gs",
    "away_pitcher_ip_avg_start",
    "away_pitcher_stats_source",
    // Bullpen standard
    "home_bullpen_era",
    "home_bullpen_usage",
    "home_bullpen_ip_7d",
    "away_bullpen_era",
    "away_bullpen_usage",
    "away_bullpen_ip_7d",
    // Offense standard
    "home_offense_run_g",
    "home_offense_ops",
    "home_offense_obp",
    "home_offense_slg",
    "home_offense_kPct",
    "away_offense_run_g",
    "away_offense_ops",
    "away_offense_obp",
    "away_offense_slg",
    "away_offense_kPct",
    // Weather
    "weather_temp",
    "weather_humidity",
    "weather_wind_speed",
    "weather_wind_dir",
    "weather_pressure",
    "weather_rain_prob",
    "weather_sky",
    "weather_apparent_temp",
    // Home splits
    "home_splits_vs_rhp_avg",
    "home_splits_vs_rhp_ops",
    "home_splits_vs_rhp_obp",
    "home_splits_vs_rhp_slg",
    "home_splits_vs_rhp_rpg",
    "home_splits_vs_rhp_hr",
    "home_splits_vs_lhp_avg",
    "home_splits_vs_lhp_ops",
    "home_splits_vs_lhp_obp",
    "home_splits_vs_lhp_slg",
    "home_splits_vs_lhp_rpg",
    "home_splits_vs_lhp_hr",
    // Away splits
    "away_splits_vs_rhp_avg",
    "away_splits_vs_rhp_ops",
    "away_splits_vs_rhp_obp",
    "away_splits_vs_rhp_slg",
    "away_splits_vs_rhp_rpg",
    "away_splits_vs_rhp_hr",
    "away_splits_vs_lhp_avg",
    "away_splits_vs_lhp_ops",
    "away_splits_vs_lhp_obp",
    "away_splits_vs_lhp_slg",
    "away_splits_vs_lhp_rpg",
    "away_splits_vs_lhp_hr",
    // Fatigue
    "home_pitcher_rest",
    "home_pitcher_pitches_last",
    "home_pitcher_pitches_last_3",
    "away_pitcher_rest",
    "away_pitcher_pitches_last",
    "away_pitcher_pitches_last_3",
    "home_bullpen_ip_3d",
    "home_bullpen_ip_7d_recent",
    "home_bullpen_relievers_yesterday",
    "home_bullpen_relievers_2d",
    "home_bullpen_available",
    "away_bullpen_ip_3d",
    "away_bullpen_ip_7d_recent",
    "away_bullpen_relievers_yesterday",
    "away_bullpen_relievers_2d",
    "away_bullpen_available",
    // Advanced Pitching
    "home_pitcher_xera",
    "home_pitcher_fip",
    "home_pitcher_xfip",
    "home_pitcher_siera",
    "home_pitcher_hardhit_pct",
    "home_pitcher_barrel_pct",
    "home_pitcher_gb_pct",
    "home_pitcher_fb_pct",
    "home_pitcher_so_rate",
    "home_pitcher_bb_rate",
    "home_pitcher_swstr_pct",
    "home_pitcher_csw_pct",
    "home_pitcher_actual_ks",
    "home_pitcher_last5_ks_avg",
    "home_pitcher_last5_ks_std",
    "home_pitcher_last5_ip_avg",
    "home_pitcher_last5_bf_avg",
    "home_pitcher_last5_pitch_count_avg",
    "home_pitcher_last3_ks_1",
    "home_pitcher_last3_ks_2",
    "home_pitcher_last3_ks_3",
    "home_pitcher_last3_ip_1",
    "home_pitcher_last3_ip_2",
    "home_pitcher_last3_ip_3",
    "home_pitcher_last3_bf_1",
    "home_pitcher_last3_bf_2",
    "home_pitcher_last3_bf_3",
    "home_pitcher_career_k_pct_vs_team",
    "home_pitcher_last3_vs_team_ks_avg",
    "home_pitcher_last3_vs_team_bf_avg",
    "home_pitcher_bvp_pa_vs_team",
    "home_pitcher_projected_pitches",
    "home_pitcher_projected_innings",
    "home_pitcher_projected_strikeouts",
    "home_pitcher_bf_per_start",
    "home_pitcher_fastball_pct",
    "home_pitcher_slider_pct",
    "home_pitcher_curve_pct",
    "home_pitcher_changeup_pct",
    "home_pitcher_splitter_pct",
    "home_catcher_name",
    "home_catcher_framing_runs",
    "home_pitcher_last3_bf_avg",
    "home_pitcher_last3_ip_avg",
    "home_pitcher_last3_ks_avg",
    "home_pitcher_last3_min_bf",
    "home_pitcher_last3_min_ip",
    "home_pitcher_last3_bf_under_15_count",
    "home_pitcher_last3_bf_under_18_count",
    "away_pitcher_xera",
    "away_pitcher_fip",
    "away_pitcher_xfip",
    "away_pitcher_siera",
    "away_pitcher_hardhit_pct",
    "away_pitcher_barrel_pct",
    "away_pitcher_gb_pct",
    "away_pitcher_fb_pct",
    "away_pitcher_so_rate",
    "away_pitcher_bb_rate",
    "away_pitcher_swstr_pct",
    "away_pitcher_csw_pct",
    "away_pitcher_actual_ks",
    "away_pitcher_last5_ks_avg",
    "away_pitcher_last5_ks_std",
    "away_pitcher_last5_ip_avg",
    "away_pitcher_last5_bf_avg",
    "away_pitcher_last5_pitch_count_avg",
    "away_pitcher_last3_ks_1",
    "away_pitcher_last3_ks_2",
    "away_pitcher_last3_ks_3",
    "away_pitcher_last3_ip_1",
    "away_pitcher_last3_ip_2",
    "away_pitcher_last3_ip_3",
    "away_pitcher_last3_bf_1",
    "away_pitcher_last3_bf_2",
    "away_pitcher_last3_bf_3",
    "away_pitcher_career_k_pct_vs_team",
    "away_pitcher_last3_vs_team_ks_avg",
    "away_pitcher_last3_vs_team_bf_avg",
    "away_pitcher_bvp_pa_vs_team",
    "away_pitcher_projected_pitches",
    "away_pitcher_projected_innings",
    "away_pitcher_projected_strikeouts",
    "away_pitcher_bf_per_start",
    "away_pitcher_fastball_pct",
    "away_pitcher_slider_pct",
    "away_pitcher_curve_pct",
    "away_pitcher_changeup_pct",
    "away_pitcher_splitter_pct",
    "away_catcher_name",
    "away_catcher_framing_runs",
    "away_pitcher_last3_bf_avg",
    "away_pitcher_last3_ip_avg",
    "away_pitcher_last3_ks_avg",
    "away_pitcher_last3_min_bf",
    "away_pitcher_last3_min_ip",
    "away_pitcher_last3_bf_under_15_count",
    "away_pitcher_last3_bf_under_18_count",
    // Advanced Offense
    "home_offense_woba",
    "home_offense_xwoba",
    "home_offense_iso",
    "home_offense_babip",
    "home_offense_hardhit_pct",
    "home_offense_barrel_pct",
    "home_offense_contact_pct",
    "home_offense_k_pct_vs_pitch_hand",
    "home_projected_lineup_k_pct_vs_hand",
    "home_projected_lineup_contact_pct_vs_hand",
    "home_projected_lineup_whiff_pct_vs_hand",
    "home_offense_whiff_pct_vs_fastball",
    "home_offense_whiff_pct_vs_slider",
    "home_offense_whiff_pct_vs_curve",
    "home_offense_whiff_pct_vs_changeup",
    "home_offense_whiff_pct_vs_splitter",
    "away_offense_woba",
    "away_offense_xwoba",
    "away_offense_iso",
    "away_offense_babip",
    "away_offense_hardhit_pct",
    "away_offense_barrel_pct",
    "away_offense_contact_pct",
    "away_offense_k_pct_vs_pitch_hand",
    "away_projected_lineup_k_pct_vs_hand",
    "away_projected_lineup_contact_pct_vs_hand",
    "away_projected_lineup_whiff_pct_vs_hand",
    "away_offense_whiff_pct_vs_fastball",
    "away_offense_whiff_pct_vs_slider",
    "away_offense_whiff_pct_vs_curve",
    "away_offense_whiff_pct_vs_changeup",
    "away_offense_whiff_pct_vs_splitter",
    // Model Features
    "diff_era",
    "diff_xera",
    "diff_fip",
    "diff_ops",
    "diff_xwoba",
    "diff_bullpen_era",
    "diff_runs_per_game",
    "diff_record_last10",
    "diff_record_home_away",
    "diff_starter_rest",
    "diff_bullpen_fatigue",
    // Metadata de confiabilidad point-in-time (ver auditoría del pipeline, sección 3):
    // fecha en que se descargó el snapshot de Baseball Savant usado para las columnas
    // xera/xwoba/hardhit_pct/barrel_pct/swstr_pct/csw_pct/arsenal%/framing de esta fila.
    // Ese snapshot es "temporada completa hasta hoy", no recortado a la fecha del juego:
    // si "date" de la fila es anterior a savant_metrics_asof_date, esas columnas pueden
    // incluir información posterior al juego y no deben tratarse como point-in-time.
    "savant_metrics_asof_date",
    // Game Results / ML Target Labels
    "home_score",
    "away_score",
    "winner",
    "game_status",
    // VORTEX V10.3 METRICS (47 Variables)
    "lineup_confirmed",
    "lineup_source",
    "lineup_updated_at",
    "home_pitcher_primary_pitch",
    "home_pitcher_primary_pitch_usage_pct",
    "home_pitcher_secondary_pitch",
    "home_pitcher_secondary_pitch_usage_pct",
    "home_pitcher_pitches_per_bf",
    "home_pitcher_pitches_per_bf_last5",
    "home_pitcher_pitches_per_ip_last5",
    "away_pitcher_primary_pitch",
    "away_pitcher_primary_pitch_usage_pct",
    "away_pitcher_secondary_pitch",
    "away_pitcher_secondary_pitch_usage_pct",
    "away_pitcher_pitches_per_bf",
    "away_pitcher_pitches_per_bf_last5",
    "away_pitcher_pitches_per_ip_last5",
    "home_pitcher_avg_pitches_last3",
    "home_pitcher_rest_status",
    "away_pitcher_avg_pitches_last3",
    "away_pitcher_rest_status",
    "home_pitcher_pitchHand",
    "away_pitcher_pitchHand",
    "bullpen_home_ipLast3Days",
    "bullpen_home_ipLast7Days",
    "bullpen_away_ipLast3Days",
    "bullpen_away_ipLast7Days",
    "bullpen_home_relieversUsedYesterday",
    "home_lineup_contact_stress_score",
    "home_lineup_pitch_count_risk_score",
    "home_lineup_high_hardhit_batters_count",
    "away_lineup_contact_stress_score",
    "away_lineup_pitch_count_risk_score",
    "away_lineup_high_hardhit_batters_count",
    "home_pitcher_recent_velocity",
    "away_pitcher_recent_velocity",
    // New Advanced Metrics & Park Factors
    "home_pitcher_spin_rate",
    "away_pitcher_spin_rate",
    "home_pitcher_stuff_plus",
    "away_pitcher_stuff_plus",
    "home_pitcher_o_swing_pct",
    "away_pitcher_o_swing_pct",
    "home_pitcher_k_pct_vs_lhb",
    "away_pitcher_k_pct_vs_lhb",
    "home_pitcher_k_pct_vs_rhb",
    "away_pitcher_k_pct_vs_rhb",
    "park_factor_k",
    "park_factor_runs",
    "park_factor_hr",
    // ── BOXSCORE: Real starter stats from finished games (point-in-time target labels) ──
    "home_starter_game_ip",
    "home_starter_game_bf",
    "home_starter_game_hits",
    "home_starter_game_er",
    "home_starter_game_k",
    "home_starter_game_bb",
    "home_starter_game_pitches",
    "home_starter_game_hr",
    "home_starter_game_score",
    "away_starter_game_ip",
    "away_starter_game_bf",
    "away_starter_game_hits",
    "away_starter_game_er",
    "away_starter_game_k",
    "away_starter_game_bb",
    "away_starter_game_pitches",
    "away_starter_game_hr",
    "away_starter_game_score"
  ];
  const escapeStr = (val) => {
    if (val === void 0 || val === null || val === "") return "";
    return `"${String(val).replace(/"/g, '""')}"`;
  };
  const rows = games.map((g) => {
    const gameId2 = String(g.id);
    const pitPIT = pitLookups.pitchers?.[gameId2];
    const offPIT = pitLookups.offense?.[gameId2];
    const bsPIT = pitLookups.boxscore?.[gameId2];
    const hPit = pitPIT?.home ?? null;
    const aPit = pitPIT?.away ?? null;
    const hOff2 = offPIT?.home ?? null;
    const aOff2 = offPIT?.away ?? null;
    const hBs = bsPIT?.home ?? g.boxscore_stats?.home ?? null;
    const aBs = bsPIT?.away ?? g.boxscore_stats?.away ?? null;
    const canUseActualKs = isFinalGameStatus(g.game_result?.gameStatus);
    const hActualKs = hBs?.strikeOuts ?? (canUseActualKs ? g.advanced_pitching?.home?.actualStrikeouts ?? "" : "");
    const aActualKs = aBs?.strikeOuts ?? (canUseActualKs ? g.advanced_pitching?.away?.actualStrikeouts ?? "" : "");
    const hSplitRhp = g.offensive_splits?.home?.vsRhp;
    const hSplitLhp = g.offensive_splits?.home?.vsLhp;
    const aSplitRhp = g.offensive_splits?.away?.vsRhp;
    const aSplitLhp = g.offensive_splits?.away?.vsLhp;
    const fPitchers = g.fatigue_metrics?.pitchers;
    const fBullpen = g.fatigue_metrics?.bullpen;
    const hL3Bf = calcLast3Stats(g.advanced_pitching?.home?.last3Bf1, g.advanced_pitching?.home?.last3Bf2, g.advanced_pitching?.home?.last3Bf3);
    const hL3Ip = calcLast3Stats(g.advanced_pitching?.home?.last3Ip1, g.advanced_pitching?.home?.last3Ip2, g.advanced_pitching?.home?.last3Ip3);
    const hL3K = calcLast3Stats(g.advanced_pitching?.home?.last3Ks1, g.advanced_pitching?.home?.last3Ks2, g.advanced_pitching?.home?.last3Ks3);
    const aL3Bf = calcLast3Stats(g.advanced_pitching?.away?.last3Bf1, g.advanced_pitching?.away?.last3Bf2, g.advanced_pitching?.away?.last3Bf3);
    const aL3Ip = calcLast3Stats(g.advanced_pitching?.away?.last3Ip1, g.advanced_pitching?.away?.last3Ip2, g.advanced_pitching?.away?.last3Ip3);
    const aL3K = calcLast3Stats(g.advanced_pitching?.away?.last3Ks1, g.advanced_pitching?.away?.last3Ks2, g.advanced_pitching?.away?.last3Ks3);
    const homePitcherMetrics = getPitcherDerivedMetrics(g, "home");
    const awayPitcherMetrics = getPitcherDerivedMetrics(g, "away");
    const getLineupMetrics = (side) => {
      let contactScore = g.advanced_offense?.[side]?.lineup_contact_stress_score;
      let pitchRisk = g.advanced_offense?.[side]?.lineup_pitch_count_risk_score;
      let hardhit = g.advanced_offense?.[side]?.lineup_high_hardhit_batters_count;
      if (contactScore === void 0 || contactScore === "") {
        const batters = g.lineups?.[side];
        if (batters && Array.isArray(batters) && batters.length > 0) {
          let lineupContactStress = 0;
          let lineupPitchRisk = 0;
          let highHardhitCount = 0;
          for (const batter of batters) {
            const contactFactor = batter.contact_pct_vs_rhp || 0.8;
            const kFactor = batter.kPct || batter.strikeout_pct || 0.2;
            const batterStress = contactFactor * 100 - kFactor * 100;
            lineupContactStress += Math.max(0, batterStress);
            if ((batter.hardHitPct || 0) > 0.4) highHardhitCount++;
            const bbPct = batter.walk_pct || 0.08;
            lineupPitchRisk += bbPct * 100;
          }
          contactScore = lineupContactStress / batters.length;
          pitchRisk = lineupPitchRisk / batters.length;
          hardhit = highHardhitCount;
        }
      }
      return { contactScore: contactScore ?? "", pitchRisk: pitchRisk ?? "", hardhit: hardhit ?? "" };
    };
    const homeLineupMetrics = getLineupMetrics("home");
    const awayLineupMetrics = getLineupMetrics("away");
    return [
      // ... (Keep metadata and pitchers logic exactly same)
      escapeStr(g.id),
      escapeStr(g.metadata.date),
      escapeStr(g.metadata.time),
      escapeStr(g.metadata.homeTeam),
      escapeStr(g.metadata.awayTeam),
      escapeStr(g.metadata.venue),
      // Pitchers standard — SOLO point-in-time verificado (backfill PIT). Sin cobertura
      // PIT, la celda queda vacía en vez de usar el valor crudo (ver auditoría del
      // pipeline, bug de stats de temporada congeladas/con fuga de fechas futuras).
      // home/away_pitcher_stats_source documenta por qué: "pit" = confiable, vacío = sin cobertura PIT todavía.
      escapeStr(g.pitchers.home.name),
      ...pitcherPitStatsBlockValues(hPit),
      escapeStr(g.pitchers.away.name),
      ...pitcherPitStatsBlockValues(aPit),
      // Bullpen standard
      g.bullpen.home.era ?? "",
      escapeStr(g.bullpen.home.usageLast3Days),
      g.bullpen.home.ipLast7Days ?? fBullpen?.home?.ipLast7Days ?? "",
      g.bullpen.away.era ?? "",
      escapeStr(g.bullpen.away.usageLast3Days),
      g.bullpen.away.ipLast7Days ?? fBullpen?.away?.ipLast7Days ?? "",
      // Offense standard
      g.offense.away.runsPerGame ?? "",
      g.offense.away.ops ?? "",
      g.offense.away.obp ?? "",
      g.offense.away.slg ?? "",
      getLineupAverageKPct(g.lineups?.away),
      // Weather
      g.weather?.temp ?? "",
      g.weather?.humidity ?? "",
      g.weather?.windSpeed ?? "",
      g.weather?.windDirection ?? "",
      g.weather?.pressure ?? "",
      g.weather?.rainProbability ?? "",
      escapeStr(g.weather?.skyStatus),
      g.weather?.apparentTemp ?? "",
      // Home splits vs Rhp
      hSplitRhp?.avg ?? "",
      hSplitRhp?.ops ?? "",
      hSplitRhp?.obp ?? "",
      hSplitRhp?.slg ?? "",
      hSplitRhp?.runsPerGame ?? "",
      hSplitRhp?.hr ?? "",
      // Home splits vs Lhp
      hSplitLhp?.avg ?? "",
      hSplitLhp?.ops ?? "",
      hSplitLhp?.obp ?? "",
      hSplitLhp?.slg ?? "",
      hSplitLhp?.runsPerGame ?? "",
      hSplitLhp?.hr ?? "",
      // Away splits vs Rhp
      aSplitRhp?.avg ?? "",
      aSplitRhp?.ops ?? "",
      aSplitRhp?.obp ?? "",
      aSplitRhp?.slg ?? "",
      aSplitRhp?.runsPerGame ?? "",
      aSplitRhp?.hr ?? "",
      // Away splits vs Lhp
      aSplitLhp?.avg ?? "",
      aSplitLhp?.ops ?? "",
      aSplitLhp?.obp ?? "",
      aSplitLhp?.slg ?? "",
      aSplitLhp?.runsPerGame ?? "",
      aSplitLhp?.hr ?? "",
      // Fatigue
      fPitchers?.home?.daysSinceLastStart ?? "",
      fPitchers?.home?.pitchesLastStart ?? "",
      fPitchers?.home?.pitchesLast3Starts ?? "",
      fPitchers?.away?.daysSinceLastStart ?? "",
      fPitchers?.away?.pitchesLastStart ?? "",
      fPitchers?.away?.pitchesLast3Starts ?? "",
      fBullpen?.home?.ipLast3Days ?? "",
      fBullpen?.home?.ipLast7Days ?? "",
      fBullpen?.home?.relieversUsedYesterday ?? "",
      fBullpen?.home?.relieversUsedLast2Days ?? "",
      fBullpen?.home?.availableCount ?? "",
      fBullpen?.away?.ipLast3Days ?? "",
      fBullpen?.away?.ipLast7Days ?? "",
      fBullpen?.away?.relieversUsedYesterday ?? "",
      fBullpen?.away?.relieversUsedLast2Days ?? "",
      fBullpen?.away?.availableCount ?? "",
      // Advanced Pitching
      g.advanced_pitching?.home?.xEra ?? "",
      g.advanced_pitching?.home?.fip ?? "",
      g.advanced_pitching?.home?.xFip ?? "",
      g.advanced_pitching?.home?.siera ?? "",
      g.advanced_pitching?.home?.hardHitPct ?? "",
      g.advanced_pitching?.home?.barrelPct ?? "",
      g.advanced_pitching?.home?.groundBallPct ?? "",
      g.advanced_pitching?.home?.flyBallPct ?? "",
      g.advanced_pitching?.home?.strikeoutRate ?? "",
      g.advanced_pitching?.home?.walkRate ?? "",
      g.advanced_pitching?.home?.swingingStrikePct ?? "",
      g.advanced_pitching?.home?.cswPct ?? "",
      hActualKs,
      // home_pitcher_actual_ks — from boxscore (real K) or advanced_pitching fallback
      g.advanced_pitching?.home?.last5KsAvg ?? "",
      g.advanced_pitching?.home?.last5KsStd ?? "",
      g.advanced_pitching?.home?.last5IpAvg ?? "",
      g.advanced_pitching?.home?.last5BfAvg ?? "",
      g.advanced_pitching?.home?.last5PitchCountAvg ?? "",
      g.advanced_pitching?.home?.last3Ks1 ?? "",
      g.advanced_pitching?.home?.last3Ks2 ?? "",
      g.advanced_pitching?.home?.last3Ks3 ?? "",
      g.advanced_pitching?.home?.last3Ip1 ?? "",
      g.advanced_pitching?.home?.last3Ip2 ?? "",
      g.advanced_pitching?.home?.last3Ip3 ?? "",
      g.advanced_pitching?.home?.last3Bf1 ?? "",
      g.advanced_pitching?.home?.last3Bf2 ?? "",
      g.advanced_pitching?.home?.last3Bf3 ?? "",
      g.advanced_pitching?.home?.careerKPctVsTeam ?? g.advanced_pitching?.homeVsOpp?.careerKPctVsTeam ?? g.advanced_pitching?.homeVsOpp?.strikeoutRate ?? "",
      g.advanced_pitching?.home?.last3VsTeamKsAvg ?? "",
      g.advanced_pitching?.home?.last3VsTeamBfAvg ?? "",
      g.advanced_pitching?.home?.last3VsTeamBfAvg ?? "",
      g.advanced_pitching?.home?.projectedPitchCount ?? "",
      g.advanced_pitching?.home?.projectedInnings ?? "",
      g.advanced_pitching?.home?.projectedStrikeoutsBase ?? "",
      g.advanced_pitching?.home?.battersFacedPerStart ?? "",
      g.advanced_pitching?.home?.fastballPct ?? "",
      g.advanced_pitching?.home?.sliderPct ?? "",
      g.advanced_pitching?.home?.curvePct ?? "",
      g.advanced_pitching?.home?.changeupPct ?? "",
      g.advanced_pitching?.home?.splitterPct ?? "",
      escapeStr(g.advanced_pitching?.home?.catcherName),
      g.advanced_pitching?.home?.catcherFramingRuns ?? "",
      hL3Bf.avg,
      hL3Ip.avg,
      hL3K.avg,
      hL3Bf.min,
      hL3Ip.min,
      hL3Bf.under15,
      hL3Bf.under18,
      g.advanced_pitching?.away?.xEra ?? "",
      g.advanced_pitching?.away?.fip ?? "",
      g.advanced_pitching?.away?.xFip ?? "",
      g.advanced_pitching?.away?.siera ?? "",
      g.advanced_pitching?.away?.hardHitPct ?? "",
      g.advanced_pitching?.away?.barrelPct ?? "",
      g.advanced_pitching?.away?.groundBallPct ?? "",
      g.advanced_pitching?.away?.flyBallPct ?? "",
      g.advanced_pitching?.away?.strikeoutRate ?? "",
      g.advanced_pitching?.away?.walkRate ?? "",
      g.advanced_pitching?.away?.swingingStrikePct ?? "",
      g.advanced_pitching?.away?.cswPct ?? "",
      aActualKs,
      // away_pitcher_actual_ks — from boxscore (real K) or advanced_pitching fallback
      g.advanced_pitching?.away?.last5KsAvg ?? "",
      g.advanced_pitching?.away?.last5KsStd ?? "",
      g.advanced_pitching?.away?.last5IpAvg ?? "",
      g.advanced_pitching?.away?.last5BfAvg ?? "",
      g.advanced_pitching?.away?.last5PitchCountAvg ?? "",
      g.advanced_pitching?.away?.last3Ks1 ?? "",
      g.advanced_pitching?.away?.last3Ks2 ?? "",
      g.advanced_pitching?.away?.last3Ks3 ?? "",
      g.advanced_pitching?.away?.last3Ip1 ?? "",
      g.advanced_pitching?.away?.last3Ip2 ?? "",
      g.advanced_pitching?.away?.last3Ip3 ?? "",
      g.advanced_pitching?.away?.last3Bf1 ?? "",
      g.advanced_pitching?.away?.last3Bf2 ?? "",
      g.advanced_pitching?.away?.last3Bf3 ?? "",
      g.advanced_pitching?.away?.careerKPctVsTeam ?? g.advanced_pitching?.awayVsOpp?.careerKPctVsTeam ?? g.advanced_pitching?.awayVsOpp?.strikeoutRate ?? "",
      g.advanced_pitching?.away?.last3VsTeamKsAvg ?? "",
      g.advanced_pitching?.away?.last3VsTeamBfAvg ?? "",
      g.advanced_pitching?.away?.last3VsTeamBfAvg ?? "",
      g.advanced_pitching?.away?.projectedPitchCount ?? "",
      g.advanced_pitching?.away?.projectedInnings ?? "",
      g.advanced_pitching?.away?.projectedStrikeoutsBase ?? "",
      g.advanced_pitching?.away?.battersFacedPerStart ?? "",
      g.advanced_pitching?.away?.fastballPct ?? "",
      g.advanced_pitching?.away?.sliderPct ?? "",
      g.advanced_pitching?.away?.curvePct ?? "",
      g.advanced_pitching?.away?.changeupPct ?? "",
      g.advanced_pitching?.away?.splitterPct ?? "",
      escapeStr(g.advanced_pitching?.away?.catcherName),
      g.advanced_pitching?.away?.catcherFramingRuns ?? "",
      aL3Bf.avg,
      aL3Ip.avg,
      aL3K.avg,
      aL3Bf.min,
      aL3Ip.min,
      aL3Bf.under15,
      aL3Bf.under18,
      // Advanced Offense — PIT-corrected where available, fallback to document
      g.advanced_offense?.home?.wOba ?? "",
      g.advanced_offense?.home?.xwOba ?? "",
      hOff2?.iso ?? g.advanced_offense?.home?.iso ?? "",
      g.advanced_offense?.home?.babip ?? "",
      g.advanced_offense?.home?.hardHitPct ?? "",
      g.advanced_offense?.home?.barrelPct ?? "",
      g.advanced_offense?.home?.contactPct ?? "",
      hOff2?.kPct ?? g.advanced_offense?.home?.kPctVsPitchHand ?? "",
      g.advanced_offense?.home?.projectedLineupKPct ?? "",
      g.advanced_offense?.home?.projectedLineupContactPctVsHand ?? "",
      g.advanced_offense?.home?.projectedLineupWhiffPctVsHand ?? "",
      g.advanced_offense?.home?.whiffPctVsFastball ?? "",
      g.advanced_offense?.home?.whiffPctVsSlider ?? "",
      g.advanced_offense?.home?.whiffPctVsCurve ?? "",
      g.advanced_offense?.home?.whiffPctVsChangeup ?? "",
      g.advanced_offense?.home?.whiffPctVsSplitter ?? "",
      g.advanced_offense?.away?.wOba ?? "",
      g.advanced_offense?.away?.xwOba ?? "",
      aOff2?.iso ?? g.advanced_offense?.away?.iso ?? "",
      g.advanced_offense?.away?.babip ?? "",
      g.advanced_offense?.away?.hardHitPct ?? "",
      g.advanced_offense?.away?.barrelPct ?? "",
      g.advanced_offense?.away?.contactPct ?? "",
      aOff2?.kPct ?? g.advanced_offense?.away?.kPctVsPitchHand ?? "",
      g.advanced_offense?.away?.projectedLineupKPct ?? "",
      g.advanced_offense?.away?.projectedLineupContactPctVsHand ?? "",
      g.advanced_offense?.away?.projectedLineupWhiffPctVsHand ?? "",
      g.advanced_offense?.away?.whiffPctVsFastball ?? "",
      g.advanced_offense?.away?.whiffPctVsSlider ?? "",
      g.advanced_offense?.away?.whiffPctVsCurve ?? "",
      g.advanced_offense?.away?.whiffPctVsChangeup ?? "",
      g.advanced_offense?.away?.whiffPctVsSplitter ?? "",
      // Model Features
      g.model_features?.diffEra ?? "",
      g.model_features?.diffXera ?? "",
      g.model_features?.diffFip ?? "",
      g.model_features?.diffOps ?? "",
      g.model_features?.diffXwoba ?? "",
      g.model_features?.diffBullpenEra ?? "",
      g.model_features?.diffRunsPerGame ?? "",
      g.model_features?.diffRecordLast10 ?? "",
      g.model_features?.diffRecordHomeAway ?? "",
      g.model_features?.diffStarterRest ?? "",
      g.model_features?.diffBullpenFatigue ?? "",
      // Metadata de confiabilidad point-in-time — ver comentario del header savant_metrics_asof_date
      savantCache.getSnapshotDate() ?? "",
      // Results
      g.game_result?.homeScore ?? "",
      g.game_result?.awayScore ?? "",
      escapeStr(g.game_result?.winner),
      escapeStr(g.game_result?.gameStatus ?? "Scheduled"),
      // VORTEX V10.3 METRICS
      g.lineups?.lineup_confirmed ? 1 : 0,
      escapeStr(g.lineups?.lineup_source),
      escapeStr(g.lineups?.lineup_updated_at),
      homePitcherMetrics.primary_pitch,
      homePitcherMetrics.primary_usage,
      homePitcherMetrics.secondary_pitch,
      homePitcherMetrics.secondary_usage,
      homePitcherMetrics.pitches_per_bf,
      homePitcherMetrics.pitches_per_bf_last5,
      homePitcherMetrics.pitches_per_ip_last5,
      awayPitcherMetrics.primary_pitch,
      awayPitcherMetrics.primary_usage,
      awayPitcherMetrics.secondary_pitch,
      awayPitcherMetrics.secondary_usage,
      awayPitcherMetrics.pitches_per_bf,
      awayPitcherMetrics.pitches_per_bf_last5,
      awayPitcherMetrics.pitches_per_ip_last5,
      g.pitchers?.home_starter?.pitcher_avg_pitches_last3 ?? g.pitchers?.home?.pitcher_avg_pitches_last3 ?? "",
      escapeStr(homePitcherMetrics.rest_status),
      g.pitchers?.away_starter?.pitcher_avg_pitches_last3 ?? g.pitchers?.away?.pitcher_avg_pitches_last3 ?? "",
      escapeStr(awayPitcherMetrics.rest_status),
      escapeStr(g.pitchers?.home_starter?.pitchHand ?? g.pitchers?.home?.pitchHand),
      escapeStr(g.pitchers?.away_starter?.pitchHand ?? g.pitchers?.away?.pitchHand),
      g.bullpen?.home?.ipLast3Days ?? fBullpen?.home?.ipLast3Days ?? "",
      g.bullpen?.home?.ipLast7Days ?? fBullpen?.home?.ipLast7Days ?? "",
      g.bullpen?.away?.ipLast3Days ?? fBullpen?.away?.ipLast3Days ?? "",
      g.bullpen?.away?.ipLast7Days ?? fBullpen?.away?.ipLast7Days ?? "",
      g.bullpen?.home?.relieversUsedYesterday ?? fBullpen?.home?.relieversUsedYesterday ?? "",
      homeLineupMetrics.contactScore,
      homeLineupMetrics.pitchRisk,
      homeLineupMetrics.hardhit,
      awayLineupMetrics.contactScore,
      awayLineupMetrics.pitchRisk,
      awayLineupMetrics.hardhit,
      g.pitchers?.home_starter?.pitcher_recent_velocity ?? g.pitchers?.home?.pitcher_recent_velocity ?? "",
      g.pitchers?.away_starter?.pitcher_recent_velocity ?? g.pitchers?.away?.pitcher_recent_velocity ?? "",
      // New Advanced Metrics & Park Factors
      g.advanced_pitching?.home?.pitcher_spin_rate ?? "",
      g.advanced_pitching?.away?.pitcher_spin_rate ?? "",
      g.advanced_pitching?.home?.pitcher_stuff_plus ?? "",
      g.advanced_pitching?.away?.pitcher_stuff_plus ?? "",
      g.advanced_pitching?.home?.pitcher_o_swing_pct ?? "",
      g.advanced_pitching?.away?.pitcher_o_swing_pct ?? "",
      g.advanced_pitching?.home?.pitcher_k_pct_vs_lhb ?? "",
      g.advanced_pitching?.away?.pitcher_k_pct_vs_lhb ?? "",
      g.advanced_pitching?.home?.pitcher_k_pct_vs_rhb ?? "",
      g.advanced_pitching?.away?.pitcher_k_pct_vs_rhb ?? "",
      g.park_factors?.index_so ?? 100,
      g.park_factors?.index_runs ?? 100,
      g.park_factors?.index_hr ?? 100,
      // ── Boxscore: real starter game stats (null for non-final games) ──
      hBs?.inningsPitched ?? "",
      hBs?.battersFaced ?? "",
      hBs?.hitsAllowed ?? "",
      hBs?.earnedRuns ?? "",
      hBs?.strikeOuts ?? "",
      // home_starter_game_k (= home_pitcher_actual_ks source)
      hBs?.baseOnBalls ?? "",
      hBs?.numberOfPitches ?? "",
      hBs?.homeRunsAllowed ?? "",
      hBs?.gameScore ?? "",
      aBs?.inningsPitched ?? "",
      aBs?.battersFaced ?? "",
      aBs?.hitsAllowed ?? "",
      aBs?.earnedRuns ?? "",
      aBs?.strikeOuts ?? "",
      // away_starter_game_k (= away_pitcher_actual_ks source)
      aBs?.baseOnBalls ?? "",
      aBs?.numberOfPitches ?? "",
      aBs?.homeRunsAllowed ?? "",
      aBs?.gameScore ?? ""
    ];
  });
  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}
function generateSingleGameCSV(game) {
  return generateBattersCSV([game]);
}
function generateDailyPlayerResultsCSV(games) {
  const headers = [
    "game_id",
    "date",
    "game_time",
    "away_team",
    "home_team",
    "team",
    "opponent",
    "home_away",
    "pitcher",
    "position",
    "bb",
    "h",
    "r",
    "er",
    "ip",
    "actual_ks",
    "actual_bf",
    "pitches",
    "game_status",
    "away_score",
    "home_score"
  ];
  const rows = [];
  const parsePitchingOuts = (ip) => {
    if (ip === void 0 || ip === null || ip === "") return null;
    const [wholeRaw, outsRaw = "0"] = String(ip).split(".");
    const whole = Number.parseInt(wholeRaw, 10);
    const outs = Number.parseInt(outsRaw, 10);
    if (!Number.isFinite(whole) || !Number.isFinite(outs) || outs < 0 || outs > 2) return null;
    return whole * 3 + outs;
  };
  const getActualBf = (player) => {
    const exact = player.bf ?? player.battersFaced;
    if (exact !== void 0 && exact !== null && exact !== "") return exact;
    const outs = parsePitchingOuts(player.ip);
    if (outs === null) return "";
    return outs + (Number(player.h) || 0) + (Number(player.bb) || 0);
  };
  const hasPitchingActivity = (player) => {
    const actualBf = Number(getActualBf(player)) || 0;
    const outs = parsePitchingOuts(player.ip) || 0;
    return [
      actualBf,
      outs,
      Number(player.pitches) || 0,
      Number(player.h) || 0,
      Number(player.bb) || 0,
      Number(player.k) || 0,
      Number(player.r) || 0,
      Number(player.er) || 0
    ].some((value) => value > 0);
  };
  const pushPitcherRows = (game, players, team, homeAway) => {
    const opponent = homeAway === "home" ? game.metadata.awayTeam : game.metadata.homeTeam;
    for (const player of players || []) {
      if (!hasPitchingActivity(player)) continue;
      rows.push([
        game.id,
        game.metadata.date,
        game.metadata.time,
        game.metadata.awayTeam,
        game.metadata.homeTeam,
        team,
        opponent,
        homeAway,
        player.name,
        player.position,
        player.bb ?? "",
        player.h ?? "",
        player.r ?? "",
        player.er ?? "",
        player.ip ?? "",
        player.k ?? "",
        getActualBf(player),
        player.pitches ?? "",
        game.game_result?.gameStatus ?? "",
        game.game_result?.awayScore ?? "",
        game.game_result?.homeScore ?? ""
      ]);
    }
  };
  for (const game of games) {
    pushPitcherRows(game, game.liveBoxscore?.away?.pitchers, game.metadata.awayTeam, "away");
    pushPitcherRows(game, game.liveBoxscore?.home?.pitchers, game.metadata.homeTeam, "home");
  }
  return [
    headers.join(","),
    ...rows.map((row) => row.map(escapeCsvValue).join(","))
  ].join("\n");
}
function generateBattersCSV(games, pitLookups = { pitchers: {} }) {
  if (!games || games.length === 0) return "";
  games.forEach((g) => enrichWithVortexMetrics(g));
  const headers = [
    // --- Batter Info & Stats (36 columns) ---
    "game_id",
    "date",
    "player_name",
    "team",
    "batting_order",
    "bat_side",
    "position",
    "avg",
    "obp",
    "slg",
    "ops",
    "woba",
    "iso",
    "pa",
    "hits",
    "doubles",
    "triples",
    "home_runs",
    "strikeout_pct",
    "walk_pct",
    "last7_avg",
    "last7_ops",
    "last7_slg",
    "last7_total_bases",
    "last7_hits",
    "last7_xbh",
    "ops_vs_rhp",
    "ops_vs_lhp",
    "slg_vs_rhp",
    "slg_vs_lhp",
    "k_pct_vs_rhp",
    "k_pct_vs_lhp",
    "contact_pct_vs_rhp",
    "contact_pct_vs_lhp",
    "whiff_pct",
    "chase_pct",
    "opposing_pitcher",
    "opposing_pitcher_hand",
    "pitcher_allowed_avg_vs_lhb",
    "pitcher_allowed_avg_vs_rhb",
    "pitcher_allowed_slg_vs_lhb",
    "pitcher_allowed_slg_vs_rhb",
    // --- Game Context & Team Stats (72 columns) ---
    "hora",
    "equipo_home",
    "equipo_visitante",
    "estadio",
    // Pitchers standard
    "home_pitcher",
    "home_pitcher_era",
    "home_pitcher_whip",
    "home_pitcher_kPct",
    "home_pitcher_bbPct",
    "home_pitcher_wins",
    "home_pitcher_losses",
    "home_pitcher_ip",
    "home_pitcher_strikeouts",
    "home_pitcher_gs",
    "home_pitcher_ip_avg_start",
    "home_pitcher_stats_source",
    "home_pitcher_strikeout_prop",
    "home_pitcher_strikeout_prop_over_odds",
    "home_pitcher_strikeout_prop_under_odds",
    "home_pitcher_strikeout_prop_source",
    "home_pitcher_strikeout_prop_capture_status",
    "away_pitcher",
    "away_pitcher_era",
    "away_pitcher_whip",
    "away_pitcher_kPct",
    "away_pitcher_bbPct",
    "away_pitcher_wins",
    "away_pitcher_losses",
    "away_pitcher_ip",
    "away_pitcher_strikeouts",
    "away_pitcher_gs",
    "away_pitcher_ip_avg_start",
    "away_pitcher_stats_source",
    "away_pitcher_strikeout_prop",
    "away_pitcher_strikeout_prop_over_odds",
    "away_pitcher_strikeout_prop_under_odds",
    "away_pitcher_strikeout_prop_source",
    "away_pitcher_strikeout_prop_capture_status",
    // Bullpen standard
    "bullpen_era_home",
    "bullpen_usage_home",
    "bullpen_ip_7d_home",
    "bullpen_era_away",
    "bullpen_usage_away",
    "bullpen_ip_7d_away",
    // Offense standard
    "ofensa_run_g_home",
    "ofensa_ops_home",
    "ofensa_obp_home",
    "ofensa_slg_home",
    "home_offense_kPct",
    "ofensa_run_g_away",
    "ofensa_ops_away",
    "ofensa_obp_away",
    "ofensa_slg_away",
    "away_offense_kPct",
    // Weather
    "weather_temp",
    "weather_humidity",
    "weather_wind_speed",
    "weather_wind_dir",
    "weather_pressure",
    "weather_rain_prob",
    "weather_sky",
    "weather_apparent_temp",
    // Home splits
    "home_splits_vs_rhp_avg",
    "home_splits_vs_rhp_ops",
    "home_splits_vs_rhp_obp",
    "home_splits_vs_rhp_slg",
    "home_splits_vs_rhp_rpg",
    "home_splits_vs_rhp_hr",
    "home_splits_vs_lhp_avg",
    "home_splits_vs_lhp_ops",
    "home_splits_vs_lhp_obp",
    "home_splits_vs_lhp_slg",
    "home_splits_vs_lhp_rpg",
    "home_splits_vs_lhp_hr",
    // Away splits
    "away_splits_vs_rhp_avg",
    "away_splits_vs_rhp_ops",
    "away_splits_vs_rhp_obp",
    "away_splits_vs_rhp_slg",
    "away_splits_vs_rhp_rpg",
    "away_splits_vs_rhp_hr",
    "away_splits_vs_lhp_avg",
    "away_splits_vs_lhp_ops",
    "away_splits_vs_lhp_obp",
    "away_splits_vs_lhp_slg",
    "away_splits_vs_lhp_rpg",
    "away_splits_vs_lhp_hr",
    // Fatigue
    "home_pitcher_rest",
    "home_pitcher_pitches_last",
    "home_pitcher_pitches_last_3",
    "away_pitcher_rest",
    "away_pitcher_pitches_last",
    "away_pitcher_pitches_last_3",
    "home_bullpen_ip_3d",
    "home_bullpen_ip_7d_recent",
    "home_bullpen_relievers_yesterday",
    "home_bullpen_relievers_2d",
    "home_bullpen_available",
    "away_bullpen_ip_3d",
    "away_bullpen_ip_7d_recent",
    "away_bullpen_relievers_yesterday",
    "away_bullpen_relievers_2d",
    "away_bullpen_available",
    // Advanced Pitching
    "home_pitcher_xera",
    "home_pitcher_fip",
    "home_pitcher_xfip",
    "home_pitcher_siera",
    "home_pitcher_hardhit_pct",
    "home_pitcher_barrel_pct",
    "home_pitcher_gb_pct",
    "home_pitcher_fb_pct",
    "home_pitcher_so_rate",
    "home_pitcher_bb_rate",
    "home_pitcher_swstr_pct",
    "home_pitcher_csw_pct",
    "home_pitcher_actual_ks",
    "home_pitcher_last5_ks_avg",
    "home_pitcher_last5_ks_std",
    "home_pitcher_last5_ip_avg",
    "home_pitcher_last5_bf_avg",
    "home_pitcher_last5_pitch_count_avg",
    "home_pitcher_last3_ks_1",
    "home_pitcher_last3_ks_2",
    "home_pitcher_last3_ks_3",
    "home_pitcher_last3_ip_1",
    "home_pitcher_last3_ip_2",
    "home_pitcher_last3_ip_3",
    "home_pitcher_last3_bf_1",
    "home_pitcher_last3_bf_2",
    "home_pitcher_last3_bf_3",
    "home_pitcher_career_k_pct_vs_team",
    "home_pitcher_last3_vs_team_ks_avg",
    "home_pitcher_last3_vs_team_bf_avg",
    "home_pitcher_bvp_pa_vs_team",
    "home_pitcher_projected_pitches",
    "home_pitcher_projected_innings",
    "home_pitcher_projected_strikeouts",
    "home_pitcher_bf_per_start",
    "home_pitcher_fastball_pct",
    "home_pitcher_slider_pct",
    "home_pitcher_curve_pct",
    "home_pitcher_changeup_pct",
    "home_pitcher_splitter_pct",
    "home_catcher_name",
    "home_catcher_framing_runs",
    "home_pitcher_last3_bf_avg",
    "home_pitcher_last3_ip_avg",
    "home_pitcher_last3_ks_avg",
    "home_pitcher_last3_min_bf",
    "home_pitcher_last3_min_ip",
    "home_pitcher_last3_bf_under_15_count",
    "home_pitcher_last3_bf_under_18_count",
    "away_pitcher_xera",
    "away_pitcher_fip",
    "away_pitcher_xfip",
    "away_pitcher_siera",
    "away_pitcher_hardhit_pct",
    "away_pitcher_barrel_pct",
    "away_pitcher_gb_pct",
    "away_pitcher_fb_pct",
    "away_pitcher_so_rate",
    "away_pitcher_bb_rate",
    "away_pitcher_swstr_pct",
    "away_pitcher_csw_pct",
    "away_pitcher_actual_ks",
    "away_pitcher_last5_ks_avg",
    "away_pitcher_last5_ks_std",
    "away_pitcher_last5_ip_avg",
    "away_pitcher_last5_bf_avg",
    "away_pitcher_last5_pitch_count_avg",
    "away_pitcher_last3_ks_1",
    "away_pitcher_last3_ks_2",
    "away_pitcher_last3_ks_3",
    "away_pitcher_last3_ip_1",
    "away_pitcher_last3_ip_2",
    "away_pitcher_last3_ip_3",
    "away_pitcher_last3_bf_1",
    "away_pitcher_last3_bf_2",
    "away_pitcher_last3_bf_3",
    "away_pitcher_career_k_pct_vs_team",
    "away_pitcher_last3_vs_team_ks_avg",
    "away_pitcher_last3_vs_team_bf_avg",
    "away_pitcher_bvp_pa_vs_team",
    "away_pitcher_projected_pitches",
    "away_pitcher_projected_innings",
    "away_pitcher_projected_strikeouts",
    "away_pitcher_bf_per_start",
    "away_pitcher_fastball_pct",
    "away_pitcher_slider_pct",
    "away_pitcher_curve_pct",
    "away_pitcher_changeup_pct",
    "away_pitcher_splitter_pct",
    "away_catcher_name",
    "away_catcher_framing_runs",
    "away_pitcher_last3_bf_avg",
    "away_pitcher_last3_ip_avg",
    "away_pitcher_last3_ks_avg",
    "away_pitcher_last3_min_bf",
    "away_pitcher_last3_min_ip",
    "away_pitcher_last3_bf_under_15_count",
    "away_pitcher_last3_bf_under_18_count",
    // Advanced Offense
    "home_offense_woba",
    "home_offense_xwoba",
    "home_offense_iso",
    "home_offense_babip",
    "home_offense_hardhit_pct",
    "home_offense_barrel_pct",
    "home_offense_contact_pct",
    "home_offense_k_pct_vs_pitch_hand",
    "home_projected_lineup_k_pct_vs_hand",
    "home_projected_lineup_contact_pct_vs_hand",
    "home_projected_lineup_whiff_pct_vs_hand",
    "home_offense_whiff_pct_vs_fastball",
    "home_offense_whiff_pct_vs_slider",
    "home_offense_whiff_pct_vs_curve",
    "home_offense_whiff_pct_vs_changeup",
    "home_offense_whiff_pct_vs_splitter",
    "away_offense_woba",
    "away_offense_xwoba",
    "away_offense_iso",
    "away_offense_babip",
    "away_offense_hardhit_pct",
    "away_offense_barrel_pct",
    "away_offense_contact_pct",
    "away_offense_k_pct_vs_pitch_hand",
    "away_projected_lineup_k_pct_vs_hand",
    "away_projected_lineup_contact_pct_vs_hand",
    "away_projected_lineup_whiff_pct_vs_hand",
    "away_offense_whiff_pct_vs_fastball",
    "away_offense_whiff_pct_vs_slider",
    "away_offense_whiff_pct_vs_curve",
    "away_offense_whiff_pct_vs_changeup",
    "away_offense_whiff_pct_vs_splitter",
    // Model Features
    "diff_era",
    "diff_xera",
    "diff_fip",
    "diff_ops",
    "diff_xwoba",
    "diff_bullpen_era",
    "diff_runs_per_game",
    "diff_record_last10",
    "diff_record_home_away",
    "diff_starter_rest",
    "diff_bullpen_fatigue",
    "line_source",
    // Metadata de confiabilidad point-in-time (ver auditoría del pipeline, sección 3):
    // fecha en que se descargó el snapshot de Baseball Savant usado para las columnas
    // xera/xwoba/hardhit_pct/barrel_pct/swstr_pct/csw_pct/arsenal%/framing de esta fila.
    // Ese snapshot es "temporada completa hasta hoy", no recortado a la fecha del juego:
    // si "date" de la fila es anterior a savant_metrics_asof_date, esas columnas pueden
    // incluir información posterior al juego y no deben tratarse como point-in-time.
    "savant_metrics_asof_date",
    // Game Results / ML Target Labels
    "resultado_carreras_home",
    "resultado_carreras_visitante",
    "resultado_ganador",
    "resultado_estado",
    // VORTEX V10.3 METRICS (47 Variables)
    "lineup_confirmed",
    "lineup_source",
    "lineup_updated_at",
    "home_pitcher_primary_pitch",
    "home_pitcher_primary_pitch_usage_pct",
    "home_pitcher_secondary_pitch",
    "home_pitcher_secondary_pitch_usage_pct",
    "home_pitcher_pitches_per_bf",
    "home_pitcher_pitches_per_bf_last5",
    "home_pitcher_pitches_per_ip_last5",
    "away_pitcher_primary_pitch",
    "away_pitcher_primary_pitch_usage_pct",
    "away_pitcher_secondary_pitch",
    "away_pitcher_secondary_pitch_usage_pct",
    "away_pitcher_pitches_per_bf",
    "away_pitcher_pitches_per_bf_last5",
    "away_pitcher_pitches_per_ip_last5",
    "home_pitcher_avg_pitches_last3",
    "home_pitcher_rest_status",
    "away_pitcher_avg_pitches_last3",
    "away_pitcher_rest_status",
    "home_pitcher_pitchHand",
    "away_pitcher_pitchHand",
    "bullpen_home_ipLast3Days",
    "bullpen_home_ipLast7Days",
    "bullpen_away_ipLast3Days",
    "bullpen_away_ipLast7Days",
    "bullpen_home_relieversUsedYesterday",
    "home_lineup_contact_stress_score",
    "home_lineup_pitch_count_risk_score",
    "home_lineup_high_hardhit_batters_count",
    "away_lineup_contact_stress_score",
    "away_lineup_pitch_count_risk_score",
    "away_lineup_high_hardhit_batters_count",
    "home_pitcher_recent_velocity",
    "away_pitcher_recent_velocity",
    // New Advanced Metrics & Park Factors
    "home_pitcher_spin_rate",
    "away_pitcher_spin_rate",
    "home_pitcher_stuff_plus",
    "away_pitcher_stuff_plus",
    "home_pitcher_o_swing_pct",
    "away_pitcher_o_swing_pct",
    "home_pitcher_k_pct_vs_lhb",
    "away_pitcher_k_pct_vs_lhb",
    "home_pitcher_k_pct_vs_rhb",
    "away_pitcher_k_pct_vs_rhb",
    "park_factor_k",
    "park_factor_runs",
    "park_factor_hr"
  ];
  const escapeStr = (val) => {
    if (val === void 0 || val === null || val === "") return "";
    return `"${String(val).replace(/"/g, '""')}"`;
  };
  const rows = [];
  for (const game of games) {
    const gameId2 = String(game.id);
    const hPit = pitLookups.pitchers?.[gameId2]?.home;
    const aPit = pitLookups.pitchers?.[gameId2]?.away;
    const hSplitRhp = game.offensive_splits?.home?.vsRhp;
    const hSplitLhp = game.offensive_splits?.home?.vsLhp;
    const aSplitRhp = game.offensive_splits?.away?.vsRhp;
    const aSplitLhp = game.offensive_splits?.away?.vsLhp;
    const fPitchers = game.fatigue_metrics?.pitchers;
    const fBullpen = game.fatigue_metrics?.bullpen;
    const canUseActualKs = isFinalGameStatus(game.game_result?.gameStatus);
    const canUseBettingLines = hasRealBettingLines(game);
    const hL3Bf = calcLast3Stats(game.advanced_pitching?.home?.last3Bf1, game.advanced_pitching?.home?.last3Bf2, game.advanced_pitching?.home?.last3Bf3);
    const hL3Ip = calcLast3Stats(game.advanced_pitching?.home?.last3Ip1, game.advanced_pitching?.home?.last3Ip2, game.advanced_pitching?.home?.last3Ip3);
    const hL3K = calcLast3Stats(game.advanced_pitching?.home?.last3Ks1, game.advanced_pitching?.home?.last3Ks2, game.advanced_pitching?.home?.last3Ks3);
    const aL3Bf = calcLast3Stats(game.advanced_pitching?.away?.last3Bf1, game.advanced_pitching?.away?.last3Bf2, game.advanced_pitching?.away?.last3Bf3);
    const aL3Ip = calcLast3Stats(game.advanced_pitching?.away?.last3Ip1, game.advanced_pitching?.away?.last3Ip2, game.advanced_pitching?.away?.last3Ip3);
    const aL3K = calcLast3Stats(game.advanced_pitching?.away?.last3Ks1, game.advanced_pitching?.away?.last3Ks2, game.advanced_pitching?.away?.last3Ks3);
    const gameContextRow = [
      escapeStr(game.metadata.time),
      escapeStr(game.metadata.homeTeam),
      escapeStr(game.metadata.awayTeam),
      escapeStr(game.metadata.venue),
      // Pitchers standard
      escapeStr(game.pitchers.home.name),
      ...pitcherPitStatsBlockValues(hPit),
      game.pitchers.home.strikeoutProp ?? "",
      game.pitchers.home.strikeoutPropOverOdds ?? "",
      game.pitchers.home.strikeoutPropUnderOdds ?? "",
      escapeStr(game.pitchers.home.strikeoutPropSource),
      escapeStr(game.pitchers.home.strikeoutPropCaptureStatus),
      escapeStr(game.pitchers.away.name),
      ...pitcherPitStatsBlockValues(aPit),
      game.pitchers.away.strikeoutProp ?? "",
      game.pitchers.away.strikeoutPropOverOdds ?? "",
      game.pitchers.away.strikeoutPropUnderOdds ?? "",
      escapeStr(game.pitchers.away.strikeoutPropSource),
      escapeStr(game.pitchers.away.strikeoutPropCaptureStatus),
      // Bullpen standard
      game.bullpen.home.era ?? "",
      escapeStr(game.bullpen.home.usageLast3Days),
      game.bullpen.home.ipLast7Days ?? fBullpen?.home?.ipLast7Days ?? "",
      game.bullpen.away.era ?? "",
      escapeStr(game.bullpen.away.usageLast3Days),
      game.bullpen.away.ipLast7Days ?? fBullpen?.away?.ipLast7Days ?? "",
      // Offense standard
      game.offense.home.runsPerGame ?? "",
      game.offense.home.ops ?? "",
      game.offense.home.obp ?? "",
      game.offense.home.slg ?? "",
      getLineupAverageKPct(game.lineups?.home),
      game.offense.away.runsPerGame ?? "",
      game.offense.away.ops ?? "",
      game.offense.away.obp ?? "",
      game.offense.away.slg ?? "",
      getLineupAverageKPct(game.lineups?.away),
      // Weather
      game.weather?.temp ?? "",
      game.weather?.humidity ?? "",
      game.weather?.windSpeed ?? "",
      game.weather?.windDirection ?? "",
      game.weather?.pressure ?? "",
      game.weather?.rainProbability ?? "",
      escapeStr(game.weather?.skyStatus),
      game.weather?.apparentTemp ?? "",
      // Home splits vs Rhp
      hSplitRhp?.avg ?? "",
      hSplitRhp?.ops ?? "",
      hSplitRhp?.obp ?? "",
      hSplitRhp?.slg ?? "",
      hSplitRhp?.runsPerGame ?? "",
      hSplitRhp?.hr ?? "",
      // Home splits vs Lhp
      hSplitLhp?.avg ?? "",
      hSplitLhp?.ops ?? "",
      hSplitLhp?.obp ?? "",
      hSplitLhp?.slg ?? "",
      hSplitLhp?.runsPerGame ?? "",
      hSplitLhp?.hr ?? "",
      // Away splits vs Rhp
      aSplitRhp?.avg ?? "",
      aSplitRhp?.ops ?? "",
      aSplitRhp?.obp ?? "",
      aSplitRhp?.slg ?? "",
      aSplitRhp?.runsPerGame ?? "",
      aSplitRhp?.hr ?? "",
      // Away splits vs Lhp
      aSplitLhp?.avg ?? "",
      aSplitLhp?.ops ?? "",
      aSplitLhp?.obp ?? "",
      aSplitLhp?.slg ?? "",
      aSplitLhp?.runsPerGame ?? "",
      aSplitLhp?.hr ?? "",
      // Fatigue
      fPitchers?.home?.daysSinceLastStart ?? "",
      fPitchers?.home?.pitchesLastStart ?? "",
      fPitchers?.home?.pitchesLast3Starts ?? "",
      fPitchers?.away?.daysSinceLastStart ?? "",
      fPitchers?.away?.pitchesLastStart ?? "",
      fPitchers?.away?.pitchesLast3Starts ?? "",
      fBullpen?.home?.ipLast3Days ?? "",
      fBullpen?.home?.ipLast7Days ?? "",
      fBullpen?.home?.relieversUsedYesterday ?? "",
      fBullpen?.home?.relieversUsedLast2Days ?? "",
      fBullpen?.home?.availableCount ?? "",
      fBullpen?.away?.ipLast3Days ?? "",
      fBullpen?.away?.ipLast7Days ?? "",
      fBullpen?.away?.relieversUsedYesterday ?? "",
      fBullpen?.away?.relieversUsedLast2Days ?? "",
      fBullpen?.away?.availableCount ?? "",
      // Advanced Pitching
      game.advanced_pitching?.home?.xEra ?? "",
      game.advanced_pitching?.home?.fip ?? "",
      game.advanced_pitching?.home?.xFip ?? "",
      game.advanced_pitching?.home?.siera ?? "",
      game.advanced_pitching?.home?.hardHitPct ?? "",
      game.advanced_pitching?.home?.barrelPct ?? "",
      game.advanced_pitching?.home?.groundBallPct ?? "",
      game.advanced_pitching?.home?.flyBallPct ?? "",
      game.advanced_pitching?.home?.strikeoutRate ?? "",
      game.advanced_pitching?.home?.walkRate ?? "",
      game.advanced_pitching?.home?.swingingStrikePct ?? "",
      game.advanced_pitching?.home?.cswPct ?? "",
      canUseActualKs ? game.advanced_pitching?.home?.actualStrikeouts ?? "" : "",
      game.advanced_pitching?.home?.last5KsAvg ?? "",
      game.advanced_pitching?.home?.last5KsStd ?? "",
      game.advanced_pitching?.home?.last5IpAvg ?? "",
      game.advanced_pitching?.home?.last5BfAvg ?? "",
      game.advanced_pitching?.home?.last5PitchCountAvg ?? "",
      game.advanced_pitching?.home?.last3Ks1 ?? "",
      game.advanced_pitching?.home?.last3Ks2 ?? "",
      game.advanced_pitching?.home?.last3Ks3 ?? "",
      game.advanced_pitching?.home?.last3Ip1 ?? "",
      game.advanced_pitching?.home?.last3Ip2 ?? "",
      game.advanced_pitching?.home?.last3Ip3 ?? "",
      game.advanced_pitching?.home?.last3Bf1 ?? "",
      game.advanced_pitching?.home?.last3Bf2 ?? "",
      game.advanced_pitching?.home?.last3Bf3 ?? "",
      game.advanced_pitching?.home?.careerKPctVsTeam ?? game.advanced_pitching?.homeVsOpp?.careerKPctVsTeam ?? game.advanced_pitching?.homeVsOpp?.strikeoutRate ?? "",
      game.advanced_pitching?.home?.last3VsTeamKsAvg ?? "",
      game.advanced_pitching?.home?.last3VsTeamBfAvg ?? "",
      game.advanced_pitching?.home?.last3VsTeamBfAvg ?? "",
      game.advanced_pitching?.home?.projectedPitchCount ?? "",
      game.advanced_pitching?.home?.projectedInnings ?? "",
      game.advanced_pitching?.home?.projectedStrikeoutsBase ?? "",
      game.advanced_pitching?.home?.battersFacedPerStart ?? "",
      game.advanced_pitching?.home?.fastballPct ?? "",
      game.advanced_pitching?.home?.sliderPct ?? "",
      game.advanced_pitching?.home?.curvePct ?? "",
      game.advanced_pitching?.home?.changeupPct ?? "",
      game.advanced_pitching?.home?.splitterPct ?? "",
      escapeStr(game.advanced_pitching?.home?.catcherName),
      game.advanced_pitching?.home?.catcherFramingRuns ?? "",
      hL3Bf.avg,
      hL3Ip.avg,
      hL3K.avg,
      hL3Bf.min,
      hL3Ip.min,
      hL3Bf.under15,
      hL3Bf.under18,
      game.advanced_pitching?.away?.xEra ?? "",
      game.advanced_pitching?.away?.fip ?? "",
      game.advanced_pitching?.away?.xFip ?? "",
      game.advanced_pitching?.away?.siera ?? "",
      game.advanced_pitching?.away?.hardHitPct ?? "",
      game.advanced_pitching?.away?.barrelPct ?? "",
      game.advanced_pitching?.away?.groundBallPct ?? "",
      game.advanced_pitching?.away?.flyBallPct ?? "",
      game.advanced_pitching?.away?.strikeoutRate ?? "",
      game.advanced_pitching?.away?.walkRate ?? "",
      game.advanced_pitching?.away?.swingingStrikePct ?? "",
      game.advanced_pitching?.away?.cswPct ?? "",
      canUseActualKs ? game.advanced_pitching?.away?.actualStrikeouts ?? "" : "",
      game.advanced_pitching?.away?.last5KsAvg ?? "",
      game.advanced_pitching?.away?.last5KsStd ?? "",
      game.advanced_pitching?.away?.last5IpAvg ?? "",
      game.advanced_pitching?.away?.last5BfAvg ?? "",
      game.advanced_pitching?.away?.last5PitchCountAvg ?? "",
      game.advanced_pitching?.away?.last3Ks1 ?? "",
      game.advanced_pitching?.away?.last3Ks2 ?? "",
      game.advanced_pitching?.away?.last3Ks3 ?? "",
      game.advanced_pitching?.away?.last3Ip1 ?? "",
      game.advanced_pitching?.away?.last3Ip2 ?? "",
      game.advanced_pitching?.away?.last3Ip3 ?? "",
      game.advanced_pitching?.away?.last3Bf1 ?? "",
      game.advanced_pitching?.away?.last3Bf2 ?? "",
      game.advanced_pitching?.away?.last3Bf3 ?? "",
      game.advanced_pitching?.away?.careerKPctVsTeam ?? game.advanced_pitching?.awayVsOpp?.careerKPctVsTeam ?? game.advanced_pitching?.awayVsOpp?.strikeoutRate ?? "",
      game.advanced_pitching?.away?.last3VsTeamKsAvg ?? "",
      game.advanced_pitching?.away?.last3VsTeamBfAvg ?? "",
      game.advanced_pitching?.away?.last3VsTeamBfAvg ?? "",
      game.advanced_pitching?.away?.projectedPitchCount ?? "",
      game.advanced_pitching?.away?.projectedInnings ?? "",
      game.advanced_pitching?.away?.projectedStrikeoutsBase ?? "",
      game.advanced_pitching?.away?.battersFacedPerStart ?? "",
      game.advanced_pitching?.away?.fastballPct ?? "",
      game.advanced_pitching?.away?.sliderPct ?? "",
      game.advanced_pitching?.away?.curvePct ?? "",
      game.advanced_pitching?.away?.changeupPct ?? "",
      game.advanced_pitching?.away?.splitterPct ?? "",
      escapeStr(game.advanced_pitching?.away?.catcherName),
      game.advanced_pitching?.away?.catcherFramingRuns ?? "",
      aL3Bf.avg,
      aL3Ip.avg,
      aL3K.avg,
      aL3Bf.min,
      aL3Ip.min,
      aL3Bf.under15,
      aL3Bf.under18,
      // Advanced Offense
      game.advanced_offense?.home?.wOba ?? "",
      game.advanced_offense?.home?.xwOba ?? "",
      game.advanced_offense?.home?.iso ?? "",
      game.advanced_offense?.home?.babip ?? "",
      game.advanced_offense?.home?.hardHitPct ?? "",
      game.advanced_offense?.home?.barrelPct ?? "",
      game.advanced_offense?.home?.contactPct ?? "",
      game.advanced_offense?.home?.kPctVsPitchHand ?? "",
      game.advanced_offense?.home?.projectedLineupKPct ?? "",
      game.advanced_offense?.home?.projectedLineupContactPctVsHand ?? "",
      game.advanced_offense?.home?.projectedLineupWhiffPctVsHand ?? "",
      game.advanced_offense?.home?.whiffPctVsFastball ?? "",
      game.advanced_offense?.home?.whiffPctVsSlider ?? "",
      game.advanced_offense?.home?.whiffPctVsCurve ?? "",
      game.advanced_offense?.home?.whiffPctVsChangeup ?? "",
      game.advanced_offense?.home?.whiffPctVsSplitter ?? "",
      game.advanced_offense?.away?.wOba ?? "",
      game.advanced_offense?.away?.xwOba ?? "",
      game.advanced_offense?.away?.iso ?? "",
      game.advanced_offense?.away?.babip ?? "",
      game.advanced_offense?.away?.hardHitPct ?? "",
      game.advanced_offense?.away?.barrelPct ?? "",
      game.advanced_offense?.away?.contactPct ?? "",
      game.advanced_offense?.away?.kPctVsPitchHand ?? "",
      game.advanced_offense?.away?.projectedLineupKPct ?? "",
      game.advanced_offense?.away?.projectedLineupContactPctVsHand ?? "",
      game.advanced_offense?.away?.projectedLineupWhiffPctVsHand ?? "",
      game.advanced_offense?.away?.whiffPctVsFastball ?? "",
      game.advanced_offense?.away?.whiffPctVsSlider ?? "",
      game.advanced_offense?.away?.whiffPctVsCurve ?? "",
      game.advanced_offense?.away?.whiffPctVsChangeup ?? "",
      game.advanced_offense?.away?.whiffPctVsSplitter ?? "",
      // Model Features
      game.model_features?.diffEra ?? "",
      game.model_features?.diffXera ?? "",
      game.model_features?.diffFip ?? "",
      game.model_features?.diffOps ?? "",
      game.model_features?.diffXwoba ?? "",
      game.model_features?.diffBullpenEra ?? "",
      game.model_features?.diffRunsPerGame ?? "",
      game.model_features?.diffRecordLast10 ?? "",
      game.model_features?.diffRecordHomeAway ?? "",
      game.model_features?.diffStarterRest ?? "",
      game.model_features?.diffBullpenFatigue ?? "",
      canUseBettingLines ? escapeStr(getBettingLineSource(game)) : "",
      // Metadata de confiabilidad point-in-time — ver comentario del header savant_metrics_asof_date
      savantCache.getSnapshotDate() ?? "",
      // Results
      game.game_result?.homeScore ?? "",
      game.game_result?.awayScore ?? "",
      escapeStr(game.game_result?.winner),
      escapeStr(game.game_result?.gameStatus ?? "Scheduled"),
      // VORTEX V10.3 METRICS
      game.lineups?.lineup_confirmed ? 1 : 0,
      escapeStr(game.lineups?.lineup_source),
      escapeStr(game.lineups?.lineup_updated_at),
      escapeStr(game.pitchers?.home_starter?.pitcher_primary_pitch ?? game.pitchers?.home?.pitcher_primary_pitch ?? (() => {
        const ap = game.advanced_pitching?.home;
        if (!ap) return null;
        const arr = [{ n: "fastball", p: ap.fastballPct || 0 }, { n: "slider", p: ap.sliderPct || 0 }, { n: "curve", p: ap.curvePct || 0 }, { n: "changeup", p: ap.changeupPct || 0 }, { n: "splitter", p: ap.splitterPct || 0 }].sort((a, b) => b.p - a.p);
        return arr[0].p > 0 ? arr[0].n : null;
      })()),
      game.pitchers?.home_starter?.pitcher_primary_pitch_usage_pct ?? game.pitchers?.home?.pitcher_primary_pitch_usage_pct ?? (() => {
        const ap = game.advanced_pitching?.home;
        if (!ap) return "";
        const arr = [ap.fastballPct || 0, ap.sliderPct || 0, ap.curvePct || 0, ap.changeupPct || 0, ap.splitterPct || 0].sort((a, b) => b - a);
        return arr[0] > 0 ? arr[0] : "";
      })(),
      escapeStr(game.pitchers?.home_starter?.pitcher_secondary_pitch ?? game.pitchers?.home?.pitcher_secondary_pitch ?? (() => {
        const ap = game.advanced_pitching?.home;
        if (!ap) return null;
        const arr = [{ n: "fastball", p: ap.fastballPct || 0 }, { n: "slider", p: ap.sliderPct || 0 }, { n: "curve", p: ap.curvePct || 0 }, { n: "changeup", p: ap.changeupPct || 0 }, { n: "splitter", p: ap.splitterPct || 0 }].sort((a, b) => b.p - a.p);
        return arr[1].p > 0 ? arr[1].n : null;
      })()),
      game.pitchers?.home_starter?.pitcher_secondary_pitch_usage_pct ?? game.pitchers?.home?.pitcher_secondary_pitch_usage_pct ?? (() => {
        const ap = game.advanced_pitching?.home;
        if (!ap) return "";
        const arr = [ap.fastballPct || 0, ap.sliderPct || 0, ap.curvePct || 0, ap.changeupPct || 0, ap.splitterPct || 0].sort((a, b) => b - a);
        return arr[1] > 0 ? arr[1] : "";
      })(),
      game.pitchers?.home_starter?.pitcher_pitches_per_bf ?? game.pitchers?.home?.pitcher_pitches_per_bf ?? game.advanced_pitching?.home?.pitcher_pitches_per_bf ?? "",
      game.pitchers?.home_starter?.pitcher_pitches_per_bf_last5 ?? game.pitchers?.home?.pitcher_pitches_per_bf_last5 ?? game.advanced_pitching?.home?.pitcher_pitches_per_bf_last5 ?? "",
      game.pitchers?.home_starter?.pitcher_pitches_per_ip_last5 ?? game.pitchers?.home?.pitcher_pitches_per_ip_last5 ?? game.advanced_pitching?.home?.pitcher_pitches_per_ip_last5 ?? "",
      escapeStr(game.pitchers?.away_starter?.pitcher_primary_pitch ?? game.pitchers?.away?.pitcher_primary_pitch ?? (() => {
        const ap = game.advanced_pitching?.away;
        if (!ap) return null;
        const arr = [{ n: "fastball", p: ap.fastballPct || 0 }, { n: "slider", p: ap.sliderPct || 0 }, { n: "curve", p: ap.curvePct || 0 }, { n: "changeup", p: ap.changeupPct || 0 }, { n: "splitter", p: ap.splitterPct || 0 }].sort((a, b) => b.p - a.p);
        return arr[0].p > 0 ? arr[0].n : null;
      })()),
      game.pitchers?.away_starter?.pitcher_primary_pitch_usage_pct ?? game.pitchers?.away?.pitcher_primary_pitch_usage_pct ?? (() => {
        const ap = game.advanced_pitching?.away;
        if (!ap) return "";
        const arr = [ap.fastballPct || 0, ap.sliderPct || 0, ap.curvePct || 0, ap.changeupPct || 0, ap.splitterPct || 0].sort((a, b) => b - a);
        return arr[0] > 0 ? arr[0] : "";
      })(),
      escapeStr(game.pitchers?.away_starter?.pitcher_secondary_pitch ?? game.pitchers?.away?.pitcher_secondary_pitch ?? (() => {
        const ap = game.advanced_pitching?.away;
        if (!ap) return null;
        const arr = [{ n: "fastball", p: ap.fastballPct || 0 }, { n: "slider", p: ap.sliderPct || 0 }, { n: "curve", p: ap.curvePct || 0 }, { n: "changeup", p: ap.changeupPct || 0 }, { n: "splitter", p: ap.splitterPct || 0 }].sort((a, b) => b.p - a.p);
        return arr[1].p > 0 ? arr[1].n : null;
      })()),
      game.pitchers?.away_starter?.pitcher_secondary_pitch_usage_pct ?? game.pitchers?.away?.pitcher_secondary_pitch_usage_pct ?? (() => {
        const ap = game.advanced_pitching?.away;
        if (!ap) return "";
        const arr = [ap.fastballPct || 0, ap.sliderPct || 0, ap.curvePct || 0, ap.changeupPct || 0, ap.splitterPct || 0].sort((a, b) => b - a);
        return arr[1] > 0 ? arr[1] : "";
      })(),
      game.pitchers?.away_starter?.pitcher_pitches_per_bf ?? game.pitchers?.away?.pitcher_pitches_per_bf ?? game.advanced_pitching?.away?.pitcher_pitches_per_bf ?? "",
      game.pitchers?.away_starter?.pitcher_pitches_per_bf_last5 ?? game.pitchers?.away?.pitcher_pitches_per_bf_last5 ?? game.advanced_pitching?.away?.pitcher_pitches_per_bf_last5 ?? "",
      game.pitchers?.away_starter?.pitcher_pitches_per_ip_last5 ?? game.pitchers?.away?.pitcher_pitches_per_ip_last5 ?? game.advanced_pitching?.away?.pitcher_pitches_per_ip_last5 ?? "",
      game.pitchers?.home_starter?.pitcher_avg_pitches_last3 ?? game.pitchers?.home?.pitcher_avg_pitches_last3 ?? game.advanced_pitching?.home?.pitcher_avg_pitches_last3 ?? "",
      escapeStr(game.pitchers?.home_starter?.pitcher_rest_status ?? game.pitchers?.home?.pitcher_rest_status ?? game.advanced_pitching?.home?.pitcher_rest_status),
      game.pitchers?.away_starter?.pitcher_avg_pitches_last3 ?? game.pitchers?.away?.pitcher_avg_pitches_last3 ?? game.advanced_pitching?.away?.pitcher_avg_pitches_last3 ?? "",
      escapeStr(game.pitchers?.away_starter?.pitcher_rest_status ?? game.pitchers?.away?.pitcher_rest_status ?? game.advanced_pitching?.away?.pitcher_rest_status),
      escapeStr(game.pitchers?.home_starter?.pitchHand ?? game.pitchers?.home?.pitchHand),
      escapeStr(game.pitchers?.away_starter?.pitchHand ?? game.pitchers?.away?.pitchHand),
      game.bullpen?.home?.ipLast3Days ?? fBullpen?.home?.ipLast3Days ?? "",
      game.bullpen?.home?.ipLast7Days ?? fBullpen?.home?.ipLast7Days ?? "",
      game.bullpen?.away?.ipLast3Days ?? fBullpen?.away?.ipLast3Days ?? "",
      game.bullpen?.away?.ipLast7Days ?? fBullpen?.away?.ipLast7Days ?? "",
      game.bullpen?.home?.relieversUsedYesterday ?? fBullpen?.home?.relieversUsedYesterday ?? "",
      game.advanced_offense?.home?.lineup_contact_stress_score ?? "",
      game.advanced_offense?.home?.lineup_pitch_count_risk_score ?? "",
      game.advanced_offense?.home?.lineup_high_hardhit_batters_count ?? "",
      game.advanced_offense?.away?.lineup_contact_stress_score ?? "",
      game.advanced_offense?.away?.lineup_pitch_count_risk_score ?? "",
      game.advanced_offense?.away?.lineup_high_hardhit_batters_count ?? "",
      game.pitchers?.home_starter?.pitcher_recent_velocity ?? game.pitchers?.home?.pitcher_recent_velocity ?? "",
      game.pitchers?.away_starter?.pitcher_recent_velocity ?? game.pitchers?.away?.pitcher_recent_velocity ?? "",
      // New Advanced Metrics & Park Factors
      game.advanced_pitching?.home?.pitcher_spin_rate ?? "",
      game.advanced_pitching?.away?.pitcher_spin_rate ?? "",
      game.advanced_pitching?.home?.pitcher_stuff_plus ?? "",
      game.advanced_pitching?.away?.pitcher_stuff_plus ?? "",
      game.advanced_pitching?.home?.pitcher_o_swing_pct ?? "",
      game.advanced_pitching?.away?.pitcher_o_swing_pct ?? "",
      game.advanced_pitching?.home?.pitcher_k_pct_vs_lhb ?? "",
      game.advanced_pitching?.away?.pitcher_k_pct_vs_lhb ?? "",
      game.advanced_pitching?.home?.pitcher_k_pct_vs_rhb ?? "",
      game.advanced_pitching?.away?.pitcher_k_pct_vs_rhb ?? "",
      game.park_factors?.index_so ?? 100,
      game.park_factors?.index_runs ?? 100,
      game.park_factors?.index_hr ?? 100
    ];
    const processTeamLineup = (lineup, teamName, isHomeTeam) => {
      if (!lineup || !Array.isArray(lineup)) return;
      const oppPitcher = isHomeTeam ? game.pitchers.away : game.pitchers.home;
      const oppPitcherName = oppPitcher?.name || "";
      const oppPitcherHand = oppPitcher?.pitchHand || "";
      const pitcherAllowedAvgLhb = oppPitcher?.pitcher_allowed_avg_vs_lhb ?? "";
      const pitcherAllowedAvgRhb = oppPitcher?.pitcher_allowed_avg_vs_rhb ?? "";
      const pitcherAllowedSlgLhb = oppPitcher?.pitcher_allowed_slg_vs_lhb ?? "";
      const pitcherAllowedSlgRhb = oppPitcher?.pitcher_allowed_slg_vs_rhb ?? "";
      for (const p of lineup) {
        const batterStatsRow = [
          escapeStr(game.id),
          escapeStr(game.metadata.date),
          escapeStr(p.player_name || p.name || ""),
          escapeStr(p.team || teamName),
          p.batting_order ?? "",
          escapeStr(p.bat_side || "R"),
          escapeStr(p.position || "DH"),
          p.avg ?? "",
          p.obp ?? "",
          p.slg ?? "",
          p.ops ?? "",
          p.woba ?? "",
          p.iso ?? "",
          p.pa ?? "",
          p.hits ?? "",
          p.doubles ?? "",
          p.triples ?? "",
          p.home_runs ?? p.hr ?? "",
          p.strikeout_pct ?? p.kPct ?? "",
          p.walk_pct ?? "",
          p.last7_avg ?? "",
          p.last7_ops ?? "",
          p.last7_slg ?? "",
          p.last7_total_bases ?? "",
          p.last7_hits ?? "",
          p.last7_xbh ?? "",
          p.ops_vs_rhp ?? "",
          p.ops_vs_lhp ?? "",
          p.slg_vs_rhp ?? "",
          p.slg_vs_lhp ?? "",
          p.k_pct_vs_rhp ?? "",
          p.k_pct_vs_lhp ?? "",
          roundCsvNumber(p.contact_pct_vs_rhp),
          roundCsvNumber(p.contact_pct_vs_lhp),
          roundCsvNumber(p.whiff_pct),
          roundCsvNumber(p.chase_pct),
          escapeStr(oppPitcherName),
          escapeStr(oppPitcherHand),
          pitcherAllowedAvgLhb,
          pitcherAllowedAvgRhb,
          pitcherAllowedSlgLhb,
          pitcherAllowedSlgRhb
        ];
        rows.push([...batterStatsRow, ...gameContextRow]);
      }
    };
    processTeamLineup(game.lineups?.home, game.metadata.homeTeam, true);
    processTeamLineup(game.lineups?.away, game.metadata.awayTeam, false);
  }
  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}
function formatCsvTimestamp(isoString, dateFallback) {
  if (!isoString) return dateFallback ? `${dateFallback} 12:00:00` : "";
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return dateFallback ? `${dateFallback} 12:00:00` : "";
    const pad = (n2) => String(n2).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch (e) {
    return dateFallback ? `${dateFallback} 12:00:00` : "";
  }
}
function generateKPropsLinesCSV(games) {
  const headers = [
    "game_id",
    "date",
    "pitcher",
    "team",
    "side",
    "k_line",
    "over_odds",
    "under_odds",
    "book",
    "line_source",
    "timestamp",
    "line_type"
  ];
  const rows = [];
  for (const g of games) {
    const ts = formatCsvTimestamp(g.timestamp, g.metadata.date);
    if (g.pitchers?.home?.name) {
      const homeTeamAbbr = getTeamAbbr(g.metadata.homeTeam) || g.metadata.homeTeam;
      const hasProp = g.pitchers.home.strikeoutProp !== void 0 && g.pitchers.home.strikeoutProp !== null;
      const source = getPropLineSource(g.pitchers.home.strikeoutPropSource);
      rows.push([
        g.id,
        g.metadata.date,
        escapeCsvValue(g.pitchers.home.name),
        escapeCsvValue(homeTeamAbbr),
        "home",
        g.pitchers.home.strikeoutProp ?? "",
        g.pitchers.home.strikeoutPropOverOdds ?? "",
        g.pitchers.home.strikeoutPropUnderOdds ?? "",
        hasProp && source ? escapeCsvValue(source === "the_odds_api" ? "TheOddsAPI" : "datastreak") : "",
        hasProp ? source : "",
        hasProp ? ts : "",
        hasProp ? "current" : ""
        // line_type
      ]);
    }
    if (g.pitchers?.away?.name) {
      const awayTeamAbbr = getTeamAbbr(g.metadata.awayTeam) || g.metadata.awayTeam;
      const hasProp = g.pitchers.away.strikeoutProp !== void 0 && g.pitchers.away.strikeoutProp !== null;
      const source = getPropLineSource(g.pitchers.away.strikeoutPropSource);
      rows.push([
        g.id,
        g.metadata.date,
        escapeCsvValue(g.pitchers.away.name),
        escapeCsvValue(awayTeamAbbr),
        "away",
        g.pitchers.away.strikeoutProp ?? "",
        g.pitchers.away.strikeoutPropOverOdds ?? "",
        g.pitchers.away.strikeoutPropUnderOdds ?? "",
        hasProp && source ? escapeCsvValue(source === "the_odds_api" ? "TheOddsAPI" : "datastreak") : "",
        hasProp ? source : "",
        hasProp ? ts : "",
        hasProp ? "current" : ""
      ]);
    }
  }
  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}
function generateBatterTotalBasesLinesCSV(games) {
  const headers = [
    "game_id",
    "date",
    "player_name",
    "team",
    "side",
    "tb_line",
    "over_odds",
    "under_odds",
    "book",
    "line_source",
    "timestamp",
    "line_type"
  ];
  const rows = [];
  for (const g of games) {
    const ts = formatCsvTimestamp(g.timestamp, g.metadata.date);
    const processLineup = (lineup, teamName, side) => {
      for (const p of lineup || []) {
        if (p.player_name || p.name) {
          const teamAbbr = getTeamAbbr(teamName) || teamName;
          const hasProp = p.totalBasesProp !== void 0 && p.totalBasesProp !== null;
          const source = getPropLineSource(p.totalBasesPropSource, p.totalBasesPropBook);
          rows.push([
            g.id,
            g.metadata.date,
            escapeCsvValue(p.player_name || p.name || ""),
            escapeCsvValue(teamAbbr),
            side,
            p.totalBasesProp ?? "",
            p.totalBasesPropOverOdds ?? "",
            p.totalBasesPropUnderOdds ?? "",
            hasProp ? escapeCsvValue(p.totalBasesPropBook || "datastreak") : "",
            hasProp ? source : "",
            hasProp ? ts : "",
            hasProp ? "current" : ""
          ]);
        }
      }
    };
    processLineup(g.lineups?.home, g.metadata.homeTeam, "home");
    processLineup(g.lineups?.away, g.metadata.awayTeam, "away");
  }
  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

// src/etl/extractors/parkFactorsScraper.ts
import fs2 from "fs";
import path2 from "path";
var ParkFactorsScraper = class {
  constructor() {
    this.parkFactorsData = /* @__PURE__ */ new Map();
    this.isLoaded = false;
    this.cacheDir = path2.join(process.cwd(), "cache");
    this.cacheFile = path2.join(this.cacheDir, "park_factors.json");
    if (!fs2.existsSync(this.cacheDir)) {
      fs2.mkdirSync(this.cacheDir, { recursive: true });
    }
  }
  async load() {
    if (this.isLoaded) return;
    try {
      if (fs2.existsSync(this.cacheFile)) {
        const stats = fs2.statSync(this.cacheFile);
        const daysOld = (Date.now() - stats.mtimeMs) / (1e3 * 60 * 60 * 24);
        if (daysOld < 7) {
          const rawData = fs2.readFileSync(this.cacheFile, "utf8");
          const parsedData = JSON.parse(rawData);
          this.populateMap(parsedData);
          console.log(`[ParkFactors] Cargado desde cach\xE9 (${this.parkFactorsData.size} estadios).`);
          this.isLoaded = true;
          return;
        }
      }
      console.log(`[ParkFactors] Descargando Park Factors actualizados desde Baseball Savant...`);
      const res = await fetch(`https://baseballsavant.mlb.com/leaderboard/statcast-park-factors`);
      if (!res.ok) {
        throw new Error(`Error fetching park factors: ${res.statusText}`);
      }
      const text = await res.text();
      const match = text.match(/var data = (\[.*?\]);/);
      if (match) {
        const data = JSON.parse(match[1]);
        fs2.writeFileSync(this.cacheFile, JSON.stringify(data, null, 2));
        this.populateMap(data);
        this.isLoaded = true;
        console.log(`[ParkFactors] Datos descargados y guardados en cach\xE9 (${this.parkFactorsData.size} estadios).`);
      } else {
        throw new Error("No se pudo encontrar el JSON en el HTML de Savant.");
      }
    } catch (error) {
      console.error("[ParkFactors] Error cargando Park Factors:", error);
      this.isLoaded = true;
    }
  }
  populateMap(data) {
    this.parkFactorsData.clear();
    for (const item of data) {
      if (item.key_bat_side === "All" && String(item.key_is_year_rolling) === "1") {
        const venue = String(item.venue_name).toLowerCase().trim();
        this.parkFactorsData.set(venue, {
          venue_id: item.venue_id,
          venue_name: item.venue_name,
          index_runs: parseInt(item.index_runs, 10) || 100,
          index_so: parseInt(item.index_so, 10) || 100,
          index_hr: parseInt(item.index_hr, 10) || 100
        });
      }
    }
  }
  getParkFactors(venueName) {
    if (!venueName) return null;
    let name = venueName.toLowerCase().trim();
    if (name.includes("camden yards")) name = "oriole park at camden yards";
    if (name.includes("loandepot")) name = "loandepot park";
    if (name.includes("guaranteed rate")) name = "guaranteed rate field";
    if (name.includes("american family")) name = "american family field";
    const data = this.parkFactorsData.get(name);
    if (data) return data;
    for (const [key, val] of this.parkFactorsData.entries()) {
      if (key.includes(name) || name.includes(key)) {
        return val;
      }
    }
    return null;
  }
};
var parkFactorsScraper = new ParkFactorsScraper();

// src/etl/extractors/mlbBoxscorePitcherExtractor.ts
import axios from "axios";
var MLB_API_BASE = "https://statsapi.mlb.com/api/v1";
var boxscoreCache = /* @__PURE__ */ new Map();
function n(val) {
  if (val === null || val === void 0 || val === "") return null;
  const parsed = parseInt(String(val), 10);
  return isNaN(parsed) ? null : parsed;
}
function calcGameScore(ip, k, bb, hits, er, hr) {
  if (!ip || k === null || bb === null || hits === null || er === null || hr === null) return null;
  const parts = String(ip).split(".");
  const outs = parseInt(parts[0], 10) * 3 + parseInt(parts[1] || "0", 10);
  const score = 50 + 3 * outs + k - 2 * hits - 4 * er - 2 * bb - hr;
  return Math.round(score);
}
function extractStarterStats(teamData, allPlayers) {
  const pitcherIds = teamData?.pitchers ?? [];
  if (!pitcherIds.length) return null;
  const starterId = pitcherIds[0];
  const playerKey = `ID${starterId}`;
  const playerData = allPlayers?.[playerKey];
  if (!playerData) return null;
  const stats = playerData?.stats?.pitching ?? {};
  const name = playerData?.person?.fullName ?? null;
  const ip = stats.inningsPitched ?? null;
  const bf = n(stats.battersFaced);
  const hits = n(stats.hits);
  const runs = n(stats.runs);
  const er = n(stats.earnedRuns);
  const k = n(stats.strikeOuts);
  const bb = n(stats.baseOnBalls);
  const pitches = n(stats.numberOfPitches);
  const hr = n(stats.homeRuns);
  return {
    playerId: starterId,
    name,
    inningsPitched: ip,
    battersFaced: bf,
    hitsAllowed: hits,
    runsAllowed: runs,
    earnedRuns: er,
    strikeOuts: k,
    baseOnBalls: bb,
    numberOfPitches: pitches,
    homeRunsAllowed: hr,
    gameScore: calcGameScore(ip, k, bb, hits, er, hr)
  };
}
async function getStarterBoxscoreStats(gamePk) {
  const key = String(gamePk);
  if (boxscoreCache.has(key)) {
    return boxscoreCache.get(key);
  }
  try {
    const res = await axios.get(`${MLB_API_BASE}/game/${gamePk}/boxscore`, {
      timeout: 1e4
    });
    const boxscore = res.data;
    const homePlayers = boxscore?.teams?.home?.players ?? {};
    const awayPlayers = boxscore?.teams?.away?.players ?? {};
    const result = {
      home: extractStarterStats(boxscore?.teams?.home, homePlayers),
      away: extractStarterStats(boxscore?.teams?.away, awayPlayers)
    };
    boxscoreCache.set(key, result);
    return result;
  } catch (err) {
    console.warn(`[Boxscore] Error fetching game ${gamePk}:`, err);
    const empty = { home: null, away: null };
    boxscoreCache.set(key, empty);
    return empty;
  }
}

// src/datasets/pregameSnapshots.ts
import fs3 from "fs";
import path3 from "path";
var SNAPSHOT_PATH = path3.join(process.cwd(), "mlb_pregame_snapshots.json");
var HISTORICAL_SNAPSHOT_PATH = path3.join(process.cwd(), "mlb_pregame_training_snapshots.json");
function readStore() {
  try {
    if (!fs3.existsSync(SNAPSHOT_PATH)) return { version: 1, games: {} };
    const parsed = JSON.parse(fs3.readFileSync(SNAPSHOT_PATH, "utf-8"));
    return { version: 1, games: parsed?.games || {} };
  } catch (error) {
    console.error("Error reading pregame snapshots:", error);
    return { version: 1, games: {} };
  }
}
function readHistoricalStore() {
  try {
    if (!fs3.existsSync(HISTORICAL_SNAPSHOT_PATH)) return { version: 1, games: {} };
    const parsed = JSON.parse(fs3.readFileSync(HISTORICAL_SNAPSHOT_PATH, "utf-8"));
    return { version: 1, games: parsed?.games || {} };
  } catch (error) {
    console.error("Error reading historical pregame snapshots:", error);
    return { version: 1, games: {} };
  }
}
function writeStore(store) {
  fs3.writeFileSync(SNAPSHOT_PATH, JSON.stringify(store, null, 2));
}
function isFinalStatus(status) {
  const normalized = String(status || "").toLowerCase();
  return normalized.includes("final") || normalized === "game over" || normalized === "completed early" || normalized === "completed";
}
function createPregameGameCopy(game) {
  const copy = JSON.parse(JSON.stringify(game));
  delete copy.game_result;
  delete copy.boxscore_stats;
  delete copy.liveBoxscore;
  delete copy.playByPlay;
  for (const side of ["home", "away"]) {
    if (copy.advanced_pitching?.[side]) {
      delete copy.advanced_pitching[side].actualStrikeouts;
    }
  }
  return copy;
}
function capturePregameSnapshot(game) {
  const gameId2 = String(game?.id || game?.metadata?.id || "");
  if (!gameId2 || isFinalStatus(game?.game_result?.gameStatus)) return;
  const store = readStore();
  if (store.games[gameId2]) return;
  store.games[gameId2] = {
    gameId: gameId2,
    gameDate: game.metadata?.date || "",
    capturedAt: (/* @__PURE__ */ new Date()).toISOString(),
    game: createPregameGameCopy(game)
  };
  writeStore(store);
}
function getPregameSnapshotsForGames(games) {
  const snapshots = { ...readStore().games, ...readHistoricalStore().games };
  const result = /* @__PURE__ */ new Map();
  for (const game of games) {
    const gameId2 = String(game?.id || game?.metadata?.id || "");
    if (snapshots[gameId2]) result.set(gameId2, snapshots[gameId2]);
  }
  return result;
}

// src/datasets/derivedDatasets.ts
var FINAL_STATUSES = ["final", "game over", "completed early", "completed"];
function isFinal(game) {
  const status = String(game?.game_result?.gameStatus || "").toLowerCase();
  return FINAL_STATUSES.some((value) => status.includes(value));
}
function csvValue(value) {
  if (value === null || value === void 0) return "";
  return `"${String(value).replace(/"/g, '""')}"`;
}
function toCsv(headers, rows) {
  return [headers.join(","), ...rows.map((row) => headers.map((header) => csvValue(row[header])).join(","))].join("\n");
}
function gameId(game) {
  return String(game?.id || game?.metadata?.id || "");
}
function pitcherId(pitcher) {
  const value = pitcher?.pitcherId ?? pitcher?.mlbId ?? pitcher?.id;
  if (value === null || value === void 0 || value === "" || Number(value) <= 0) return null;
  return String(value);
}
function validPitcher(pitcher) {
  const name = String(pitcher?.name || "").trim().toLowerCase();
  return Boolean(pitcherId(pitcher)) && name !== "" && name !== "tbd" && name !== "por definir";
}
function sideOpponent(side) {
  return side === "home" ? "away" : "home";
}
function actualPitcherTarget(current, side, expectedPitcherId) {
  const box = current?.boxscore_stats?.[side];
  const pitching = current?.advanced_pitching?.[side];
  const finalPitcherId = pitcherId(current?.pitchers?.[side]) ?? pitcherId({ id: box?.playerId });
  const idMatches = finalPitcherId === expectedPitcherId;
  return {
    actual_k: isFinal(current) && idMatches ? box?.strikeOuts ?? pitching?.actualStrikeouts ?? null : null,
    actual_ip: isFinal(current) && idMatches ? box?.inningsPitched ?? null : null,
    actual_bf: isFinal(current) && idMatches ? box?.battersFaced ?? null : null,
    actual_pitches: isFinal(current) && idMatches ? box?.numberOfPitches ?? null : null,
    actual_er: isFinal(current) && idMatches ? box?.earnedRuns ?? null : null,
    final_game_status: isFinal(current) && idMatches ? current?.game_result?.gameStatus ?? null : null
  };
}
function snapshotPairs(games) {
  const snapshots = getPregameSnapshotsForGames(games);
  return games.flatMap((current) => {
    const snapshot = snapshots.get(gameId(current));
    return snapshot ? [{ current, snapshot }] : [];
  });
}
var PITCHER_HEADERS = [
  "game_id",
  "pitcher_id",
  "side",
  "snapshot_captured_at",
  "game_date",
  "scheduled_time",
  "team",
  "opponent",
  "venue",
  "pitcher_era",
  "pitcher_whip",
  "pitcher_k_pct",
  "pitcher_bb_pct",
  "pitcher_ip",
  "pitcher_starts",
  "pitcher_total_strikeouts",
  "pitcher_pitch_hand",
  "opponent_lineup_k_pct",
  "opponent_lineup_contact_pct",
  "opponent_offense_ops",
  "opponent_offense_woba",
  "opponent_offense_xwoba",
  "pitcher_xera",
  "pitcher_fip",
  "pitcher_xfip",
  "pitcher_siera",
  "pitcher_so_rate",
  "pitcher_bb_rate",
  "pitcher_swstr_pct",
  "pitcher_csw_pct",
  "pitcher_last5_ks_avg",
  "pitcher_last5_ip_avg",
  "pitcher_last5_bf_avg",
  "pitcher_last5_pitch_count_avg",
  "projected_pitches",
  "projected_innings",
  "projected_strikeouts",
  "days_since_last_start",
  "pitches_last_start",
  "pitches_last_3_starts",
  "park_factor_k",
  "weather_temp",
  "weather_wind_speed",
  "actual_k",
  "actual_ip",
  "actual_bf",
  "actual_pitches",
  "actual_er",
  "final_game_status"
];
function buildPitcherGameRows(games) {
  const keys = /* @__PURE__ */ new Set();
  const rows = [];
  for (const { current, snapshot } of snapshotPairs(games)) {
    const pregame = snapshot.game;
    for (const side of ["home", "away"]) {
      const pitcher = pregame?.pitchers?.[side];
      if (!validPitcher(pitcher)) continue;
      const id = pitcherId(pitcher);
      const key = `${gameId(current)}:${id}`;
      if (keys.has(key)) continue;
      keys.add(key);
      const opponent = sideOpponent(side);
      const adv = pregame?.advanced_pitching?.[side] || {};
      const oppOffense = pregame?.advanced_offense?.[opponent] || {};
      const fatigue = pregame?.fatigue_metrics?.pitchers?.[side] || {};
      rows.push({
        game_id: gameId(current),
        pitcher_id: id,
        side,
        snapshot_captured_at: snapshot.capturedAt,
        game_date: pregame.metadata?.date ?? null,
        scheduled_time: pregame.metadata?.time ?? null,
        team: pregame.metadata?.[side === "home" ? "homeTeam" : "awayTeam"] ?? null,
        opponent: pregame.metadata?.[opponent === "home" ? "homeTeam" : "awayTeam"] ?? null,
        venue: pregame.metadata?.venue ?? null,
        pitcher_era: pitcher.era ?? null,
        pitcher_whip: pitcher.whip ?? null,
        pitcher_k_pct: pitcher.kPct ?? null,
        pitcher_bb_pct: pitcher.bbPct ?? null,
        pitcher_ip: pitcher.ip ?? null,
        pitcher_starts: pitcher.starts ?? null,
        pitcher_total_strikeouts: pitcher.totalStrikeouts ?? null,
        pitcher_pitch_hand: pitcher.pitchHand ?? null,
        opponent_lineup_k_pct: oppOffense.projectedLineupKPct ?? null,
        opponent_lineup_contact_pct: oppOffense.projectedLineupContactPctVsHand ?? null,
        opponent_offense_ops: pregame.offense?.[opponent]?.ops ?? null,
        opponent_offense_woba: oppOffense.wOba ?? null,
        opponent_offense_xwoba: oppOffense.xwOba ?? null,
        pitcher_xera: adv.xEra ?? null,
        pitcher_fip: adv.fip ?? null,
        pitcher_xfip: adv.xFip ?? null,
        pitcher_siera: adv.siera ?? null,
        pitcher_so_rate: adv.strikeoutRate ?? null,
        pitcher_bb_rate: adv.walkRate ?? null,
        pitcher_swstr_pct: adv.swingingStrikePct ?? null,
        pitcher_csw_pct: adv.cswPct ?? null,
        pitcher_last5_ks_avg: adv.last5KsAvg ?? null,
        pitcher_last5_ip_avg: adv.last5IpAvg ?? null,
        pitcher_last5_bf_avg: adv.last5BfAvg ?? null,
        pitcher_last5_pitch_count_avg: adv.last5PitchCountAvg ?? null,
        projected_pitches: adv.projectedPitchCount ?? null,
        projected_innings: adv.projectedInnings ?? null,
        projected_strikeouts: adv.projectedStrikeoutsBase ?? null,
        days_since_last_start: fatigue.daysSinceLastStart ?? null,
        pitches_last_start: fatigue.pitchesLastStart ?? null,
        pitches_last_3_starts: fatigue.pitchesLast3Starts ?? null,
        park_factor_k: pregame.park_factors?.index_so ?? null,
        weather_temp: pregame.weather?.temp ?? null,
        weather_wind_speed: pregame.weather?.windSpeed ?? null,
        ...actualPitcherTarget(current, side, id)
      });
    }
  }
  return rows;
}
var GAME_HEADERS = [
  "game_id",
  "snapshot_captured_at",
  "game_date",
  "scheduled_time",
  "home_team",
  "away_team",
  "venue",
  "park_factor_k",
  "park_factor_runs",
  "park_factor_hr",
  "weather_temp",
  "weather_humidity",
  "weather_wind_speed",
  "weather_rain_probability",
  "home_moneyline",
  "away_moneyline",
  "total_runs",
  "home_pitcher_id",
  "away_pitcher_id",
  "home_projected_lineup_k_pct",
  "away_projected_lineup_k_pct",
  "home_bullpen_ip_3d",
  "away_bullpen_ip_3d",
  "home_score",
  "away_score",
  "winner",
  "final_game_status"
];
function buildGameRows(games) {
  return snapshotPairs(games).map(({ current, snapshot }) => {
    const game = snapshot.game;
    return {
      game_id: gameId(current),
      snapshot_captured_at: snapshot.capturedAt,
      game_date: game.metadata?.date ?? null,
      scheduled_time: game.metadata?.time ?? null,
      home_team: game.metadata?.homeTeam ?? null,
      away_team: game.metadata?.awayTeam ?? null,
      venue: game.metadata?.venue ?? null,
      park_factor_k: game.park_factors?.index_so ?? null,
      park_factor_runs: game.park_factors?.index_runs ?? null,
      park_factor_hr: game.park_factors?.index_hr ?? null,
      weather_temp: game.weather?.temp ?? null,
      weather_humidity: game.weather?.humidity ?? null,
      weather_wind_speed: game.weather?.windSpeed ?? null,
      weather_rain_probability: game.weather?.rainProbability ?? null,
      home_moneyline: game.betting_lines?.currentMoneylineHome ?? null,
      away_moneyline: game.betting_lines?.currentMoneylineAway ?? null,
      total_runs: game.betting_lines?.totalRuns ?? null,
      home_pitcher_id: pitcherId(game.pitchers?.home),
      away_pitcher_id: pitcherId(game.pitchers?.away),
      home_projected_lineup_k_pct: game.advanced_offense?.home?.projectedLineupKPct ?? null,
      away_projected_lineup_k_pct: game.advanced_offense?.away?.projectedLineupKPct ?? null,
      home_bullpen_ip_3d: game.fatigue_metrics?.bullpen?.home?.ipLast3Days ?? null,
      away_bullpen_ip_3d: game.fatigue_metrics?.bullpen?.away?.ipLast3Days ?? null,
      home_score: isFinal(current) ? current.game_result?.homeScore ?? null : null,
      away_score: isFinal(current) ? current.game_result?.awayScore ?? null : null,
      winner: isFinal(current) ? current.game_result?.winner ?? null : null,
      final_game_status: isFinal(current) ? current.game_result?.gameStatus ?? null : null
    };
  });
}
var BATTER_HEADERS = [
  "game_id",
  "batter_id",
  "side",
  "snapshot_captured_at",
  "game_date",
  "team",
  "opponent",
  "batting_order",
  "position",
  "bat_side",
  "opposing_pitcher_id",
  "avg",
  "obp",
  "slg",
  "ops",
  "woba",
  "iso",
  "pa",
  "home_runs",
  "strikeout_pct",
  "walk_pct",
  "last7_avg",
  "last7_ops",
  "last7_slg",
  "last7_total_bases",
  "ops_vs_rhp",
  "ops_vs_lhp",
  "k_pct_vs_rhp",
  "k_pct_vs_lhp",
  "contact_pct_vs_rhp",
  "contact_pct_vs_lhp",
  "actual_hits",
  "actual_runs",
  "actual_rbi",
  "actual_strikeouts",
  "actual_total_bases",
  "final_game_status"
];
function liveBatterTarget(current, side, id) {
  if (!isFinal(current)) return {};
  const player = (current.liveBoxscore?.[side]?.batters || []).find((b) => String(b.id) === id);
  return {
    actual_hits: player?.h ?? null,
    actual_runs: player?.r ?? null,
    actual_rbi: player?.rbi ?? null,
    actual_strikeouts: player?.k ?? null,
    actual_total_bases: player?.total_bases ?? null
  };
}
function buildBatterGameRows(games) {
  const keys = /* @__PURE__ */ new Set();
  const rows = [];
  for (const { current, snapshot } of snapshotPairs(games)) {
    const game = snapshot.game;
    for (const side of ["home", "away"]) {
      const opponent = sideOpponent(side);
      const opponentPitcherId = pitcherId(game.pitchers?.[opponent]);
      for (const batter of game.lineups?.[side] || []) {
        const id = batter?.id ?? batter?.mlbId ?? batter?.batter_id;
        if (!id || Number(id) <= 0) continue;
        const key = `${gameId(current)}:${id}`;
        if (keys.has(key)) continue;
        keys.add(key);
        rows.push({
          game_id: gameId(current),
          batter_id: String(id),
          side,
          snapshot_captured_at: snapshot.capturedAt,
          game_date: game.metadata?.date ?? null,
          team: game.metadata?.[side === "home" ? "homeTeam" : "awayTeam"] ?? null,
          opponent: game.metadata?.[opponent === "home" ? "homeTeam" : "awayTeam"] ?? null,
          batting_order: batter.batting_order ?? null,
          position: batter.position ?? null,
          bat_side: batter.bat_side ?? null,
          opposing_pitcher_id: opponentPitcherId,
          avg: batter.avg ?? null,
          obp: batter.obp ?? null,
          slg: batter.slg ?? null,
          ops: batter.ops ?? null,
          woba: batter.woba ?? null,
          iso: batter.iso ?? null,
          pa: batter.pa ?? null,
          home_runs: batter.home_runs ?? batter.hr ?? null,
          strikeout_pct: batter.strikeout_pct ?? batter.kPct ?? null,
          walk_pct: batter.walk_pct ?? null,
          last7_avg: batter.last7_avg ?? null,
          last7_ops: batter.last7_ops ?? null,
          last7_slg: batter.last7_slg ?? null,
          last7_total_bases: batter.last7_total_bases ?? null,
          ops_vs_rhp: batter.ops_vs_rhp ?? null,
          ops_vs_lhp: batter.ops_vs_lhp ?? null,
          k_pct_vs_rhp: batter.k_pct_vs_rhp ?? null,
          k_pct_vs_lhp: batter.k_pct_vs_lhp ?? null,
          contact_pct_vs_rhp: batter.contact_pct_vs_rhp ?? null,
          contact_pct_vs_lhp: batter.contact_pct_vs_lhp ?? null,
          ...liveBatterTarget(current, side, String(id)),
          final_game_status: isFinal(current) ? current.game_result?.gameStatus ?? null : null
        });
      }
    }
  }
  return rows;
}
var PROPS_HEADERS = ["game_id", "pitcher_id", "side", "game_date", "team", "prop_line", "over_odds", "under_odds", "sportsbook", "source", "timestamp"];
function buildPitcherPropsRows(games) {
  const keys = /* @__PURE__ */ new Set();
  const rows = [];
  for (const { current, snapshot } of snapshotPairs(games)) {
    const game = snapshot.game;
    for (const side of ["home", "away"]) {
      const pitcher = game.pitchers?.[side];
      if (!validPitcher(pitcher) || pitcher.strikeoutProp === null || pitcher.strikeoutProp === void 0) continue;
      const id = pitcherId(pitcher);
      const key = `${gameId(current)}:${id}`;
      if (keys.has(key)) continue;
      keys.add(key);
      rows.push({
        game_id: gameId(current),
        pitcher_id: id,
        side,
        game_date: game.metadata?.date ?? null,
        team: game.metadata?.[side === "home" ? "homeTeam" : "awayTeam"] ?? null,
        prop_line: pitcher.strikeoutProp,
        over_odds: pitcher.strikeoutPropOverOdds ?? null,
        under_odds: pitcher.strikeoutPropUnderOdds ?? null,
        sportsbook: pitcher.strikeoutPropBook ?? null,
        source: pitcher.strikeoutPropSource ?? null,
        timestamp: snapshot.capturedAt
      });
    }
  }
  return rows;
}
var generatePitcherGameDatasetCSV = (games) => toCsv(PITCHER_HEADERS, buildPitcherGameRows(games));
var generateGameDatasetCSV = (games) => toCsv(GAME_HEADERS, buildGameRows(games));
var generateBatterGameDatasetCSV = (games) => toCsv(BATTER_HEADERS, buildBatterGameRows(games));
var generatePitcherPropsDatasetCSV = (games) => toCsv(PROPS_HEADERS, buildPitcherPropsRows(games));

// src/utils/lineupMetrics.ts
function finiteNumber(value) {
  if (value === null || value === void 0 || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function calculateOpponentLineupKPct(lineup, pitcherHand) {
  if (!Array.isArray(lineup) || lineup.length === 0) return null;
  const isLeftHanded = pitcherHand === "L";
  let weightedTotal = 0;
  let totalPlateAppearances = 0;
  for (const batter of lineup) {
    const splitKPct = finiteNumber(isLeftHanded ? batter?.k_pct_vs_lhp : batter?.k_pct_vs_rhp);
    const strikeoutPct = finiteNumber(batter?.strikeout_pct);
    const legacyKPct = finiteNumber(batter?.kPct);
    const kPct = splitKPct ?? strikeoutPct ?? legacyKPct;
    if (kPct === null || kPct <= 0) continue;
    const rawPlateAppearances = finiteNumber(batter?.pa);
    const plateAppearances = rawPlateAppearances !== null && rawPlateAppearances > 0 ? rawPlateAppearances : 50;
    weightedTotal += kPct * plateAppearances;
    totalPlateAppearances += plateAppearances;
  }
  return totalPlateAppearances > 0 ? weightedTotal / totalPlateAppearances : null;
}

// src/utils/gameStatus.ts
function isFinalGameStatus2(status) {
  const normalized = String(status ?? "").trim().toLowerCase();
  return normalized.includes("final") || normalized === "game over" || // Fase 4, punto 6: `=== "completed early"` no capturaba la variante real que
  // devuelve la API de MLB, "Completed Early: Rain" (con motivo incluido) — la
  // misma que este archivo pone de ejemplo más arriba. Encontrado escribiendo
  // pruebas (gameStatus.test.ts) al confirmar el propio ejemplo del comentario.
  normalized.includes("completed early") || normalized === "completed";
}

// src/datasets/klabTrainingDataset.ts
var KLAB_ADMIN_COLUMNS = [
  "game_id",
  "pitcher_id",
  "pitcher_name",
  "game_date",
  "snapshot_captured_at",
  "team",
  "opponent",
  "side"
];
var KLAB_FEATURE_COLUMNS = [
  "pitcher_k_pct",
  "pitcher_so_rate",
  "pitcher_swstr_pct",
  "pitcher_csw_pct",
  "pitcher_bb_pct",
  "pitcher_fip",
  "pitcher_xfip",
  "pitcher_siera",
  "pitcher_xera",
  "pitcher_last5_ks_avg",
  "pitcher_last5_ip_avg",
  "pitcher_last5_bf_avg",
  "pitcher_last5_pitch_count_avg",
  "projected_pitches",
  "projected_innings",
  "pitches_last_start",
  "pitches_last_3_starts",
  "days_since_last_start",
  "opponent_lineup_k_pct",
  "opponent_offense_ops",
  "opponent_offense_woba",
  "opponent_offense_xwoba",
  "park_factor_k",
  "weather_temp",
  "weather_wind_speed"
];
var KLAB_BENCHMARK_COLUMNS = ["projected_strikeouts"];
var KLAB_TARGET_COLUMNS = ["actual_k"];
var KLAB_COLUMNS = [
  ...KLAB_ADMIN_COLUMNS,
  ...KLAB_FEATURE_COLUMNS,
  ...KLAB_BENCHMARK_COLUMNS,
  ...KLAB_TARGET_COLUMNS
];
var ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
var POSTGAME_COLUMNS = /* @__PURE__ */ new Set([
  "actual_ip",
  "actual_bf",
  "actual_pitches",
  "actual_er",
  "home_score",
  "away_score",
  "winner",
  "final_game_status",
  "game_status",
  "game_result"
]);
function validateKlabDateRange(startDate, endDate) {
  if (typeof startDate !== "string" || !ISO_DATE.test(startDate) || (/* @__PURE__ */ new Date(`${startDate}T00:00:00Z`)).toISOString().slice(0, 10) !== startDate) {
    throw new Error("start_date es obligatoria y debe usar el formato YYYY-MM-DD");
  }
  if (typeof endDate !== "string" || !ISO_DATE.test(endDate) || (/* @__PURE__ */ new Date(`${endDate}T00:00:00Z`)).toISOString().slice(0, 10) !== endDate) {
    throw new Error("end_date es obligatoria y debe usar el formato YYYY-MM-DD");
  }
  if (startDate > endDate) throw new Error("start_date debe ser menor o igual que end_date");
  return { startDate, endDate };
}
function csvValue2(value) {
  if (value === null || value === void 0) return "";
  return `"${String(value).replace(/"/g, '""')}"`;
}
function toCsv2(rows) {
  return [
    KLAB_COLUMNS.join(","),
    ...rows.map((row) => KLAB_COLUMNS.map((column) => csvValue2(row[column])).join(","))
  ].join("\n");
}
function finiteNumber2(value) {
  if (value === null || value === void 0 || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function anomalyFor(row, column, min, max) {
  const value = finiteNumber2(row[column]);
  if (value === null || value >= min && value <= max) return null;
  return {
    game_id: String(row.game_id),
    pitcher_id: String(row.pitcher_id),
    column,
    value,
    reason: `fuera del rango de revisi\xF3n ${min}..${max}`
  };
}
function buildKlabTrainingDataset(allGames, rawStartDate, rawEndDate) {
  const { startDate, endDate } = validateKlabDateRange(rawStartDate, rawEndDate);
  const rangeGames = allGames.filter((game) => {
    const date = game?.metadata?.date;
    return typeof date === "string" && date >= startDate && date <= endDate;
  });
  const snapshots = getPregameSnapshotsForGames(rangeGames);
  const pitcherNames = /* @__PURE__ */ new Map();
  for (const game of rangeGames) {
    const id = String(game?.id || game?.metadata?.id || "");
    const pregame = snapshots.get(id)?.game;
    for (const side of ["home", "away"]) {
      const pitcher = pregame?.pitchers?.[side];
      const pitcherId2 = pitcher?.pitcherId ?? pitcher?.mlbId ?? pitcher?.id;
      if (pitcherId2 !== null && pitcherId2 !== void 0 && pitcher?.name) {
        pitcherNames.set(`${id}:${String(pitcherId2)}`, String(pitcher.name));
      }
    }
  }
  const sourceRows = buildPitcherGameRows(rangeGames).map((row) => ({
    ...row,
    pitcher_name: pitcherNames.get(`${String(row.game_id)}:${String(row.pitcher_id)}`) ?? null
  }));
  const gamesWithoutPregameSnapshot = rangeGames.filter((game) => {
    const id = String(game?.id || game?.metadata?.id || "");
    return !snapshots.has(id);
  }).length;
  let discardedWithoutActualK = 0;
  let discardedInvalidActualK = 0;
  const eligibleRows = [];
  for (const source of sourceRows) {
    if (source.actual_k === null || source.actual_k === void 0 || source.actual_k === "") {
      discardedWithoutActualK += 1;
      continue;
    }
    const actualK = finiteNumber2(source.actual_k);
    if (actualK === null || actualK < 0) {
      discardedInvalidActualK += 1;
      continue;
    }
    const row = {};
    for (const column of KLAB_COLUMNS) row[column] = column === "actual_k" ? actualK : source[column] ?? null;
    eligibleRows.push(row);
  }
  eligibleRows.sort(
    (a, b) => String(a.game_date).localeCompare(String(b.game_date)) || String(a.snapshot_captured_at).localeCompare(String(b.snapshot_captured_at)) || String(a.game_id).localeCompare(String(b.game_id)) || String(a.pitcher_id).localeCompare(String(b.pitcher_id))
  );
  const seen = /* @__PURE__ */ new Set();
  const duplicateKeys = [];
  const rows = [];
  for (const row of eligibleRows) {
    const key = `${row.game_id}:${row.pitcher_id}`;
    if (seen.has(key)) {
      duplicateKeys.push(key);
      continue;
    }
    seen.add(key);
    rows.push(row);
  }
  const anomalies = rows.flatMap((row) => [
    anomalyFor(row, "projected_pitches", 15, 130),
    anomalyFor(row, "projected_innings", 0, 9),
    anomalyFor(row, "pitcher_k_pct", 0, 60),
    anomalyFor(row, "opponent_lineup_k_pct", 0, 60)
  ].filter((value) => value !== null));
  const outOfRangeRows = rows.filter((row) => String(row.game_date) < startDate || String(row.game_date) > endDate).length;
  const leakageColumns = KLAB_FEATURE_COLUMNS.filter((column) => POSTGAME_COLUMNS.has(column));
  const uniquePitchers = new Set(rows.map((row) => String(row.pitcher_id)));
  const candidatePitchers = new Set(sourceRows.map((row) => String(row.pitcher_id)));
  const uniqueGames = new Set(rangeGames.map((game) => String(game?.id || game?.metadata?.id || "")).filter(Boolean));
  const outputFilename = `KLAB_PITCHER_TRAINING_DATASET_${startDate}_${endDate}.csv`;
  const historicalGames = [...snapshots.values()].filter((snapshot) => snapshot?.audit?.classification === "A");
  const gamesWithRows = new Set(sourceRows.map((row) => String(row.game_id)));
  const gamesWithActualK = new Set(rows.map((row) => String(row.game_id)));
  const historicalFunnel = historicalGames.length ? {
    manifestGames: historicalGames.length,
    snapshotsRecovered: historicalGames.length,
    validSnapshots: historicalGames.length,
    gamesWithFinalMatch: gamesWithRows.size,
    gamesWithActualK: gamesWithActualK.size,
    finalPitcherGameObservations: rows.length
  } : null;
  return {
    rows,
    csv: toCsv2(rows),
    report: {
      startDate,
      endDate,
      outputFilename,
      totalGames: uniqueGames.size,
      totalPitchers: uniquePitchers.size,
      candidatePitchers: candidatePitchers.size,
      candidateRows: sourceRows.length,
      finalRows: rows.length,
      observationsWithActualK: rows.length,
      discardedWithoutActualK,
      discardedInvalidActualK,
      duplicateKeys,
      outOfRangeRows,
      gamesWithoutPregameSnapshot,
      rowsWithPregameSnapshot: sourceRows.length,
      leakageColumns,
      anomalies,
      featureColumns: [...KLAB_FEATURE_COLUMNS, "side"],
      administrativeColumns: [...KLAB_ADMIN_COLUMNS],
      benchmarkColumns: [...KLAB_BENCHMARK_COLUMNS],
      targetColumns: [...KLAB_TARGET_COLUMNS],
      historicalFunnel
    }
  };
}

// src/routes/cronPipelineRoutes.ts
import fs6 from "fs";
import path5 from "path";
import { execFile } from "child_process";
import { promisify } from "util";

// src/services/pipelineRunLog.ts
import fs4 from "fs";
import path4 from "path";
var RUN_LOG_PATH = path4.join(process.cwd(), "pipeline_runs.json");
var MAX_RUNS_KEPT = 500;
function readAllRuns() {
  try {
    if (!fs4.existsSync(RUN_LOG_PATH)) return [];
    const raw = fs4.readFileSync(RUN_LOG_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("[PipelineRunLog] Error leyendo pipeline_runs.json, se empieza de cero:", err);
    return [];
  }
}
function writeAllRuns(runs) {
  try {
    const trimmed = runs.slice(-MAX_RUNS_KEPT);
    fs4.writeFileSync(RUN_LOG_PATH, JSON.stringify(trimmed, null, 2));
  } catch (err) {
    console.error("[PipelineRunLog] Error escribiendo pipeline_runs.json:", err);
  }
}
function createRunRecorder(opts) {
  const record = {
    runId: `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    trigger: opts.trigger,
    date: opts.date,
    rangeStart: opts.rangeStart,
    rangeEnd: opts.rangeEnd,
    startedAt: (/* @__PURE__ */ new Date()).toISOString(),
    finishedAt: null,
    steps: [],
    newGames: 0,
    errors: 0,
    validation: null
  };
  function persist() {
    const runs = readAllRuns();
    const idx = runs.findIndex((r) => r.runId === record.runId);
    if (idx >= 0) runs[idx] = record;
    else runs.push(record);
    writeAllRuns(runs);
  }
  persist();
  return {
    runId: record.runId,
    startStep(step) {
      const entry = { step, startedAt: (/* @__PURE__ */ new Date()).toISOString(), finishedAt: null, status: "skipped" };
      record.steps.push(entry);
      persist();
      return entry;
    },
    finishStep(entry, status, details, error) {
      entry.finishedAt = (/* @__PURE__ */ new Date()).toISOString();
      entry.status = status;
      if (details !== void 0) entry.details = details;
      if (error) {
        entry.error = error;
        record.errors++;
      }
      persist();
    },
    setNewGames(count) {
      record.newGames = count;
      persist();
    },
    setValidation(validation) {
      record.validation = validation;
      persist();
    },
    finish() {
      record.finishedAt = (/* @__PURE__ */ new Date()).toISOString();
      persist();
      return record;
    }
  };
}
function getRecentRuns(limit2 = 20) {
  const runs = readAllRuns();
  return runs.slice(-limit2).reverse();
}

// validate_dataset.ts
import fs5 from "fs";
import { parse as parse2 } from "csv-parse/sync";
var NULL_LIKE = /* @__PURE__ */ new Set(["", "n/a", "null", "nan", "undefined"]);
function isNullLike(v) {
  if (v === void 0) return true;
  return NULL_LIKE.has(v.trim().toLowerCase());
}
var BLOCK_RULES = [
  { name: "identificadores", test: (c) => ["game_id", "date", "player_name", "team", "batting_order", "bat_side", "position", "opposing_pitcher", "opposing_pitcher_hand", "hora", "equipo_home", "equipo_visitante", "estadio"].includes(c) },
  { name: "pitcher_props_apuestas", test: (c) => /strikeout_prop|total_bases_prop/.test(c) },
  { name: "pitcher_estandar_pit", test: (c) => /^(home|away)_pitcher_(era|whip|kPct|bbPct|wins|losses|ip|strikeouts|gs|ip_avg_start|stats_source)$/.test(c), critical: true },
  { name: "savant_sin_corte_pit", test: (c) => /^(home|away)_pitcher_(xera|hardhit_pct|barrel_pct|swstr_pct|csw_pct|fastball_pct|slider_pct|curve_pct|changeup_pct|splitter_pct)$/.test(c) || /^(home|away)_catcher_framing_runs$/.test(c) },
  { name: "savant_asof_metadata", test: (c) => c === "savant_metrics_asof_date" },
  { name: "pitcher_avanzado_otro", test: (c) => /^(home|away)_pitcher_/.test(c) },
  { name: "bullpen", test: (c) => /^(home|away)_bullpen_|^bullpen_/.test(c) },
  { name: "ofensa_equipo", test: (c) => /^ofensa_|^(home|away)_offense_kPct$/.test(c) },
  { name: "ofensa_avanzada_savant", test: (c) => /^(home|away)_offense_(woba|xwoba|hardhit_pct|barrel_pct)$/.test(c) },
  { name: "ofensa_avanzada_otro", test: (c) => /^(home|away)_offense_|^(home|away)_projected_lineup_/.test(c) },
  { name: "clima", test: (c) => /^weather_/.test(c) },
  { name: "splits_vs_mano", test: (c) => /_splits_vs_/.test(c) },
  { name: "fatiga", test: (c) => /pitcher_rest$|pitches_last|_ip_3d$|_ip_7d/.test(c) },
  { name: "bateador_stats", test: (c) => ["avg", "obp", "slg", "ops", "woba", "iso", "pa", "hits", "doubles", "triples", "home_runs", "strikeout_pct", "walk_pct"].includes(c) || /^last7_|_vs_rhp$|_vs_lhp$|^whiff_pct$|^chase_pct$/.test(c) },
  { name: "pitcher_allowed_vs_mano", test: (c) => /^pitcher_allowed_/.test(c) },
  { name: "modelo_features_diff", test: (c) => /^diff_|^line_source$/.test(c) },
  { name: "resultados_juego", test: (c) => /^resultado_|^game_status$|^home_score$|^away_score$|^winner$/.test(c), critical: true }
];
function classify(col) {
  for (const rule of BLOCK_RULES) {
    if (rule.test(col)) return { name: rule.name, critical: !!rule.critical };
  }
  return { name: "otros_sin_clasificar", critical: false };
}
var FROZEN_STREAK_MIN = 3;
var SEASON_FIELDS = ["era", "whip", "wins", "losses", "ip", "strikeouts", "gs"];
function validateDataset(csvPath, options = {}) {
  const maxNullPct = options.maxNullPct ?? 50;
  const strict = options.strict ?? false;
  const shouldLog = options.log ?? true;
  const log = (...args) => {
    if (shouldLog) console.log(...args);
  };
  const logErr = (...args) => {
    if (shouldLog) console.error(...args);
  };
  log(`
=== validate_dataset.ts \u2014 validando ${csvPath} ===
`);
  const raw = fs5.readFileSync(csvPath, "utf-8");
  const firstLine = raw.split("\n")[0].replace(/\r$/, "");
  const rawHeaders = firstLine.split(",");
  let failures = 0;
  const warnings = [];
  {
    const seen = /* @__PURE__ */ new Set();
    const dupes = /* @__PURE__ */ new Set();
    for (const h of rawHeaders) {
      if (seen.has(h)) dupes.add(h);
      seen.add(h);
    }
    log(`--- 1. Encabezados ---`);
    log(`Total columnas: ${rawHeaders.length}`);
    if (dupes.size > 0) {
      logErr(`FALLO: columnas duplicadas: ${Array.from(dupes).join(", ")}`);
      failures++;
    } else {
      log(`OK: no hay columnas duplicadas.`);
    }
    log();
  }
  const records = parse2(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true
  });
  const columns = Object.keys(records[0] || {});
  log(`Filas de datos: ${records.length}
`);
  const blockStats = /* @__PURE__ */ new Map();
  for (const col of columns) {
    const { name, critical } = classify(col);
    if (!blockStats.has(name)) blockStats.set(name, { total: 0, nulls: 0, critical });
    const stat = blockStats.get(name);
    for (const row of records) {
      stat.total++;
      if (isNullLike(row[col])) stat.nulls++;
    }
  }
  log(`--- 2. % de nulos por bloque de columnas (umbral de aviso: ${maxNullPct}%) ---`);
  const sortedBlocks = Array.from(blockStats.entries()).sort((a, b) => b[1].nulls / b[1].total - a[1].nulls / a[1].total);
  for (const [name, stat] of sortedBlocks) {
    const pct = stat.total > 0 ? 100 * stat.nulls / stat.total : 0;
    const flag = pct >= maxNullPct ? stat.critical ? " <-- CR\xCDTICO" : " <-- aviso" : "";
    log(`  ${name.padEnd(28)} ${pct.toFixed(1)}% nulos${flag}`);
    if (pct >= maxNullPct) {
      const msg = `${name}: ${pct.toFixed(1)}% de nulos (>= ${maxNullPct}%)`;
      if (stat.critical) {
        logErr(`FALLO: bloque cr\xEDtico con demasiados nulos \u2014 ${msg}`);
        failures++;
      } else {
        warnings.push(msg);
      }
    }
  }
  log();
  log(`--- 3. Duplicados ---`);
  if (columns.includes("game_id") && columns.includes("player_name")) {
    const rowKeyCounts = /* @__PURE__ */ new Map();
    for (const row of records) {
      const key = `${row.game_id}|${row.player_name}`;
      rowKeyCounts.set(key, (rowKeyCounts.get(key) || 0) + 1);
    }
    const dupedRows = Array.from(rowKeyCounts.entries()).filter(([, n2]) => n2 > 1);
    if (dupedRows.length > 0) {
      logErr(`FALLO: ${dupedRows.length} combinaciones (game_id, player_name) duplicadas. Ejemplos: ${dupedRows.slice(0, 5).map(([k]) => k).join("; ")}`);
      failures++;
    } else {
      log(`OK: no hay filas (game_id, player_name) duplicadas.`);
    }
  }
  if (columns.includes("game_id") && columns.includes("date")) {
    const idToDates = /* @__PURE__ */ new Map();
    for (const row of records) {
      if (!idToDates.has(row.game_id)) idToDates.set(row.game_id, /* @__PURE__ */ new Set());
      idToDates.get(row.game_id).add(row.date);
    }
    const inconsistent = Array.from(idToDates.entries()).filter(([, dates]) => dates.size > 1);
    if (inconsistent.length > 0) {
      logErr(`FALLO: ${inconsistent.length} game_id aparecen bajo m\xE1s de una fecha en este CSV (ver Fase 2, punto 2). Ejemplos: ${inconsistent.slice(0, 5).map(([id, dates]) => `${id}=[${Array.from(dates).join(",")}]`).join("; ")}`);
      failures++;
    } else {
      log(`OK: cada game_id tiene una sola fecha en este CSV.`);
    }
  }
  log();
  const statusCol = columns.includes("resultado_estado") ? "resultado_estado" : columns.includes("game_status") ? "game_status" : null;
  log(`--- 4. Distribuci\xF3n de estado del juego ${statusCol ? `(${statusCol})` : ""} ---`);
  if (statusCol) {
    const counts = /* @__PURE__ */ new Map();
    for (const row of records) {
      const v = row[statusCol] || "(vac\xEDo)";
      counts.set(v, (counts.get(v) || 0) + 1);
    }
    for (const [status, n2] of Array.from(counts.entries()).sort((a, b) => b[1] - a[1])) {
      log(`  ${status.padEnd(20)} ${n2} filas (${(100 * n2 / records.length).toFixed(1)}%)`);
    }
  } else {
    log(`(no se encontr\xF3 columna resultado_estado ni game_status en este CSV)`);
  }
  log();
  log(`--- 5. Rachas congeladas (stats de temporada del lanzador repetidas 3+ veces seguidas) ---`);
  function detectFrozenStreaks(side) {
    const nameCol = `${side}_pitcher`;
    const statusOk = (row) => {
      const status = (row[statusCol || ""] || "").toLowerCase();
      return status.includes("final") || status === "game over" || status === "completed" || status === "completed early";
    };
    const requiredCols = [nameCol, "date", ...SEASON_FIELDS.map((f) => `${side}_pitcher_${f}`)];
    if (!requiredCols.every((c) => columns.includes(c))) return { pitchersWithStreaks: 0, totalStreaks: 0 };
    const byPitcher = /* @__PURE__ */ new Map();
    for (const row of records) {
      const name = row[nameCol];
      if (!name || name === "Por definir" || name === "TBD") continue;
      if (statusCol && !statusOk(row)) continue;
      const tuple = SEASON_FIELDS.map((f) => row[`${side}_pitcher_${f}`] ?? "").join("|");
      if (!byPitcher.has(name)) byPitcher.set(name, []);
      byPitcher.get(name).push({ date: row.date, tuple });
    }
    let pitchersWithStreaks = 0;
    let totalStreaks = 0;
    for (const [name, entries] of byPitcher) {
      entries.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
      let runLen = 1;
      let foundInThisPitcher = false;
      for (let i = 1; i < entries.length; i++) {
        if (entries[i].tuple === entries[i - 1].tuple && entries[i].tuple.replace(/\|/g, "") !== "") {
          runLen++;
          if (runLen === FROZEN_STREAK_MIN) {
            totalStreaks++;
            foundInThisPitcher = true;
            logErr(`FALLO: racha congelada \u2014 ${side} pitcher "${name}" tiene ${runLen}+ valores id\xE9nticos de (${SEASON_FIELDS.join(",")}) en fechas consecutivas terminando en ${entries[i].date}.`);
          }
        } else {
          runLen = 1;
        }
      }
      if (foundInThisPitcher) pitchersWithStreaks++;
    }
    return { pitchersWithStreaks, totalStreaks };
  }
  const homeStreaks = detectFrozenStreaks("home");
  const awayStreaks = detectFrozenStreaks("away");
  const totalFrozenStreaks = homeStreaks.totalStreaks + awayStreaks.totalStreaks;
  if (totalFrozenStreaks > 0) {
    logErr(`FALLO: ${totalFrozenStreaks} racha(s) congelada(s) detectadas (${homeStreaks.pitchersWithStreaks} lanzadores locales, ${awayStreaks.pitchersWithStreaks} visitantes). Este es el criterio de salida de la Fase 1 \u2014 deber\xEDa ser 0 para juegos ya reprocesados con la correcci\xF3n de stats=byDateRange.`);
    failures++;
  } else {
    log(`OK: 0 rachas congeladas en juegos finalizados.`);
  }
  log();
  log(`=== Resumen ===`);
  log(`Fallas cr\xEDticas: ${failures}`);
  log(`Avisos (bloques no cr\xEDticos con muchos nulos): ${warnings.length}`);
  if (warnings.length > 0) warnings.forEach((w) => log(`  - ${w}`));
  const passed = !(failures > 0 || strict && warnings.length > 0);
  log(passed ? `
validate_dataset.ts: OK.` : `
validate_dataset.ts: FALL\xD3.`);
  return { csvPath, failures, warnings, passed, rowCount: records.length, columnCount: columns.length };
}
function findLatestBattersCsv() {
  const files = fs5.readdirSync(process.cwd()).filter((f) => /^MLB_BATTERS_DATASET_.*\.csv$/i.test(f));
  if (files.length === 0) return null;
  files.sort();
  return files[files.length - 1];
}
var isMainModule = (() => {
  try {
    return import.meta.url === `file://${process.argv[1]}`;
  } catch {
    return false;
  }
})();
if (isMainModule) {
  const args = process.argv.slice(2);
  const positional = args.filter((a) => !a.startsWith("--"));
  const flags = /* @__PURE__ */ new Map();
  for (const a of args) {
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=");
      flags.set(k, v ?? "true");
    }
  }
  const strict = flags.get("strict") === "true";
  const maxNullPct = flags.has("max-null-pct") ? Number(flags.get("max-null-pct")) : 50;
  const csvPath = positional[0] || findLatestBattersCsv();
  if (!csvPath || !fs5.existsSync(csvPath)) {
    console.error(`No se encontr\xF3 un CSV para validar. Pasa la ruta expl\xEDcitamente:
  npx tsx validate_dataset.ts <ruta-al-csv>`);
    process.exit(1);
  }
  const result = validateDataset(csvPath, { maxNullPct, strict });
  process.exit(result.passed ? 0 : 1);
}

// src/routes/cronPipelineRoutes.ts
var execFileAsync = promisify(execFile);
async function runHarvestViaLoopback(port, date, timeoutMs = 15 * 60 * 1e3) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/harvest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date }),
      signal: controller.signal
    });
    if (!res.ok || !res.body) {
      throw new Error(`/api/harvest respondi\xF3 ${res.status} para ${date}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let lastDone = null;
    let lastEvent = null;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        const line = part.split("\n").find((l) => l.startsWith("data: "));
        if (!line) continue;
        try {
          const event = JSON.parse(line.slice("data: ".length));
          lastEvent = event;
          if (event.phase === "done") lastDone = event;
        } catch {
        }
      }
    }
    if (!lastDone) {
      throw new Error(`El stream de /api/harvest termin\xF3 sin emitir un evento "done" para ${date}. \xDAltimo evento visto: ${JSON.stringify(lastEvent)}`);
    }
    return {
      gamesCount: Array.isArray(lastDone.games) ? lastDone.games.length : 0,
      skippedGames: lastDone.skippedGames ?? 0,
      errorsCount: lastDone.errorsCount ?? 0,
      cached: Boolean(lastDone.cached)
    };
  } finally {
    clearTimeout(timer);
  }
}
async function runBackfillPitSubprocess(date, timeoutMs = 10 * 60 * 1e3) {
  const pythonBin = process.env.PYTHON_BIN || "python3";
  try {
    const { stdout } = await execFileAsync(
      pythonBin,
      ["backfill_pitcher_stats_pit.py", "--from_date", date],
      { cwd: process.cwd(), timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 }
    );
    return { exitCode: 0, stdoutTail: stdout.slice(-4e3) };
  } catch (err) {
    const stdoutTail = String(err?.stdout || "").slice(-4e3);
    const stderrTail = String(err?.stderr || "").slice(-2e3);
    throw new Error(`backfill_pitcher_stats_pit.py fall\xF3 (c\xF3digo ${err?.code ?? "?"}): ${stderrTail || stdoutTail || err?.message || err}`);
  }
}
async function exportBattersCsvForDate(date, deps) {
  const db2 = deps.readGamesDB();
  const games = db2[date] || [];
  const pitLookups = deps.readPitLookups();
  const enrichedGames = await deps.enrichGamesWithSavantBatterContact(await deps.enrichGamesWithTotalBasesProps(games));
  const csvContent = deps.generateBattersCSV(enrichedGames, pitLookups);
  const csvPath = path5.join(process.cwd(), `MLB_BATTERS_DATASET_${date}.csv`);
  fs6.writeFileSync(csvPath, csvContent);
  return csvPath;
}
function registerCronPipelineRoutes(app3, deps) {
  app3.post("/api/cron/run-daily-pipeline", async (req, res) => {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
      res.status(503).json({ error: "CRON_SECRET no est\xE1 configurado en el servidor; este endpoint est\xE1 deshabilitado por seguridad hasta que se configure." });
      return;
    }
    if (req.headers["x-cron-secret"] !== secret) {
      res.status(401).json({ error: "No autorizado." });
      return;
    }
    const date = typeof req.body?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.body.date) ? req.body.date : deps.getNewYorkDateString();
    const recorder = createRunRecorder({ date, trigger: "cron" });
    res.status(202).json({ accepted: true, runId: recorder.runId, date });
    (async () => {
      const extractStep = recorder.startStep("extraccion");
      try {
        const harvestResult = await runHarvestViaLoopback(deps.port, date);
        recorder.finishStep(extractStep, "ok", harvestResult);
        recorder.setNewGames(harvestResult.gamesCount);
      } catch (err) {
        recorder.finishStep(extractStep, "error", void 0, err instanceof Error ? err.message : String(err));
        recorder.finish();
        console.error(`[CronPipeline] ${recorder.runId}: extracci\xF3n fall\xF3, se aborta la corrida.`, err);
        return;
      }
      const backfillStep = recorder.startStep("backfill_pit");
      try {
        const backfillResult = await runBackfillPitSubprocess(date);
        recorder.finishStep(backfillStep, "ok", backfillResult);
      } catch (err) {
        recorder.finishStep(backfillStep, "error", void 0, err instanceof Error ? err.message : String(err));
        console.error(`[CronPipeline] ${recorder.runId}: backfill PIT fall\xF3, se contin\xFAa con el export de todos modos.`, err);
      }
      const exportStep = recorder.startStep("export_csv");
      let csvPath = null;
      try {
        csvPath = await exportBattersCsvForDate(date, deps);
        recorder.finishStep(exportStep, "ok", { csvPath });
      } catch (err) {
        recorder.finishStep(exportStep, "error", void 0, err instanceof Error ? err.message : String(err));
        recorder.finish();
        console.error(`[CronPipeline] ${recorder.runId}: export de CSV fall\xF3, se aborta la corrida.`, err);
        return;
      }
      const validateStep = recorder.startStep("validacion");
      try {
        const validation = validateDataset(csvPath, { log: false });
        recorder.setValidation({ failures: validation.failures, warnings: validation.warnings.length, passed: validation.passed });
        recorder.finishStep(
          validateStep,
          validation.passed ? "ok" : "error",
          { failures: validation.failures, warnings: validation.warnings, rowCount: validation.rowCount },
          validation.passed ? void 0 : `${validation.failures} falla(s) cr\xEDtica(s) \u2014 ver detalle en el paso`
        );
      } catch (err) {
        recorder.finishStep(validateStep, "error", void 0, err instanceof Error ? err.message : String(err));
      }
      recorder.finish();
      console.log(`[CronPipeline] ${recorder.runId}: corrida completa para ${date}.`);
    })().catch((err) => {
      console.error(`[CronPipeline] ${recorder.runId}: error inesperado no capturado en la corrida en segundo plano:`, err);
    });
  });
  app3.get("/api/cron/runs", (req, res) => {
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers["x-cron-secret"] !== secret) {
      res.status(401).json({ error: "No autorizado." });
      return;
    }
    const limit2 = Number(req.query.limit) || 20;
    res.json({ runs: getRecentRuns(limit2) });
  });
}

// server.ts
var envPaths = [
  path6.join(process.cwd(), ".env.local"),
  path6.join(process.cwd(), "env.local"),
  path6.join("/etc", "secrets", ".env.local"),
  path6.join("/etc", "secrets", "env.local")
];
for (const envPath of envPaths) {
  if (fs7.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    console.log(`[ENV] Cargado desde: ${envPath}`);
  }
}
dotenv.config();
for (const key in process.env) {
  if (typeof process.env[key] === "string") {
    process.env[key] = process.env[key].trim().replace(/[\r\n]/g, "");
  }
}
var app2 = express();
app2.use(express.json());
app2.get("/favicon.ico", (req, res) => {
  res.sendFile(path6.join(process.cwd(), "src", "favicon.svg"));
});
var PORT = Number(process.env.PORT || 3001);
var DB_PATH = path6.join(process.cwd(), "mlb_database.json");
var ERRORS_PATH = path6.join(process.cwd(), "mlb_errors.json");
var gamesDbCache = null;
var gamesDbCacheMtime = 0;
var oddsApiBackfillsInFlight = /* @__PURE__ */ new Set();
var harvestDatesInFlight = /* @__PURE__ */ new Set();
var firestoreRangeSyncInFlight = false;
var REVERIFY_COOLDOWN_DAYS = 3;
if (!fs7.existsSync(DB_PATH)) {
  fs7.writeFileSync(DB_PATH, JSON.stringify({}, null, 2));
}
if (!fs7.existsSync(ERRORS_PATH)) {
  fs7.writeFileSync(ERRORS_PATH, JSON.stringify([], null, 2));
}
function readGamesDB() {
  try {
    const stat = fs7.statSync(DB_PATH);
    if (gamesDbCache && stat.mtimeMs === gamesDbCacheMtime) {
      return gamesDbCache;
    }
    const raw = fs7.readFileSync(DB_PATH, "utf-8");
    gamesDbCache = JSON.parse(raw);
    gamesDbCacheMtime = stat.mtimeMs;
    return gamesDbCache || {};
  } catch (err) {
    console.error("Error reading database:", err);
    return {};
  }
}
var pitLookupsCache = null;
var pitLookupsCacheTime = 0;
function readPitLookups() {
  const now = Date.now();
  if (pitLookupsCache && now - pitLookupsCacheTime < 6e4) {
    return pitLookupsCache;
  }
  const result = {};
  try {
    const pPath = path6.join(process.cwd(), "pitcher_stats_pit.json");
    if (fs7.existsSync(pPath)) {
      const parsed = JSON.parse(fs7.readFileSync(pPath, "utf-8"));
      result.pitchers = parsed.pitchers || parsed;
    }
    const oPath = path6.join(process.cwd(), "offense_stats_pit.json");
    if (fs7.existsSync(oPath)) {
      const parsed = JSON.parse(fs7.readFileSync(oPath, "utf-8"));
      result.offense = parsed.offense || parsed;
    }
    const bPath = path6.join(process.cwd(), "boxscore_game_stats.json");
    if (fs7.existsSync(bPath)) {
      const parsed = JSON.parse(fs7.readFileSync(bPath, "utf-8"));
      result.boxscore = parsed.boxscore || parsed;
    }
    pitLookupsCache = result;
    pitLookupsCacheTime = now;
  } catch (err) {
    console.error("Error reading PIT lookups:", err);
  }
  return result;
}
function writeGamesDB(data) {
  try {
    fs7.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
    const stat = fs7.statSync(DB_PATH);
    gamesDbCache = data;
    gamesDbCacheMtime = stat.mtimeMs;
  } catch (err) {
    console.error("Error writing database:", err);
  }
}
function countLocalGames(db2) {
  return Object.values(db2).reduce((total, games) => total + (Array.isArray(games) ? games.length : 0), 0);
}
function mergeGamesIntoLocalDB(games) {
  const localDB = readGamesDB();
  const mergedDB = { ...localDB };
  for (const game of games) {
    const date = game?.metadata?.date;
    const id = String(game?.id || game?.metadata?.id || "");
    if (!date || !id) continue;
    const dateGames = Array.isArray(mergedDB[date]) ? [...mergedDB[date]] : [];
    const existingIndex = dateGames.findIndex((g) => String(g?.id || g?.metadata?.id || "") === id);
    if (existingIndex === -1) {
      dateGames.push(game);
    } else {
      const localGame = dateGames[existingIndex];
      dateGames[existingIndex] = pickSyncedGame(game, localGame);
    }
    mergedDB[date] = dateGames;
  }
  writeGamesDB(mergedDB);
  const dates = Object.keys(mergedDB).filter((date) => Array.isArray(mergedDB[date]) && mergedDB[date].length > 0);
  return { games: games.length, dates: dates.length };
}
function getGameTimestamp(game) {
  const value = game?.timestamp || game?.updatedAt || game?.createdAt;
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}
function getNewYorkDateString() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(/* @__PURE__ */ new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
function isPastGameDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && date < getNewYorkDateString();
}
var PITCHER_PROP_FIELDS = ["strikeoutProp", "strikeoutPropOverOdds", "strikeoutPropUnderOdds", "strikeoutPropBook", "strikeoutPropSource"];
var BATTER_PROP_FIELDS = ["totalBasesProp", "totalBasesPropOverOdds", "totalBasesPropUnderOdds", "totalBasesPropBook", "totalBasesPropSource", "totalBasesPropHitRate", "totalBasesPropHitRateDisplay"];
function hasStoredValue(value) {
  return value !== void 0 && value !== null && value !== "";
}
function copyStoredFields(target, source, fields) {
  if (!target || !source) return;
  for (const field of fields) if (hasStoredValue(source[field])) target[field] = source[field];
}
function findMatchingStoredPlayer(players, current) {
  const currentId = String(current?.id ?? current?.mlbId ?? "");
  if (currentId) {
    const byId = players.find((player) => String(player?.id ?? player?.mlbId ?? "") === currentId);
    if (byId) return byId;
  }
  const currentName = String(current?.name || "").trim().toLowerCase();
  return currentName ? players.find((player) => String(player?.name || "").trim().toLowerCase() === currentName) : void 0;
}
function preserveCapturedBettingData(targetGame, storedGame) {
  if (!targetGame || !storedGame) return false;
  let preserved = false;
  if (hasRealBettingLines2(storedGame)) {
    targetGame.betting_lines = storedGame.betting_lines;
    preserved = true;
  }
  for (const side of ["home", "away"]) {
    const storedPitcher = storedGame?.pitchers?.[side];
    const targetPitcher = targetGame?.pitchers?.[side];
    if (storedPitcher && targetPitcher && PITCHER_PROP_FIELDS.some((field) => hasStoredValue(storedPitcher[field]))) {
      copyStoredFields(targetPitcher, storedPitcher, PITCHER_PROP_FIELDS);
      preserved = true;
    }
    const storedPlayers = storedGame?.lineups?.[side] || [];
    for (const targetPlayer of targetGame?.lineups?.[side] || []) {
      const storedPlayer = findMatchingStoredPlayer(storedPlayers, targetPlayer);
      if (storedPlayer && BATTER_PROP_FIELDS.some((field) => hasStoredValue(storedPlayer[field]))) {
        copyStoredFields(targetPlayer, storedPlayer, BATTER_PROP_FIELDS);
        preserved = true;
      }
    }
  }
  if (Array.isArray(storedGame.line_movements) && storedGame.line_movements.length > 0) {
    targetGame.line_movements = storedGame.line_movements;
    preserved = true;
  }
  if (Array.isArray(storedGame.betting_history) && storedGame.betting_history.length > 0) {
    targetGame.betting_history = storedGame.betting_history;
    preserved = true;
  }
  return preserved;
}
function getCapturedBettingDataCount(game) {
  let count = hasRealBettingLines2(game) ? 1 : 0;
  for (const side of ["home", "away"]) {
    if (PITCHER_PROP_FIELDS.some((field) => hasStoredValue(game?.pitchers?.[side]?.[field]))) count += 1;
    for (const player of game?.lineups?.[side] || []) {
      if (BATTER_PROP_FIELDS.some((field) => hasStoredValue(player?.[field]))) count += 1;
    }
  }
  return count;
}
function buildBettingSnapshot(game) {
  const pitcherProps = ["home", "away"].map((side) => {
    const pitcher = game?.pitchers?.[side] || {};
    return {
      side,
      playerId: pitcher.pitcherId ?? null,
      player: pitcher.name ?? null,
      line: pitcher.strikeoutProp ?? null,
      overOdds: pitcher.strikeoutPropOverOdds ?? null,
      underOdds: pitcher.strikeoutPropUnderOdds ?? null,
      book: pitcher.strikeoutPropBook ?? null,
      source: pitcher.strikeoutPropSource ?? null
    };
  }).filter((prop) => hasStoredValue(prop.line));
  const batterProps = ["home", "away"].flatMap(
    (side) => (game?.lineups?.[side] || []).map((player) => ({
      side,
      playerId: player.id ?? player.mlbId ?? null,
      player: player.name ?? null,
      line: player.totalBasesProp ?? null,
      overOdds: player.totalBasesPropOverOdds ?? null,
      underOdds: player.totalBasesPropUnderOdds ?? null,
      book: player.totalBasesPropBook ?? null,
      source: player.totalBasesPropSource ?? null
    })).filter((prop) => hasStoredValue(prop.line))
  ).sort((a, b) => `${a.side}|${a.playerId}|${a.player}`.localeCompare(`${b.side}|${b.playerId}|${b.player}`));
  return {
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    bettingLines: hasRealBettingLines2(game) ? game.betting_lines : null,
    pitcherProps,
    batterProps
  };
}
function bettingSnapshotSignature(snapshot) {
  if (!snapshot) return "";
  const bettingLines = snapshot.bettingLines ? { ...snapshot.bettingLines } : null;
  if (bettingLines) delete bettingLines.lineMovementSummary;
  return JSON.stringify({ bettingLines, pitcherProps: snapshot.pitcherProps || [], batterProps: snapshot.batterProps || [] });
}
function appendBettingSnapshotIfChanged(game, storedGame) {
  const snapshot = buildBettingSnapshot(game);
  if (!snapshot.bettingLines && snapshot.pitcherProps.length === 0 && snapshot.batterProps.length === 0) return false;
  const history = [...storedGame?.betting_history || game?.betting_history || []];
  const previous = history[history.length - 1];
  if (previous && bettingSnapshotSignature(previous) === bettingSnapshotSignature(snapshot)) {
    game.betting_history = history;
    return false;
  }
  history.push(snapshot);
  game.betting_history = history;
  console.log(`[Odds History] Snapshot ${history.length} guardado para el juego ${game.id}.`);
  return true;
}
function getTheOddsApiPropsCount(game) {
  let count = 0;
  for (const side of ["home", "away"]) {
    if (game?.pitchers?.[side]?.strikeoutPropSource === "the_odds_api") count += 1;
    for (const player of game?.lineups?.[side] || []) {
      if (player?.totalBasesPropSource === "the_odds_api") count += 1;
    }
  }
  return count;
}
function getTheOddsApiPropsCountForGames(games) {
  return (games || []).reduce((total, game) => total + getTheOddsApiPropsCount(game), 0);
}
function maybeBackfillTheOddsApiForDate(date, dateGames) {
  if (!date || !Array.isArray(dateGames) || dateGames.length === 0) return;
  if (!process.env.ODDS_API_KEY) return;
  if (oddsApiBackfillsInFlight.has(date)) return;
  if (isPastGameDate(date)) return;
  const cacheFile = path6.join(process.cwd(), `odds_cache_${date}.json`);
  const hasOddsCache = fs7.existsSync(cacheFile);
  const apiPropsCount = getTheOddsApiPropsCountForGames(dateGames);
  if (hasOddsCache && apiPropsCount > 0) return;
  oddsApiBackfillsInFlight.add(date);
  const forceFirstOddsFetch = !hasOddsCache || apiPropsCount === 0;
  console.log(`[Odds Backfill] Iniciando verificacion de The Odds API para ${date}. Cache=${hasOddsCache}, apiProps=${apiPropsCount}.`);
  (async () => {
    try {
      let forceRefreshOdds = forceFirstOddsFetch;
      for (const game of dateGames) {
        const gameId2 = String(game?.id || game?.metadata?.id || "");
        if (!gameId2) continue;
        await updateSingleGameData(gameId2, date, forceRefreshOdds);
        forceRefreshOdds = false;
      }
      console.log(`[Odds Backfill] Completado para ${date}.`);
    } catch (err) {
      console.error(`[Odds Backfill] Error actualizando cuotas para ${date}:`, err);
    } finally {
      oddsApiBackfillsInFlight.delete(date);
    }
  })();
}
function getPitcherLast3DetailsCount(game) {
  const fields = ["last3Ks1", "last3Ks2", "last3Ks3", "last3Ip1", "last3Ip2", "last3Ip3", "last3Bf1", "last3Bf2", "last3Bf3"];
  let count = 0;
  for (const side of ["home", "away"]) {
    const pitching = game?.advanced_pitching?.[side] || {};
    for (const field of fields) {
      if (pitching[field] !== void 0 && pitching[field] !== null && pitching[field] !== "") count += 1;
    }
  }
  return count;
}
function pickSyncedGame(remoteGame, localGame) {
  const remoteBettingCount = getCapturedBettingDataCount(remoteGame);
  const localBettingCount = getCapturedBettingDataCount(localGame);
  if (localBettingCount > remoteBettingCount) return localGame;
  if (remoteBettingCount > localBettingCount) return remoteGame;
  const remotePropsCount = getTheOddsApiPropsCount(remoteGame);
  const localPropsCount = getTheOddsApiPropsCount(localGame);
  if (localPropsCount > remotePropsCount) return localGame;
  if (remotePropsCount > localPropsCount) return remoteGame;
  const remoteLast3Count = getPitcherLast3DetailsCount(remoteGame);
  const localLast3Count = getPitcherLast3DetailsCount(localGame);
  if (localLast3Count > remoteLast3Count) return localGame;
  if (remoteLast3Count > localLast3Count) return remoteGame;
  return getGameTimestamp(remoteGame) >= getGameTimestamp(localGame) ? remoteGame : localGame;
}
async function syncFirestoreToLocalDB(reason = "manual") {
  try {
    const firestoreGames = await loadAllGamesFromFirestore();
    if (!firestoreGames || firestoreGames.length === 0) {
      console.log(`[Firestore Sync] No se encontraron juegos en Firestore (${reason}).`);
      return { synced: false, games: 0, dates: 0 };
    }
    const { dates } = mergeGamesIntoLocalDB(firestoreGames);
    console.log(`[Firestore Sync] Sync completado (${reason}): ${firestoreGames.length} juegos remotos, ${dates} fechas locales.`);
    return { synced: true, games: firestoreGames.length, dates };
  } catch (error) {
    console.error(`[Firestore Sync] Error during sync:`, error);
    return { synced: false, games: 0, dates: 0 };
  }
}
function readErrorsDB() {
  try {
    const raw = fs7.readFileSync(ERRORS_PATH, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    console.error("Error reading errors database:", err);
    return [];
  }
}
function writeErrorsDB(errors) {
  try {
    fs7.writeFileSync(ERRORS_PATH, JSON.stringify(errors, null, 2));
  } catch (err) {
    console.error("Error writing errors database:", err);
  }
}
function validateGamePayload(game, errorsLog) {
  const gameId2 = game.id || "unknown";
  const gameErrors = [];
  const checkRange = (val, min, max, name, severity) => {
    if (val === "N/A") return;
    const num = Number(val);
    if (isNaN(num)) {
      gameErrors.push(`[${name}] Valor no num\xE9rico: '${val}'`);
      errorsLog.push({
        id: `err-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        gameId: gameId2,
        source: "Validator",
        message: `El campo ${name} tiene un valor no num\xE9rico: ${val}`,
        severity
      });
    } else if (num < min || num > max) {
      gameErrors.push(`[${name}] Valor ${num} fuera de rango l\xEDmite (${min} - ${max})`);
      errorsLog.push({
        id: `err-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        gameId: gameId2,
        source: "Validator",
        message: `Campo ${name} con valor ${num} fuera de rango esperado (${min} y ${max})`,
        severity
      });
    }
  };
  const checkEmpty = (val, name, severity) => {
    if (val === void 0 || val === null || String(val).trim() === "") {
      gameErrors.push(`[${name}] Campo vac\xEDo o nulo`);
      errorsLog.push({
        id: `err-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        gameId: gameId2,
        source: "Validator",
        message: `El campo requerido (${name}) est\xE1 ausente o vac\xEDo.`,
        severity
      });
    }
  };
  checkEmpty(game.metadata?.venue, "metadata.venue", "low");
  checkEmpty(game.pitchers?.home?.name, "pitchers.home.name", "medium");
  checkEmpty(game.pitchers?.away?.name, "pitchers.away.name", "medium");
  checkRange(game.pitchers?.home?.era, 0, 20, "pitchers.home.era", "medium");
  checkRange(game.pitchers?.home?.whip, 0.4, 4, "pitchers.home.whip", "medium");
  checkRange(game.pitchers?.home?.kPct, 0, 100, "pitchers.home.kPct", "low");
  checkRange(game.pitchers?.home?.bbPct, 0, 100, "pitchers.home.bbPct", "low");
  checkRange(game.pitchers?.away?.era, 0, 20, "pitchers.away.era", "medium");
  checkRange(game.pitchers?.away?.whip, 0.4, 4, "pitchers.away.whip", "medium");
  checkRange(game.pitchers?.away?.kPct, 0, 100, "pitchers.away.kPct", "low");
  checkRange(game.pitchers?.away?.bbPct, 0, 100, "pitchers.away.bbPct", "low");
  checkRange(game.offense?.home?.runsPerGame, 0, 15, "offense.home.runsPerGame", "medium");
  checkRange(game.offense?.home?.ops, 0.2, 1.5, "offense.home.ops", "medium");
  checkRange(game.offense?.away?.runsPerGame, 0, 15, "offense.away.runsPerGame", "medium");
  checkRange(game.offense?.away?.ops, 0.2, 1.5, "offense.away.ops", "medium");
  if (!game.lineups || !Array.isArray(game.lineups.home) || !Array.isArray(game.lineups.away)) {
    gameErrors.push(`[lineups] Alineaciones titulares incompletas o ausentes`);
    errorsLog.push({
      id: `err-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      gameId: gameId2,
      source: "Validator",
      message: `El campo lineups est\xE1 ausente o no contiene arreglos v\xE1lidos de jugadores.`,
      severity: "medium"
    });
  }
  return {
    isValid: gameErrors.length === 0,
    errors: gameErrors
  };
}
function injectPitStats(games) {
  const pitLookups = readPitLookups();
  if (!pitLookups || !pitLookups.pitchers) {
    console.log("[injectPitStats] No pitLookups or pitchers found!");
    return games;
  }
  const clonedGames = JSON.parse(JSON.stringify(games));
  for (const g of clonedGames) {
    const gameId2 = String(g.id);
    const pit = pitLookups.pitchers[gameId2];
    if (gameId2 === "823864") {
      console.log(`[injectPitStats] Game 823864: pit found? ${!!pit}`);
      if (pit) console.log(`[injectPitStats] pit.home.totalStrikeouts: ${pit.home?.totalStrikeouts}`);
    }
    if (pit?.home && g.pitchers?.home) {
      Object.assign(g.pitchers.home, {
        era: pit.home.era ?? null,
        whip: pit.home.whip ?? null,
        kPct: pit.home.kPct ?? null,
        bbPct: pit.home.bbPct ?? null,
        wins: pit.home.wins ?? null,
        losses: pit.home.losses ?? null,
        ip: pit.home.ip ?? null,
        totalStrikeouts: pit.home.totalStrikeouts ?? null,
        starts: pit.home.gs ?? null,
        pitcherStatsSource: "pit"
      });
    } else if (g.pitchers?.home) {
      g.pitchers.home.pitcherStatsSource = "raw_unverified";
    }
    if (pit?.away && g.pitchers?.away) {
      Object.assign(g.pitchers.away, {
        era: pit.away.era ?? null,
        whip: pit.away.whip ?? null,
        kPct: pit.away.kPct ?? null,
        bbPct: pit.away.bbPct ?? null,
        wins: pit.away.wins ?? null,
        losses: pit.away.losses ?? null,
        ip: pit.away.ip ?? null,
        totalStrikeouts: pit.away.totalStrikeouts ?? null,
        starts: pit.away.gs ?? null,
        pitcherStatsSource: "pit"
      });
    } else if (g.pitchers?.away) {
      g.pitchers.away.pitcherStatsSource = "raw_unverified";
    }
  }
  return clonedGames;
}
app2.get("/api/games", async (req, res) => {
  const { date } = req.query;
  if (!date || typeof date !== "string") {
    res.status(400).json({ error: "Par\xE1metro 'date' es requerido (formato YYYY-MM-DD)" });
    return;
  }
  let db2 = readGamesDB();
  let dateGames = db2[date] || [];
  if (dateGames.length > 0) {
    maybeBackfillTheOddsApiForDate(date, dateGames);
    res.json({ games: injectPitStats(dateGames), totalGames: countLocalGames(db2), dateExtracted: true });
    return;
  }
  const firestoreGames = await loadGamesByDateFromFirestore(date);
  if (firestoreGames.length > 0) {
    mergeGamesIntoLocalDB(firestoreGames);
    db2 = readGamesDB();
    dateGames = db2[date] || [];
  }
  maybeBackfillTheOddsApiForDate(date, dateGames);
  res.json({
    games: injectPitStats(dateGames),
    totalGames: countLocalGames(db2),
    dateExtracted: Object.prototype.hasOwnProperty.call(db2, date)
  });
});
function flattenGameToJSON(g) {
  const hSplitRhp = g.offensive_splits?.home?.vsRhp;
  const hSplitLhp = g.offensive_splits?.home?.vsLhp;
  const aSplitRhp = g.offensive_splits?.away?.vsRhp;
  const aSplitLhp = g.offensive_splits?.away?.vsLhp;
  const fPitchers = g.fatigue_metrics?.pitchers;
  const fBullpen = g.fatigue_metrics?.bullpen;
  const canUseActualKs = isFinalGameStatus2(g.game_result?.gameStatus);
  const canUseBettingLines = hasRealBettingLines2(g);
  return {
    game_id: g.id,
    date: g.metadata.date,
    time: g.metadata.time,
    home_team: g.metadata.homeTeam,
    away_team: g.metadata.awayTeam,
    venue: g.metadata.venue,
    home_pitcher: g.pitchers.home.name,
    home_pitcher_era: g.pitchers.home.era,
    home_pitcher_whip: g.pitchers.home.whip,
    home_pitcher_kPct: g.pitchers.home.kPct,
    home_pitcher_bbPct: g.pitchers.home.bbPct,
    home_pitcher_wins: g.pitchers.home.wins,
    home_pitcher_losses: g.pitchers.home.losses,
    home_pitcher_ip: g.pitchers.home.ip,
    away_pitcher: g.pitchers.away.name,
    away_pitcher_era: g.pitchers.away.era,
    away_pitcher_whip: g.pitchers.away.whip,
    away_pitcher_kPct: g.pitchers.away.kPct,
    away_pitcher_bbPct: g.pitchers.away.bbPct,
    away_pitcher_wins: g.pitchers.away.wins,
    away_pitcher_losses: g.pitchers.away.losses,
    away_pitcher_ip: g.pitchers.away.ip,
    home_bullpen_era: g.bullpen.home.era,
    home_bullpen_usage: g.bullpen.home.usageLast3Days,
    home_bullpen_ip_7d: g.bullpen.home.ipLast7Days,
    away_bullpen_era: g.bullpen.away.era,
    away_bullpen_usage: g.bullpen.away.usageLast3Days,
    away_bullpen_ip_7d: g.bullpen.away.ipLast7Days,
    home_offense_run_g: g.offense.home.runsPerGame,
    home_offense_ops: g.offense.home.ops,
    home_offense_obp: g.offense.home.obp,
    home_offense_slg: g.offense.home.slg,
    home_offense_kPct: g.lineups?.home && g.lineups.home.length > 0 ? parseFloat((g.lineups.home.reduce((sum, p) => sum + (p.strikeout_pct ?? p.kPct ?? 0), 0) / g.lineups.home.length).toFixed(2)) : null,
    away_offense_run_g: g.offense.away.runsPerGame,
    away_offense_ops: g.offense.away.ops,
    away_offense_obp: g.offense.away.obp,
    away_offense_slg: g.offense.away.slg,
    away_offense_kPct: g.lineups?.away && g.lineups.away.length > 0 ? parseFloat((g.lineups.away.reduce((sum, p) => sum + (p.strikeout_pct ?? p.kPct ?? 0), 0) / g.lineups.away.length).toFixed(2)) : null,
    weather_temp: g.weather?.temp ?? null,
    weather_humidity: g.weather?.humidity ?? null,
    weather_wind_speed: g.weather?.windSpeed ?? null,
    weather_wind_dir: g.weather?.windDirection ?? null,
    weather_pressure: g.weather?.pressure ?? null,
    weather_rain_prob: g.weather?.rainProbability ?? null,
    weather_sky: g.weather?.skyStatus ?? null,
    weather_apparent_temp: g.weather?.apparentTemp ?? null,
    home_splits_vs_rhp_avg: hSplitRhp?.avg ?? null,
    home_splits_vs_rhp_ops: hSplitRhp?.ops ?? null,
    home_splits_vs_rhp_obp: hSplitRhp?.obp ?? null,
    home_splits_vs_rhp_slg: hSplitRhp?.slg ?? null,
    home_splits_vs_rhp_rpg: hSplitRhp?.runsPerGame ?? null,
    home_splits_vs_rhp_hr: hSplitRhp?.hr ?? null,
    home_splits_vs_lhp_avg: hSplitLhp?.avg ?? null,
    home_splits_vs_lhp_ops: hSplitLhp?.ops ?? null,
    home_splits_vs_lhp_obp: hSplitLhp?.obp ?? null,
    home_splits_vs_lhp_slg: hSplitLhp?.slg ?? null,
    home_splits_vs_lhp_rpg: hSplitLhp?.runsPerGame ?? null,
    home_splits_vs_lhp_hr: hSplitLhp?.hr ?? null,
    away_splits_vs_rhp_avg: aSplitRhp?.avg ?? null,
    away_splits_vs_rhp_ops: aSplitRhp?.ops ?? null,
    away_splits_vs_rhp_obp: aSplitRhp?.obp ?? null,
    away_splits_vs_rhp_slg: aSplitRhp?.slg ?? null,
    away_splits_vs_rhp_rpg: aSplitRhp?.runsPerGame ?? null,
    away_splits_vs_rhp_hr: aSplitRhp?.hr ?? null,
    away_splits_vs_lhp_avg: aSplitLhp?.avg ?? null,
    away_splits_vs_lhp_ops: aSplitLhp?.ops ?? null,
    away_splits_vs_lhp_obp: aSplitLhp?.obp ?? null,
    away_splits_vs_lhp_slg: aSplitLhp?.slg ?? null,
    away_splits_vs_lhp_rpg: aSplitLhp?.runsPerGame ?? null,
    away_splits_vs_lhp_hr: aSplitLhp?.hr ?? null,
    home_pitcher_rest: fPitchers?.home?.daysSinceLastStart ?? null,
    home_pitcher_pitches_last: fPitchers?.home?.pitchesLastStart ?? null,
    home_pitcher_pitches_last_3: fPitchers?.home?.pitchesLast3Starts ?? null,
    away_pitcher_rest: fPitchers?.away?.daysSinceLastStart ?? null,
    away_pitcher_pitches_last: fPitchers?.away?.pitchesLastStart ?? null,
    away_pitcher_pitches_last_3: fPitchers?.away?.pitchesLast3Starts ?? null,
    home_bullpen_ip_3d: fBullpen?.home?.ipLast3Days ?? null,
    home_bullpen_ip_7d_recent: fBullpen?.home?.ipLast7Days ?? null,
    home_bullpen_relievers_yesterday: fBullpen?.home?.relieversUsedYesterday ?? null,
    home_bullpen_relievers_2d: fBullpen?.home?.relieversUsedLast2Days ?? null,
    home_bullpen_available: fBullpen?.home?.availableCount ?? null,
    away_bullpen_ip_3d: fBullpen?.away?.ipLast3Days ?? null,
    away_bullpen_ip_7d_recent: fBullpen?.away?.ipLast7Days ?? null,
    away_bullpen_relievers_yesterday: fBullpen?.away?.relieversUsedYesterday ?? null,
    away_bullpen_relievers_2d: fBullpen?.away?.relieversUsedLast2Days ?? null,
    away_bullpen_available: fBullpen?.away?.availableCount ?? null,
    home_pitcher_xera: g.advanced_pitching?.home?.xEra ?? null,
    home_pitcher_fip: g.advanced_pitching?.home?.fip ?? null,
    home_pitcher_xfip: g.advanced_pitching?.home?.xFip ?? null,
    home_pitcher_siera: g.advanced_pitching?.home?.siera ?? null,
    home_pitcher_hardhit_pct: g.advanced_pitching?.home?.hardHitPct ?? null,
    home_pitcher_barrel_pct: g.advanced_pitching?.home?.barrelPct ?? null,
    home_pitcher_gb_pct: g.advanced_pitching?.home?.groundBallPct ?? null,
    home_pitcher_fb_pct: g.advanced_pitching?.home?.flyBallPct ?? null,
    home_pitcher_so_rate: g.advanced_pitching?.home?.strikeoutRate ?? null,
    home_pitcher_bb_rate: g.advanced_pitching?.home?.walkRate ?? null,
    home_pitcher_swstr_pct: g.advanced_pitching?.home?.swingingStrikePct ?? null,
    home_pitcher_csw_pct: g.advanced_pitching?.home?.cswPct ?? null,
    home_pitcher_actual_ks: canUseActualKs ? g.advanced_pitching?.home?.actualStrikeouts ?? null : null,
    home_pitcher_last5_ks_avg: g.advanced_pitching?.home?.last5KsAvg ?? null,
    home_pitcher_last5_ks_std: g.advanced_pitching?.home?.last5KsStd ?? null,
    home_pitcher_last5_ip_avg: g.advanced_pitching?.home?.last5IpAvg ?? null,
    home_pitcher_last5_bf_avg: g.advanced_pitching?.home?.last5BfAvg ?? null,
    home_pitcher_last5_pitch_count_avg: g.advanced_pitching?.home?.last5PitchCountAvg ?? null,
    home_pitcher_last3_ks_1: g.advanced_pitching?.home?.last3Ks1 ?? null,
    home_pitcher_last3_ks_2: g.advanced_pitching?.home?.last3Ks2 ?? null,
    home_pitcher_last3_ks_3: g.advanced_pitching?.home?.last3Ks3 ?? null,
    home_pitcher_last3_ip_1: g.advanced_pitching?.home?.last3Ip1 ?? null,
    home_pitcher_last3_ip_2: g.advanced_pitching?.home?.last3Ip2 ?? null,
    home_pitcher_last3_ip_3: g.advanced_pitching?.home?.last3Ip3 ?? null,
    home_pitcher_last3_bf_1: g.advanced_pitching?.home?.last3Bf1 ?? null,
    home_pitcher_last3_bf_2: g.advanced_pitching?.home?.last3Bf2 ?? null,
    home_pitcher_last3_bf_3: g.advanced_pitching?.home?.last3Bf3 ?? null,
    home_pitcher_career_k_pct_vs_team: g.advanced_pitching?.home?.careerKPctVsTeam ?? null,
    home_pitcher_last3_vs_team_ks_avg: g.advanced_pitching?.home?.last3VsTeamKsAvg ?? null,
    home_pitcher_last3_vs_team_bf_avg: g.advanced_pitching?.home?.last3VsTeamBfAvg ?? null,
    home_pitcher_projected_pitches: g.advanced_pitching?.home?.projectedPitchCount ?? null,
    home_pitcher_projected_innings: g.advanced_pitching?.home?.projectedInnings ?? null,
    home_pitcher_bf_per_start: g.advanced_pitching?.home?.battersFacedPerStart ?? null,
    away_pitcher_xera: g.advanced_pitching?.away?.xEra ?? null,
    away_pitcher_fip: g.advanced_pitching?.away?.fip ?? null,
    away_pitcher_xfip: g.advanced_pitching?.away?.xFip ?? null,
    away_pitcher_siera: g.advanced_pitching?.away?.siera ?? null,
    away_pitcher_hardhit_pct: g.advanced_pitching?.away?.hardHitPct ?? null,
    away_pitcher_barrel_pct: g.advanced_pitching?.away?.barrelPct ?? null,
    away_pitcher_gb_pct: g.advanced_pitching?.away?.groundBallPct ?? null,
    away_pitcher_fb_pct: g.advanced_pitching?.away?.flyBallPct ?? null,
    away_pitcher_so_rate: g.advanced_pitching?.away?.strikeoutRate ?? null,
    away_pitcher_bb_rate: g.advanced_pitching?.away?.walkRate ?? null,
    away_pitcher_swstr_pct: g.advanced_pitching?.away?.swingingStrikePct ?? null,
    away_pitcher_csw_pct: g.advanced_pitching?.away?.cswPct ?? null,
    away_pitcher_actual_ks: canUseActualKs ? g.advanced_pitching?.away?.actualStrikeouts ?? null : null,
    away_pitcher_last5_ks_avg: g.advanced_pitching?.away?.last5KsAvg ?? null,
    away_pitcher_last5_ks_std: g.advanced_pitching?.away?.last5KsStd ?? null,
    away_pitcher_last5_ip_avg: g.advanced_pitching?.away?.last5IpAvg ?? null,
    away_pitcher_last5_bf_avg: g.advanced_pitching?.away?.last5BfAvg ?? null,
    away_pitcher_last5_pitch_count_avg: g.advanced_pitching?.away?.last5PitchCountAvg ?? null,
    away_pitcher_last3_ks_1: g.advanced_pitching?.away?.last3Ks1 ?? null,
    away_pitcher_last3_ks_2: g.advanced_pitching?.away?.last3Ks2 ?? null,
    away_pitcher_last3_ks_3: g.advanced_pitching?.away?.last3Ks3 ?? null,
    away_pitcher_last3_ip_1: g.advanced_pitching?.away?.last3Ip1 ?? null,
    away_pitcher_last3_ip_2: g.advanced_pitching?.away?.last3Ip2 ?? null,
    away_pitcher_last3_ip_3: g.advanced_pitching?.away?.last3Ip3 ?? null,
    away_pitcher_last3_bf_1: g.advanced_pitching?.away?.last3Bf1 ?? null,
    away_pitcher_last3_bf_2: g.advanced_pitching?.away?.last3Bf2 ?? null,
    away_pitcher_last3_bf_3: g.advanced_pitching?.away?.last3Bf3 ?? null,
    away_pitcher_career_k_pct_vs_team: g.advanced_pitching?.away?.careerKPctVsTeam ?? null,
    away_pitcher_last3_vs_team_ks_avg: g.advanced_pitching?.away?.last3VsTeamKsAvg ?? null,
    away_pitcher_last3_vs_team_bf_avg: g.advanced_pitching?.away?.last3VsTeamBfAvg ?? null,
    away_pitcher_projected_pitches: g.advanced_pitching?.away?.projectedPitchCount ?? null,
    away_pitcher_projected_innings: g.advanced_pitching?.away?.projectedInnings ?? null,
    away_pitcher_bf_per_start: g.advanced_pitching?.away?.battersFacedPerStart ?? null,
    // --- Derived: Primary/Secondary Pitch + Pitch Efficiency + Rest Status ---
    home_pitcher_primary_pitch: (() => {
      const ap = g.advanced_pitching?.home;
      if (!ap) return null;
      const arr = [
        { name: "fastball", pct: ap.fastballPct || 0 },
        { name: "slider", pct: ap.sliderPct || 0 },
        { name: "curve", pct: ap.curvePct || 0 },
        { name: "changeup", pct: ap.changeupPct || 0 },
        { name: "splitter", pct: ap.splitterPct || 0 }
      ].sort((a, b) => b.pct - a.pct);
      return arr[0].pct > 0 ? arr[0].name : null;
    })(),
    home_pitcher_primary_pitch_usage_pct: (() => {
      const ap = g.advanced_pitching?.home;
      if (!ap) return null;
      const arr = [ap.fastballPct || 0, ap.sliderPct || 0, ap.curvePct || 0, ap.changeupPct || 0, ap.splitterPct || 0].sort((a, b) => b - a);
      return arr[0] > 0 ? arr[0] : null;
    })(),
    home_pitcher_secondary_pitch: (() => {
      const ap = g.advanced_pitching?.home;
      if (!ap) return null;
      const arr = [
        { name: "fastball", pct: ap.fastballPct || 0 },
        { name: "slider", pct: ap.sliderPct || 0 },
        { name: "curve", pct: ap.curvePct || 0 },
        { name: "changeup", pct: ap.changeupPct || 0 },
        { name: "splitter", pct: ap.splitterPct || 0 }
      ].sort((a, b) => b.pct - a.pct);
      return arr[1].pct > 0 ? arr[1].name : null;
    })(),
    home_pitcher_secondary_pitch_usage_pct: (() => {
      const ap = g.advanced_pitching?.home;
      if (!ap) return null;
      const arr = [ap.fastballPct || 0, ap.sliderPct || 0, ap.curvePct || 0, ap.changeupPct || 0, ap.splitterPct || 0].sort((a, b) => b - a);
      return arr[1] > 0 ? arr[1] : null;
    })(),
    home_pitcher_pitches_per_bf_last5: (() => {
      const ap = g.advanced_pitching?.home;
      if (ap?.last5PitchCountAvg != null && ap?.last5BfAvg != null && ap.last5BfAvg > 0)
        return ap.last5PitchCountAvg / ap.last5BfAvg;
      return null;
    })(),
    home_pitcher_pitches_per_ip_last5: (() => {
      const ap = g.advanced_pitching?.home;
      if (ap?.last5PitchCountAvg != null && ap?.last5IpAvg != null && ap.last5IpAvg > 0)
        return ap.last5PitchCountAvg / ap.last5IpAvg;
      return null;
    })(),
    home_pitcher_avg_pitches_last5: g.advanced_pitching?.home?.last5PitchCountAvg ?? null,
    home_pitcher_rest_status: (() => {
      const days = fPitchers?.home?.daysSinceLastStart;
      if (days == null) return null;
      if (days <= 4) return "Short Rest";
      if (days === 5) return "Normal";
      return "Extra Rest";
    })(),
    away_pitcher_primary_pitch: (() => {
      const ap = g.advanced_pitching?.away;
      if (!ap) return null;
      const arr = [
        { name: "fastball", pct: ap.fastballPct || 0 },
        { name: "slider", pct: ap.sliderPct || 0 },
        { name: "curve", pct: ap.curvePct || 0 },
        { name: "changeup", pct: ap.changeupPct || 0 },
        { name: "splitter", pct: ap.splitterPct || 0 }
      ].sort((a, b) => b.pct - a.pct);
      return arr[0].pct > 0 ? arr[0].name : null;
    })(),
    away_pitcher_primary_pitch_usage_pct: (() => {
      const ap = g.advanced_pitching?.away;
      if (!ap) return null;
      const arr = [ap.fastballPct || 0, ap.sliderPct || 0, ap.curvePct || 0, ap.changeupPct || 0, ap.splitterPct || 0].sort((a, b) => b - a);
      return arr[0] > 0 ? arr[0] : null;
    })(),
    away_pitcher_secondary_pitch: (() => {
      const ap = g.advanced_pitching?.away;
      if (!ap) return null;
      const arr = [
        { name: "fastball", pct: ap.fastballPct || 0 },
        { name: "slider", pct: ap.sliderPct || 0 },
        { name: "curve", pct: ap.curvePct || 0 },
        { name: "changeup", pct: ap.changeupPct || 0 },
        { name: "splitter", pct: ap.splitterPct || 0 }
      ].sort((a, b) => b.pct - a.pct);
      return arr[1].pct > 0 ? arr[1].name : null;
    })(),
    away_pitcher_secondary_pitch_usage_pct: (() => {
      const ap = g.advanced_pitching?.away;
      if (!ap) return null;
      const arr = [ap.fastballPct || 0, ap.sliderPct || 0, ap.curvePct || 0, ap.changeupPct || 0, ap.splitterPct || 0].sort((a, b) => b - a);
      return arr[1] > 0 ? arr[1] : null;
    })(),
    away_pitcher_pitches_per_bf_last5: (() => {
      const ap = g.advanced_pitching?.away;
      if (ap?.last5PitchCountAvg != null && ap?.last5BfAvg != null && ap.last5BfAvg > 0)
        return ap.last5PitchCountAvg / ap.last5BfAvg;
      return null;
    })(),
    away_pitcher_pitches_per_ip_last5: (() => {
      const ap = g.advanced_pitching?.away;
      if (ap?.last5PitchCountAvg != null && ap?.last5IpAvg != null && ap.last5IpAvg > 0)
        return ap.last5PitchCountAvg / ap.last5IpAvg;
      return null;
    })(),
    away_pitcher_avg_pitches_last5: g.advanced_pitching?.away?.last5PitchCountAvg ?? null,
    away_pitcher_rest_status: (() => {
      const days = fPitchers?.away?.daysSinceLastStart;
      if (days == null) return null;
      if (days <= 4) return "Short Rest";
      if (days === 5) return "Normal";
      return "Extra Rest";
    })(),
    home_offense_woba: g.advanced_offense?.home?.wOba ?? null,
    home_offense_xwoba: g.advanced_offense?.home?.xwOba ?? null,
    home_offense_wrcplus: g.advanced_offense?.home?.wrcPlus ?? null,
    home_offense_iso: g.advanced_offense?.home?.iso ?? null,
    home_offense_babip: g.advanced_offense?.home?.babip ?? null,
    home_offense_hardhit_pct: g.advanced_offense?.home?.hardHitPct ?? null,
    home_offense_barrel_pct: g.advanced_offense?.home?.barrelPct ?? null,
    home_offense_contact_pct: g.advanced_offense?.home?.contactPct ?? null,
    home_offense_chase_pct: g.advanced_offense?.home?.chasePct ?? null,
    home_offense_k_pct_vs_pitch_hand: g.advanced_offense?.home?.kPctVsPitchHand ?? null,
    home_offense_projected_lineup_k_pct: g.advanced_offense?.home?.projectedLineupKPct ?? null,
    home_projected_lineup_k_pct_vs_hand: g.advanced_offense?.home?.projectedLineupKPct ?? null,
    home_projected_lineup_contact_pct_vs_hand: g.advanced_offense?.home?.projectedLineupContactPctVsHand ?? null,
    away_offense_woba: g.advanced_offense?.away?.wOba ?? null,
    away_offense_xwoba: g.advanced_offense?.away?.xwOba ?? null,
    away_offense_wrcplus: g.advanced_offense?.away?.wrcPlus ?? null,
    away_offense_iso: g.advanced_offense?.away?.iso ?? null,
    away_offense_babip: g.advanced_offense?.away?.babip ?? null,
    away_offense_hardhit_pct: g.advanced_offense?.away?.hardHitPct ?? null,
    away_offense_barrel_pct: g.advanced_offense?.away?.barrelPct ?? null,
    away_offense_contact_pct: g.advanced_offense?.away?.contactPct ?? null,
    away_offense_chase_pct: g.advanced_offense?.away?.chasePct ?? null,
    away_offense_k_pct_vs_pitch_hand: g.advanced_offense?.away?.kPctVsPitchHand ?? null,
    away_offense_projected_lineup_k_pct: g.advanced_offense?.away?.projectedLineupKPct ?? null,
    away_projected_lineup_k_pct_vs_hand: g.advanced_offense?.away?.projectedLineupKPct ?? null,
    away_projected_lineup_contact_pct_vs_hand: g.advanced_offense?.away?.projectedLineupContactPctVsHand ?? null,
    diff_era: g.model_features?.diffEra ?? null,
    diff_xera: g.model_features?.diffXera ?? null,
    diff_fip: g.model_features?.diffFip ?? null,
    diff_ops: g.model_features?.diffOps ?? null,
    diff_xwoba: g.model_features?.diffXwoba ?? null,
    diff_bullpen_era: g.model_features?.diffBullpenEra ?? null,
    diff_runs_per_game: g.model_features?.diffRunsPerGame ?? null,
    diff_record_last10: g.model_features?.diffRecordLast10 ?? null,
    diff_record_home_away: g.model_features?.diffRecordHomeAway ?? null,
    diff_starter_rest: g.model_features?.diffStarterRest ?? null,
    diff_bullpen_fatigue: g.model_features?.diffBullpenFatigue ?? null,
    line_source: getBettingLineSource2(g),
    home_score: g.game_result?.homeScore ?? null,
    away_score: g.game_result?.awayScore ?? null,
    winner: g.game_result?.winner ?? null,
    runline_covered: g.game_result?.runLineCovered ?? null,
    over_under_result: g.game_result?.overUnderResult ?? null,
    game_status: g.game_result?.gameStatus ?? "Scheduled"
  };
}
app2.get("/api/extracted-dates", async (req, res) => {
  try {
    const { remote } = req.query;
    const db2 = readGamesDB();
    const localDates = Object.keys(db2).filter((date) => Array.isArray(db2[date]) && db2[date].length > 0);
    let firestoreDates = [];
    if (remote === "true") {
      try {
        firestoreDates = await loadExtractedDatesFromFirestore();
      } catch (fsErr) {
        console.error("Error retrieving extracted dates from Firestore:", fsErr);
      }
    }
    const mergedDates = Array.from(/* @__PURE__ */ new Set([...localDates, ...firestoreDates])).filter(Boolean).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    res.json({ dates: mergedDates });
  } catch (err) {
    console.error("Error retrieving extracted dates:", err);
    res.status(500).json({ error: "Fallo al obtener fechas extra\xEDdas" });
  }
});
app2.get("/api/diagnostics/render", async (req, res) => {
  try {
    const db2 = readGamesDB();
    const localDates = Object.keys(db2).filter((date) => Array.isArray(db2[date]) && db2[date].length > 0);
    let firestoreDates = [];
    try {
      firestoreDates = await loadExtractedDatesFromFirestore();
    } catch (fsErr) {
      console.error("Diagnostics Firestore dates error:", fsErr);
    }
    const latestDate = [...localDates, ...firestoreDates].filter(Boolean).sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || null;
    const latestGames = latestDate ? db2[latestDate] || [] : [];
    res.json({
      ok: true,
      environment: {
        nodeEnv: process.env.NODE_ENV || null,
        hasOddsApiKey: !!process.env.ODDS_API_KEY,
        hasFirebaseProjectId: !!process.env.FIREBASE_PROJECT_ID,
        fullFirestoreStartupSync: process.env.FULL_FIRESTORE_STARTUP_SYNC === "true",
        firestoreReadTimeoutMs: process.env.FIRESTORE_READ_TIMEOUT_MS || "6000"
      },
      database: {
        localDates: localDates.length,
        firestoreDates: firestoreDates.length,
        totalLocalGames: countLocalGames(db2),
        latestDate,
        latestLocalGames: latestGames.length,
        latestTheOddsApiProps: getTheOddsApiPropsCountForGames(latestGames)
      }
    });
  } catch (err) {
    console.error("Diagnostics endpoint error:", err);
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});
app2.get("/api/ml-dataset", (req, res) => {
  try {
    const db2 = readGamesDB();
    const allGames = [];
    for (const date of Object.keys(db2)) {
      const games = db2[date] || [];
      allGames.push(...games);
    }
    const flattened = allGames.map(flattenGameToJSON);
    res.json({ dataset: flattened });
  } catch (err) {
    console.error("Error retrieving ML dataset:", err);
    res.status(500).json({ error: "Fallo al generar dataset ML" });
  }
});
app2.get("/api/ml-dataset/csv", (req, res) => {
  try {
    const { dates } = req.query;
    const db2 = readGamesDB();
    const allGames = [];
    let filterDates = [];
    if (typeof dates === "string" && dates.trim() !== "") {
      filterDates = dates.split(",").map((d) => d.trim());
    }
    for (const date of Object.keys(db2)) {
      if (filterDates.length > 0 && !filterDates.includes(date)) {
        continue;
      }
      const games = db2[date] || [];
      allGames.push(...games);
    }
    const pitLookups = readPitLookups();
    const csvContent = generateMLDatasetCSV(allGames, pitLookups);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=mlb_ml_dataset.csv");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.send(csvContent);
  } catch (err) {
    console.error("Error generating ML CSV:", err);
    res.status(500).send("Error al generar CSV");
  }
});
app2.get("/api/k-props/csv", async (req, res) => {
  try {
    const { date } = req.query;
    const db2 = readGamesDB();
    const allGames = [];
    if (date && typeof date === "string") {
      allGames.push(...db2[date] || []);
    } else {
      for (const dateKey of Object.keys(db2)) {
        const games = db2[dateKey] || [];
        allGames.push(...games);
      }
    }
    const csvContent = generateKPropsLinesCSV(allGames);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=k_props_lines_${date || "all"}.csv`);
    res.send(csvContent);
  } catch (err) {
    console.error("Error generating K Props CSV:", err);
    res.status(500).send("Error al generar CSV");
  }
});
app2.get("/api/batter-total-bases/csv", async (req, res) => {
  try {
    const { date } = req.query;
    const db2 = readGamesDB();
    const allGames = [];
    if (date && typeof date === "string") {
      allGames.push(...db2[date] || []);
    } else {
      for (const dateKey of Object.keys(db2)) {
        const games = db2[dateKey] || [];
        allGames.push(...games);
      }
    }
    const csvContent = generateBatterTotalBasesLinesCSV(allGames);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=batter_total_bases_lines_${date || "all"}.csv`);
    res.send(csvContent);
  } catch (err) {
    console.error("Error generating Batter Total Bases CSV:", err);
    res.status(500).send("Error al generar CSV");
  }
});
app2.get("/api/batters-dataset/csv", async (req, res) => {
  try {
    const { dates, date } = req.query;
    const db2 = readGamesDB();
    const allGames = [];
    let filterDates = [];
    const queryDates = dates || date;
    if (typeof queryDates === "string" && queryDates.trim() !== "") {
      filterDates = queryDates.split(",").map((d) => d.trim());
    }
    for (const dateKey of Object.keys(db2)) {
      if (filterDates.length > 0 && !filterDates.includes(dateKey)) {
        continue;
      }
      const games = db2[dateKey] || [];
      allGames.push(...games);
    }
    const pitLookups = readPitLookups();
    const enrichedGames = await enrichGamesWithSavantBatterContact(await enrichGamesWithTotalBasesProps(allGames));
    const csvContent = generateBattersCSV(enrichedGames, pitLookups);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=batters_dataset_${queryDates ? "batch" : "all"}.csv`);
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.send(csvContent);
  } catch (err) {
    console.error("Error generating Batters CSV:", err);
    res.status(500).send("Error al generar CSV de bateadores");
  }
});
function getDatasetGamesForDate(db2, date) {
  if (typeof date === "string" && date.trim()) return db2[date] || [];
  return Object.values(db2).flat();
}
app2.get("/api/datasets/pitcher-game/csv", (req, res) => {
  const { date } = req.query;
  const csv = generatePitcherGameDatasetCSV(getDatasetGamesForDate(readGamesDB(), date));
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename=MLB_PITCHER_GAME_DATASET_${date || "all"}.csv`);
  res.send(csv);
});
app2.get("/api/datasets/game/csv", (req, res) => {
  const { date } = req.query;
  const csv = generateGameDatasetCSV(getDatasetGamesForDate(readGamesDB(), date));
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename=MLB_GAME_DATASET_${date || "all"}.csv`);
  res.send(csv);
});
app2.get("/api/datasets/batter-game/csv", (req, res) => {
  const { date } = req.query;
  const csv = generateBatterGameDatasetCSV(getDatasetGamesForDate(readGamesDB(), date));
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename=MLB_BATTER_GAME_DATASET_${date || "all"}.csv`);
  res.send(csv);
});
app2.get("/api/datasets/pitcher-props/csv", (req, res) => {
  const { date } = req.query;
  const csv = generatePitcherPropsDatasetCSV(getDatasetGamesForDate(readGamesDB(), date));
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename=MLB_PITCHER_PROPS_DATASET_${date || "all"}.csv`);
  res.send(csv);
});
function buildRequestedKlabDataset(startDate, endDate) {
  const allGames = Object.values(readGamesDB()).flat();
  return buildKlabTrainingDataset(allGames, startDate, endDate);
}
app2.get("/api/datasets/klab-training/preview", (req, res) => {
  try {
    const result = buildRequestedKlabDataset(req.query.start_date, req.query.end_date);
    res.json({ report: result.report, sample: result.rows.slice(0, 5) });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Rango inv\xE1lido" });
  }
});
app2.get("/api/datasets/klab-training/csv", (req, res) => {
  try {
    const result = buildRequestedKlabDataset(req.query.start_date, req.query.end_date);
    const outputDirectory = path6.join(process.cwd(), "datasets", "ml");
    fs7.mkdirSync(outputDirectory, { recursive: true });
    fs7.writeFileSync(path6.join(outputDirectory, result.report.outputFilename), result.csv, "utf8");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=${result.report.outputFilename}`);
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.send(result.csv);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "No se pudo generar el dataset" });
  }
});
app2.post("/api/firestore/sync-local-range", async (req, res) => {
  if (firestoreRangeSyncInFlight) {
    res.status(409).json({ error: "Ya existe una sincronizaci\xF3n de Firestore en progreso" });
    return;
  }
  try {
    const { startDate, endDate } = validateKlabDateRange(req.body?.start_date, req.body?.end_date);
    firestoreRangeSyncInFlight = true;
    const remoteGames = await loadGamesByDateRangeFromFirestore(startDate, endDate);
    const before = readGamesDB();
    let added = 0;
    let updated = 0;
    let unchanged = 0;
    for (const remoteGame of remoteGames) {
      const date = remoteGame?.metadata?.date;
      const id = String(remoteGame?.id || remoteGame?.metadata?.id || "");
      const localGame = (before[date] || []).find((game) => String(game?.id || game?.metadata?.id || "") === id);
      if (!localGame) {
        added += 1;
      } else if (JSON.stringify(pickSyncedGame(remoteGame, localGame)) === JSON.stringify(localGame)) {
        unchanged += 1;
      } else {
        updated += 1;
      }
    }
    if (remoteGames.length > 0) mergeGamesIntoLocalDB(remoteGames);
    const dates = new Set(remoteGames.map((game) => game?.metadata?.date).filter(Boolean));
    res.json({
      startDate,
      endDate,
      remoteGames: remoteGames.length,
      datesFound: dates.size,
      added,
      updated,
      unchanged,
      localGamesAfterSync: countLocalGames(readGamesDB()),
      note: "Se sincronizaron documentos de juegos. Los snapshots pregame solo estar\xE1n disponibles si ya existen en el almac\xE9n local de snapshots."
    });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "No se pudo sincronizar Firestore" });
  } finally {
    firestoreRangeSyncInFlight = false;
  }
});
app2.get("/api/game/:gameId", async (req, res) => {
  try {
    const { gameId: gameId2 } = req.params;
    const db2 = readGamesDB();
    let gameData = null;
    for (const date in db2) {
      const found = db2[date]?.find((g) => String(g.id) === gameId2);
      if (found) {
        gameData = found;
        break;
      }
    }
    if (!gameData) {
      res.status(404).json({ error: "Juego no encontrado" });
      return;
    }
    const pitGames = injectPitStats([gameData]);
    res.json(pitGames[0]);
  } catch (err) {
    console.error("Error fetching single game:", err);
    res.status(500).send("Error fetching game");
  }
});
app2.get("/api/game/:gameId/csv", async (req, res) => {
  try {
    const { gameId: gameId2 } = req.params;
    const { date } = req.query;
    const db2 = readGamesDB();
    const candidateGames = [];
    if (date && db2[String(date)]) {
      candidateGames.push(...db2[String(date)]);
    } else {
      for (const games of Object.values(db2)) {
        candidateGames.push(...games);
      }
    }
    const game = candidateGames.find((g) => String(g.id) === String(gameId2));
    if (!game) {
      res.status(404).send("Juego no encontrado");
      return;
    }
    const [enrichedGame] = await enrichGamesWithTotalBasesProps([game]);
    const csvContent = generateSingleGameCSV(enrichedGame);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=mlb_game_${gameId2}_${enrichedGame.metadata.date}.csv`);
    res.send(csvContent);
  } catch (err) {
    console.error("Error generating single game CSV:", err);
    res.status(500).send("Error al generar CSV del juego");
  }
});
app2.get("/api/daily-results/csv", (req, res) => {
  try {
    const { date } = req.query;
    const db2 = readGamesDB();
    const games = date && db2[String(date)] ? db2[String(date)] : [];
    const csvContent = generateDailyPlayerResultsCSV(games);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=mlb_resultados_dia_${date || "sin_fecha"}.csv`);
    res.send(csvContent);
  } catch (err) {
    console.error("Error generating daily results CSV:", err);
    res.status(500).send("Error al generar CSV de resultados del dia");
  }
});
app2.get("/api/errors", (req, res) => {
  const errors = readErrorsDB();
  res.json({ errors });
});
app2.post("/api/errors/clear", (req, res) => {
  writeErrorsDB([]);
  res.json({ status: "success", message: "Logs de errores vaciados." });
});
function safeFloat(val, fallback = null) {
  const n2 = parseFloat(String(val));
  return isNaN(n2) ? fallback : n2;
}
var GAME_TIME_ZONE = "America/New_York";
function formatGameTime(gameDateISO) {
  if (!gameDateISO) return "TBD";
  return `${new Date(gameDateISO).toLocaleTimeString("en-US", {
    timeZone: GAME_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  })} ET`;
}
function roundNumber(value, decimals = 1) {
  if (value === null || value === void 0 || !Number.isFinite(value)) return null;
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}
function average(values, decimals = 1) {
  if (!values.length) return null;
  return roundNumber(values.reduce((sum, value) => sum + value, 0) / values.length, decimals);
}
function standardDeviation(values, decimals = 2) {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
  return roundNumber(Math.sqrt(variance), decimals);
}
function calculateLineupSavantAverages(lineup) {
  const batterStats = lineup.map((p) => savantCache.getBatter(p.id ?? p.mlbId));
  return {
    xwOba: average(
      batterStats.map((p) => p?.xwOBA).filter((value) => value !== null && value !== void 0),
      3
    ),
    hardHitPct: average(
      batterStats.map((p) => p?.hardHitPct).filter((value) => value !== null && value !== void 0),
      1
    ),
    barrelPct: average(
      batterStats.map((p) => p?.barrelPct).filter((value) => value !== null && value !== void 0),
      1
    ),
    chasePct: average(
      batterStats.map((p) => p?.chasePct).filter((value) => value !== null && value !== void 0),
      1
    ),
    whiffPct: average(
      batterStats.map((p) => p?.whiffPct).filter((value) => value !== null && value !== void 0),
      1
    ),
    whiffPctVsFastball: average(
      batterStats.map((p) => p?.whiffPctVsFastball).filter((v) => v !== null && v !== void 0),
      1
    ),
    whiffPctVsSlider: average(
      batterStats.map((p) => p?.whiffPctVsSlider).filter((v) => v !== null && v !== void 0),
      1
    ),
    whiffPctVsCurve: average(
      batterStats.map((p) => p?.whiffPctVsCurve).filter((v) => v !== null && v !== void 0),
      1
    ),
    whiffPctVsChangeup: average(
      batterStats.map((p) => p?.whiffPctVsChangeup).filter((v) => v !== null && v !== void 0),
      1
    ),
    whiffPctVsSplitter: average(
      batterStats.map((p) => p?.whiffPctVsSplitter).filter((v) => v !== null && v !== void 0),
      1
    )
  };
}
async function enrichGamesWithSavantBatterContact(games) {
  const applyBatterSavant = (lineup) => {
    for (const player of lineup || []) {
      const savant = savantCache.getBatter(player.id ?? player.mlbId);
      if (!savant) continue;
      player.chase_pct = player.chase_pct ?? savant.chasePct;
      player.whiff_pct = player.whiff_pct ?? savant.whiffPct;
      if (savant.whiffPct !== null) {
        const contactPct = roundNumber(100 - savant.whiffPct, 1);
        player.contact_pct_vs_rhp = player.contact_pct_vs_rhp ?? contactPct;
        player.contact_pct_vs_lhp = player.contact_pct_vs_lhp ?? contactPct;
      }
    }
  };
  const applyTeamSavant = (game, side) => {
    const lineup = game.lineups?.[side] || [];
    const lineupSavant = calculateLineupSavantAverages(lineup);
    const offense = game.advanced_offense?.[side];
    if (!offense) return;
    if (lineupSavant.chasePct !== null) offense.chasePct = offense.chasePct ?? lineupSavant.chasePct;
    if (lineupSavant.whiffPct !== null) {
      offense.projectedLineupWhiffPctVsHand = offense.projectedLineupWhiffPctVsHand ?? lineupSavant.whiffPct;
      offense.contactPct = offense.contactPct ?? roundNumber(100 - lineupSavant.whiffPct, 1);
      offense.projectedLineupContactPctVsHand = offense.projectedLineupContactPctVsHand ?? roundNumber(100 - lineupSavant.whiffPct, 1);
    }
  };
  for (const game of games) {
    const year = String(game?.metadata?.date || "").slice(0, 4);
    await savantCache.load(/^\d{4}$/.test(year) ? parseInt(year, 10) : (/* @__PURE__ */ new Date()).getFullYear());
    applyBatterSavant(game.lineups?.home);
    applyBatterSavant(game.lineups?.away);
    applyTeamSavant(game, "home");
    applyTeamSavant(game, "away");
  }
  return games;
}
function inningsToOuts(ipValue) {
  const ipStr = String(ipValue || "0.0");
  const [wholeRaw, fracRaw = "0"] = ipStr.split(".");
  const whole = parseInt(wholeRaw, 10) || 0;
  const frac = parseInt(fracRaw, 10) || 0;
  return whole * 3 + Math.min(Math.max(frac, 0), 2);
}
function outsToInnings(outs) {
  if (!Number.isFinite(outs) || outs <= 0) return 0;
  return Math.round(outs / 3 * 10) / 10;
}
function saneAveragePitchCount(value) {
  if (value === null || value <= 0) return null;
  return value > 130 ? null : Math.round(value);
}
function saneBattersFacedPerStart(value) {
  if (value === null || value <= 0) return null;
  return value > 40 ? null : roundNumber(value, 1);
}
function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
function getPitcherRoleFromBfPerStart(bfPerStart) {
  if (bfPerStart < 15) return { roleFlag: "SHORT_ROLE_OR_OPENER", clusterAvg: 42, min: 15, max: 55, roleAdjustment: -8 };
  if (bfPerStart < 18) return { roleFlag: "LIMITED_STARTER", clusterAvg: 68, min: 50, max: 78, roleAdjustment: -4 };
  if (bfPerStart < 21) return { roleFlag: "LOW_VOLUME_STARTER", clusterAvg: 80, min: 65, max: 88, roleAdjustment: -2 };
  if (bfPerStart < 24) return { roleFlag: "NORMAL_STARTER", clusterAvg: 88, min: 75, max: 98, roleAdjustment: 0 };
  return { roleFlag: "HIGH_VOLUME_STARTER", clusterAvg: 94, min: 82, max: 108, roleAdjustment: 2 };
}
function calculateProjectedPitchCount(pitching, fatigue) {
  const last5PitchCountAvg = safeFloat(pitching.last5PitchCountAvg) ?? safeFloat(pitching.projectedPitchCount);
  const pitchesLast3 = safeFloat(fatigue?.pitchesLast3Starts);
  const pitchesLast = safeFloat(fatigue?.pitchesLastStart);
  const bfPerStart = safeFloat(pitching.battersFacedPerStart);
  const pitcherRest = safeFloat(fatigue?.daysSinceLastStart);
  if (last5PitchCountAvg === null || bfPerStart === null) {
    return saneAveragePitchCount(last5PitchCountAvg);
  }
  const pitchesLast3Avg = pitchesLast3 !== null && pitchesLast3 > 0 ? pitchesLast3 / 3 : last5PitchCountAvg;
  const role = getPitcherRoleFromBfPerStart(bfPerStart);
  const projectedPitchesBase = 0.55 * last5PitchCountAvg + 0.25 * pitchesLast3Avg + 0.2 * role.clusterAvg;
  let restAdjustment = 0;
  if (pitcherRest !== null) {
    if (pitcherRest <= 2) restAdjustment = -10;
    else if (pitcherRest === 3) restAdjustment = -5;
    else if (pitcherRest === 5) restAdjustment = 2;
  }
  let workloadAdjustment = 0;
  if (pitchesLast !== null && pitchesLast > 110 || pitchesLast3 !== null && pitchesLast3 > 320) {
    workloadAdjustment = -6;
  } else if (pitchesLast !== null && pitchesLast > 100 || pitchesLast3 !== null && pitchesLast3 > 295) {
    workloadAdjustment = -3;
  } else if (pitchesLast !== null && pitchesLast < 65 && bfPerStart >= 18) {
    workloadAdjustment = -4;
  }
  const raw = projectedPitchesBase + restAdjustment + workloadAdjustment + role.roleAdjustment;
  let finalValue = Math.round(clampNumber(raw, role.min, role.max));
  if (bfPerStart < 15 || finalValue < 55) {
    finalValue = Math.round(clampNumber(raw, 15, 55));
  }
  return finalValue;
}
function calculateProjectedInnings(pitching) {
  const projectedPitches = pitching.projectedPitchCount;
  if (projectedPitches === null || projectedPitches === void 0 || projectedPitches <= 0) {
    return null;
  }
  const last5Pitches = pitching.last5PitchCountAvg;
  const last5Ip = pitching.last5IpAvg;
  let pitchesPerInning = 16.5;
  if (last5Pitches != null && last5Ip != null && last5Ip > 0) {
    pitchesPerInning = last5Pitches / last5Ip;
  }
  pitchesPerInning = Math.min(25, Math.max(12, pitchesPerInning));
  const rawInnings = projectedPitches / pitchesPerInning;
  const totalOuts = Math.round(rawInnings * 3);
  if (totalOuts <= 0) return 0;
  const wholeInnings = Math.floor(totalOuts / 3);
  const remainingOuts = totalOuts % 3;
  return wholeInnings + remainingOuts / 10;
}
function calculateVortexProjectedKs(pitching, opposingOffense, fatigue) {
  const bfPerStart = pitching.battersFacedPerStart ?? 0;
  if (bfPerStart <= 0) return null;
  const last5BfAvg = pitching.last5BfAvg ?? bfPerStart;
  const projectedPitches = pitching.projectedPitchCount;
  let pitchesPerBf = 3.95;
  const bbPct = pitching.walkRate ?? 8.5;
  if (bbPct <= 6) pitchesPerBf = 3.75;
  else if (bbPct >= 9) pitchesPerBf = 4.15;
  let bfFromProjected = projectedPitches ? projectedPitches / pitchesPerBf : null;
  let expectedBfRaw = 0;
  if (projectedPitches && pitching.last5BfAvg != null) {
    expectedBfRaw = 0.4 * bfPerStart + 0.35 * last5BfAvg + 0.25 * bfFromProjected;
  } else if (!pitching.last5BfAvg && projectedPitches) {
    expectedBfRaw = 0.55 * bfPerStart + 0.45 * bfFromProjected;
  } else if (!projectedPitches && pitching.last5BfAvg != null) {
    expectedBfRaw = 0.55 * bfPerStart + 0.45 * last5BfAvg;
  } else {
    expectedBfRaw = bfPerStart;
  }
  const role = getPitcherRoleFromBfPerStart(bfPerStart);
  let expectedBf = expectedBfRaw;
  let capMin = 10, capMax = 30;
  if (role.roleFlag.includes("OPENER") || role.roleFlag.includes("SHORT")) {
    capMin = 6;
    capMax = 15;
  } else if (role.roleFlag.includes("LIMITED") || expectedBfRaw < 18) {
    capMin = 14;
    capMax = 20;
  } else if (expectedBfRaw < 21) {
    capMin = 17;
    capMax = 23;
  } else if (expectedBfRaw > 24) {
    capMin = 23;
    capMax = 30;
  } else {
    capMin = 20;
    capMax = 27;
  }
  expectedBf = clampNumber(expectedBfRaw, capMin, capMax);
  expectedBf = Math.round(expectedBf * 100) / 100;
  const pitcherKSkill = pitching.strikeoutRate ?? (pitching.last5KsAvg && last5BfAvg > 0 ? pitching.last5KsAvg / last5BfAvg * 100 : 20);
  const recentKPct = pitching.last5KsAvg != null && last5BfAvg > 0 ? pitching.last5KsAvg / last5BfAvg * 100 : pitcherKSkill;
  const rawMatchup = opposingOffense?.projectedLineupKPct ?? opposingOffense?.kPctVsPitchHand;
  const matchupKPct = rawMatchup != null ? rawMatchup < 1 ? rawMatchup * 100 : rawMatchup : 22;
  let stuffKScore = pitcherKSkill;
  let hasStuff = false;
  if (pitching.swingingStrikePct != null && pitching.cswPct != null) {
    const swStr = pitching.swingingStrikePct;
    const csw = pitching.cswPct;
    stuffKScore = swStr * 1.5 + csw * 0.35;
    hasStuff = true;
  } else if (pitching.swingingStrikePct != null) {
    const swStr = pitching.swingingStrikePct;
    const csw = swStr + 17;
    stuffKScore = swStr * 1.5 + csw * 0.35;
    hasStuff = true;
  } else if (pitching.cswPct != null) {
    const csw = pitching.cswPct;
    const swStr = csw - 17;
    stuffKScore = swStr * 1.5 + csw * 0.35;
    hasStuff = true;
  }
  const rawContact = opposingOffense?.projectedLineupContactPctVsHand;
  const contactPct = rawContact != null ? rawContact <= 1 ? rawContact * 100 : rawContact : null;
  const contextAdjustment = contactPct != null ? 100 - contactPct : pitcherKSkill;
  const hasContext = contactPct != null;
  let expectedKPct = 0;
  if (hasStuff && hasContext) {
    expectedKPct = 0.45 * pitcherKSkill + 0.2 * recentKPct + 0.2 * matchupKPct + 0.1 * stuffKScore + 0.05 * contextAdjustment;
  } else if (hasStuff && !hasContext) {
    expectedKPct = 0.5 * pitcherKSkill + 0.2 * recentKPct + 0.2 * matchupKPct + 0.1 * stuffKScore;
  } else if (!hasStuff && hasContext) {
    expectedKPct = 0.55 * pitcherKSkill + 0.2 * recentKPct + 0.2 * matchupKPct + 0.05 * contextAdjustment;
  } else {
    expectedKPct = 0.6 * pitcherKSkill + 0.2 * recentKPct + 0.2 * matchupKPct;
  }
  expectedKPct = Math.round(expectedKPct * 100) / 100;
  let rawKs = expectedBf * (expectedKPct / 100);
  rawKs = Math.round(rawKs * 100) / 100;
  let fatigueMultiplier = 1;
  if (fatigue) {
    if (fatigue.daysSinceLastStart != null) {
      if (fatigue.daysSinceLastStart <= 3) fatigueMultiplier -= 0.04;
      if (fatigue.daysSinceLastStart >= 5) fatigueMultiplier += 0.02;
    }
    if (fatigue.pitchesLastStart != null && fatigue.pitchesLastStart > 105) fatigueMultiplier -= 0.03;
    if (fatigue.pitchesLast3Starts != null && fatigue.pitchesLast3Starts > 300) fatigueMultiplier -= 0.03;
    if (fatigue.isInjuryReturn) fatigueMultiplier -= 0.05;
  }
  if (role.roleFlag.includes("OPENER") || role.roleFlag.includes("SHORT")) fatigueMultiplier -= 0.05;
  fatigueMultiplier = clampNumber(fatigueMultiplier, 0.9, 1.05);
  fatigueMultiplier = Math.round(fatigueMultiplier * 1e3) / 1e3;
  let varianceMultiplier = 0.98;
  if (pitching.last5KsStd != null) {
    if (pitching.last5KsStd >= 3) varianceMultiplier = 0.93;
    else if (pitching.last5KsStd >= 2.5) varianceMultiplier = 0.96;
    else if (pitching.last5KsStd <= 1.5) varianceMultiplier = 1.02;
    else varianceMultiplier = 1;
  }
  varianceMultiplier = Math.round(varianceMultiplier * 1e3) / 1e3;
  let efficiencyMultiplier = 1;
  if (bbPct >= 10.5) efficiencyMultiplier -= 0.02;
  else if (bbPct <= 5.5) efficiencyMultiplier += 0.01;
  efficiencyMultiplier = clampNumber(efficiencyMultiplier, 0.97, 1.02);
  efficiencyMultiplier = Math.round(efficiencyMultiplier * 1e3) / 1e3;
  const biasCorrection = 0;
  const totalMultiplier = fatigueMultiplier * varianceMultiplier * efficiencyMultiplier;
  const adjustedKsBase = rawKs * totalMultiplier + biasCorrection;
  const projectedKsBase = Math.round(adjustedKsBase * 100) / 100;
  return projectedKsBase;
}
var MLB_TEAM_ABBR2 = {
  "Arizona Diamondbacks": "ARI",
  "Athletics": "OAK",
  "Atlanta Braves": "ATL",
  "Baltimore Orioles": "BAL",
  "Boston Red Sox": "BOS",
  "Chicago Cubs": "CHC",
  "Chicago White Sox": "CHW",
  "Cincinnati Reds": "CIN",
  "Cleveland Guardians": "CLE",
  "Colorado Rockies": "COL",
  "Detroit Tigers": "DET",
  "Houston Astros": "HOU",
  "Kansas City Royals": "KC",
  "Los Angeles Angels": "LAA",
  "Los Angeles Dodgers": "LAD",
  "Miami Marlins": "MIA",
  "Milwaukee Brewers": "MIL",
  "Minnesota Twins": "MIN",
  "New York Mets": "NYM",
  "New York Yankees": "NYY",
  "Oakland Athletics": "OAK",
  "Philadelphia Phillies": "PHI",
  "Pittsburgh Pirates": "PIT",
  "San Diego Padres": "SD",
  "San Francisco Giants": "SF",
  "Seattle Mariners": "SEA",
  "St. Louis Cardinals": "STL",
  "Tampa Bay Rays": "TB",
  "Texas Rangers": "TEX",
  "Toronto Blue Jays": "TOR",
  "Washington Nationals": "WSH"
};
function getTeamAbbr2(teamName) {
  return MLB_TEAM_ABBR2[teamName] || null;
}
function normalizeTeamAbbr(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const upper = raw.toUpperCase();
  if (/^[A-Z]{2,3}$/.test(upper)) return upper;
  return getTeamAbbr2(raw);
}
function hasRealBettingLines2(game) {
  const summary = String(game?.betting_lines?.lineMovementSummary || "").toLowerCase();
  if (summary.includes("estandar") || summary.includes("est\xE1ndar") || summary.includes("sin lineas reales") || summary.includes("sin l\xEDneas reales")) {
    return false;
  }
  const lines = game?.betting_lines || {};
  const isSyntheticDefault = lines.openingMoneylineHome === -110 && lines.openingMoneylineAway === -110 && lines.currentMoneylineHome === -110 && lines.currentMoneylineAway === -110 && lines.runLineHome === -1.5 && lines.runLineHomeOdds === -110 && lines.runLineAway === 1.5 && lines.runLineAwayOdds === -110 && lines.totalRuns === 8.5 && lines.overOdds === -110 && lines.underOdds === -110;
  if (isSyntheticDefault) return false;
  return [
    lines.openingMoneylineHome,
    lines.openingMoneylineAway,
    lines.currentMoneylineHome,
    lines.currentMoneylineAway,
    lines.runLineHome,
    lines.runLineHomeOdds,
    lines.runLineAway,
    lines.runLineAwayOdds,
    lines.totalRuns,
    lines.overOdds,
    lines.underOdds
  ].some((value) => value !== null && value !== void 0);
}
function getBettingLineSource2(game) {
  if (!hasRealBettingLines2(game)) return null;
  const explicitSource = game?.betting_lines?.lineSource;
  if (explicitSource) return explicitSource;
  const summary = String(game?.betting_lines?.lineMovementSummary || "").toLowerCase();
  if (summary.includes("odds api")) return "the_odds_api";
  if (summary.includes("datastreak") || summary.includes("data streak")) return "datastreak";
  return null;
}
function fetchWithTimeout(url, ms = 8e3) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
}
async function fetchDataStreakSheetRows(date, statKey, cachePrefix, forceRefresh = false, excludeInjured = true) {
  const cacheFile = path6.join(process.cwd(), `${cachePrefix}${excludeInjured ? "" : "_all"}_${date}.json`);
  if (!forceRefresh && fs7.existsSync(cacheFile)) {
    try {
      return JSON.parse(fs7.readFileSync(cacheFile, "utf-8"));
    } catch (e) {
      console.warn(`Error leyendo cache de DataStreak ${statKey}, se descargara nuevamente.`, e);
    }
  }
  try {
    const url = `https://thedatastreak.com/api/v1/hit-rates/mlb/sheets-fast/${statKey}?target_date=${encodeURIComponent(date)}&sample_size=20&min_games=5&exclude_injured=${excludeInjured ? "true" : "false"}`;
    const res = await fetchWithTimeout(url, 1e4);
    if (!res.ok) {
      console.warn(`DataStreak ${statKey} respondio con error: ${res.status}`);
      return [];
    }
    const data = await res.json();
    const rows = Array.isArray(data?.rows) ? data.rows : [];
    fs7.writeFileSync(cacheFile, JSON.stringify(rows, null, 2));
    return rows;
  } catch (err) {
    console.warn(`Error al obtener ${statKey} de DataStreak:`, err);
    return [];
  }
}
async function fetchDataStreakPitcherStrikeoutProps(date, forceRefresh = false) {
  const dataStreakKs = await fetchDataStreakSheetRows(date, "mlb_pitcher_ks", "datastreak_pitcher_ks", forceRefresh, false);
  let rotowireKs = [];
  const now = /* @__PURE__ */ new Date();
  const nyTimeStr = now.toLocaleString("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
  const [month, day, year] = nyTimeStr.split("/");
  const todayStr = `${year}-${month}-${day}`;
  if (date >= todayStr) {
    try {
      const rwData = await scrapeStrikeoutProps();
      rotowireKs = rwData.map((p) => ({
        player_name: p.playerName,
        line: String(p.line),
        odds: p.overOdds !== null ? String(p.overOdds) : null,
        under_odds: p.underOdds !== null ? String(p.underOdds) : null,
        vendor: p.sportsbook || "rotowire",
        source: "rotowire"
      }));
    } catch (e) {
      console.warn("No se pudo obtener Rotowire Ks:", e);
    }
  }
  return [...rotowireKs, ...dataStreakKs];
}
async function fetchDataStreakTotalBasesProps(date, forceRefresh = false) {
  return [];
}
function mergeDataStreakPitcherStrikeouts(events, rows) {
  if (!Array.isArray(events) || !Array.isArray(rows) || rows.length === 0) return events;
  return events.map((event) => {
    const homeAbbr = getTeamAbbr2(event.home_team);
    const awayAbbr = getTeamAbbr2(event.away_team);
    if (!homeAbbr || !awayAbbr) return event;
    const eventRows = rows.filter((row) => {
      const team = String(row.team_abbr || row.team || "").toUpperCase();
      const opponent = String(row.opponent || "").toUpperCase();
      return team === homeAbbr && opponent === awayAbbr || team === awayAbbr && opponent === homeAbbr;
    });
    if (eventRows.length === 0) return event;
    const outcomes = eventRows.flatMap((row) => {
      const pitcherName = row.player_name || row.name;
      const point = safeFloat(row.line);
      const overOdds = safeFloat(row.odds);
      const underOdds = safeFloat(row.under_odds);
      const vendor = row.vendor || "datastreak";
      if (!pitcherName || point === null) return [];
      return [
        {
          name: "Over",
          description: pitcherName,
          point,
          price: overOdds,
          source: "datastreak",
          vendor
        },
        {
          name: "Under",
          description: pitcherName,
          point,
          price: underOdds,
          source: "datastreak",
          vendor
        }
      ];
    });
    if (outcomes.length === 0) return event;
    const datastreakBook = {
      key: "datastreak",
      title: "DataStreak",
      markets: [{ key: "pitcher_strikeouts", outcomes }]
    };
    return {
      ...event,
      bookmakers: [...event.bookmakers || [], datastreakBook]
    };
  });
}
function normalizeName(value) {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
function enrichLineupWithTotalBasesProps(lineup, rows) {
  if (!Array.isArray(lineup) || !Array.isArray(rows) || rows.length === 0) return lineup;
  return lineup.map((player) => {
    const playerName = normalizeName(player.player_name || player.name);
    const playerTeam = normalizeTeamAbbr(player.team);
    const match = rows.find((row) => {
      const rowName = normalizeName(row.player_name || row.name);
      const rowTeam = normalizeTeamAbbr(row.team_abbr || row.team);
      const isTeamMatch = !playerTeam || !rowTeam || rowTeam === playerTeam;
      if (!isTeamMatch) return false;
      if (rowName === playerName) return true;
      const strippedRow = rowName.replace(/\s+/g, "");
      const strippedPlayer = playerName.replace(/\s+/g, "");
      if (strippedRow === strippedPlayer || strippedRow.includes(strippedPlayer) || strippedPlayer.includes(strippedRow)) return true;
      const pParts = playerName.split(" ");
      const rParts = rowName.split(" ");
      const pLast = pParts[pParts.length - 1];
      const rLast = rParts[rParts.length - 1];
      if (pLast && rLast && pLast === rLast && pParts[0][0] === rParts[0][0]) return true;
      return false;
    });
    if (!match) return player;
    return {
      ...player,
      totalBasesProp: safeFloat(match.line),
      totalBasesPropOverOdds: safeFloat(match.odds),
      totalBasesPropUnderOdds: safeFloat(match.under_odds),
      totalBasesPropBook: match.vendor || null,
      totalBasesPropSource: match.source || (match.vendor === "TheOddsAPI" ? "the_odds_api" : "datastreak"),
      totalBasesPropHitRate: safeFloat(match.hit_rate_pct ?? match.hit_rate),
      totalBasesPropHitRateDisplay: match.hit_rate_display || null
    };
  });
}
function findDataStreakPitcherKProp(rows, pitcherName, pitcherTeam, opponentTeam) {
  if (!Array.isArray(rows) || rows.length === 0 || !pitcherName || pitcherName === "Por definir" || pitcherName === "TBD") {
    return null;
  }
  const normalizedPitcherName = normalizeName(pitcherName);
  const pitcherTeamAbbr = getTeamAbbr2(pitcherTeam);
  const opponentTeamAbbr = getTeamAbbr2(opponentTeam);
  const match = rows.find((row) => {
    const rowName = normalizeName(row.player_name || row.name);
    const rowTeam = String(row.team_abbr || row.team || "").toUpperCase();
    const rowOpponent = String(row.opponent || "").toUpperCase();
    const nameMatches = rowName === normalizedPitcherName || rowName.includes(normalizedPitcherName) || normalizedPitcherName.includes(rowName);
    const teamMatches = !pitcherTeamAbbr || !rowTeam || rowTeam === pitcherTeamAbbr;
    const opponentMatches = !opponentTeamAbbr || !rowOpponent || rowOpponent === opponentTeamAbbr;
    return nameMatches && teamMatches && opponentMatches;
  });
  if (!match) return null;
  return {
    point: safeFloat(match.line),
    overOdds: safeFloat(match.odds),
    underOdds: safeFloat(match.under_odds),
    book: match.vendor || "datastreak",
    source: match.source || "datastreak"
  };
}
async function enrichGamesWithTotalBasesProps(games) {
  const rowsByDate = /* @__PURE__ */ new Map();
  for (const game of games) {
    const gameDate = game?.metadata?.date;
    if (!gameDate || rowsByDate.has(gameDate)) continue;
    rowsByDate.set(gameDate, await fetchDataStreakTotalBasesProps(gameDate));
  }
  return games.map((game) => {
    const gameDate = game?.metadata?.date;
    const rows = rowsByDate.get(gameDate) || [];
    if (!rows.length) return game;
    return {
      ...game,
      lineups: {
        home: enrichLineupWithTotalBasesProps(game.lineups?.home || [], rows),
        away: enrichLineupWithTotalBasesProps(game.lineups?.away || [], rows)
      }
    };
  });
}
async function fetchRealBettingLines(date, forceRefreshOdds = false, gamesList = []) {
  const cacheFile = path6.join(process.cwd(), `odds_cache_${date}.json`);
  if (!forceRefreshOdds && fs7.existsSync(cacheFile)) {
    try {
      console.log(`Leyendo cuotas desde el cach\xE9 local: odds_cache_${date}.json`);
      const cached = fs7.readFileSync(cacheFile, "utf-8");
      return JSON.parse(cached);
    } catch (e) {
      console.warn("Error leyendo el cach\xE9 de cuotas, se ignorar\xE1 y se descargar\xE1 nuevamente.", e);
    }
  }
  if (isPastGameDate(date)) {
    console.log(`[Odds] ${date} es una fecha pasada sin cach\xE9 utilizable; no se consultar\xE1n proveedores externos.`);
    return null;
  }
  const apiKeys = [
    process.env.ODDS_API_KEY,
    process.env.ODDS_API_KEY_2,
    process.env.ODDS_API_KEY_3
  ].filter(Boolean);
  if (apiKeys.length === 0) {
    console.warn("ODDS_API_KEY no configurada. No se obtendr\xE1n l\xEDneas de apuesta reales.");
    return null;
  }
  let activeKey = null;
  let data = null;
  for (let i = 0; i < apiKeys.length; i++) {
    const key = apiKeys[i];
    const label = i === 0 ? "principal" : `respaldo ${i}`;
    const url = `https://api.the-odds-api.com/v4/sports/baseball_mlb/odds/?apiKey=${key}&regions=us&markets=h2h,spreads,totals&oddsFormat=american`;
    console.log(`[Odds API] Intentando con key ${label} (${key.substring(0, 8)}...)...`);
    try {
      const res = await fetchWithTimeout(url, 1e4);
      if (res.ok) {
        data = await res.json();
        activeKey = key;
        console.log(`[Odds API] Key ${label} funcion\xF3. ${data?.length ?? 0} eventos recibidos.`);
        break;
      }
      const errBody = await res.text();
      console.warn(`[Odds API] Key ${label} respondi\xF3 con error ${res.status}: ${errBody}`);
    } catch (err) {
      console.warn(`[Odds API] Key ${label} fall\xF3 con excepci\xF3n:`, err);
    }
  }
  if (!activeKey || !data) {
    console.error("[Odds API] Todas las keys de The Odds API agotaron su cuota o fallaron.");
    if (fs7.existsSync(cacheFile) && fs7.statSync(cacheFile).size > 10) {
      console.log(`Recuperando cuotas del cach\xE9 existente debido a falla de la API.`);
      return JSON.parse(fs7.readFileSync(cacheFile, "utf-8"));
    }
    fs7.writeFileSync(cacheFile, JSON.stringify([]));
    return null;
  }
  try {
    const eventsWithProps = await Promise.all(data.map(async (event) => {
      try {
        const mlbGame = gamesList.find(
          (g) => (event.home_team.includes(g.teams.home.team.name) || g.teams.home.team.name.includes(event.home_team)) && (event.away_team.includes(g.teams.away.team.name) || g.teams.away.team.name.includes(event.away_team))
        );
        if (mlbGame) {
          const status = mlbGame.status?.abstractGameState || "";
          const statusCode = mlbGame.status?.statusCode || "";
          if (["Live", "Final", "Suspended"].includes(status) || ["F", "I", "O", "DI"].includes(statusCode)) {
            console.log(`Saltando props para ${event.home_team} vs ${event.away_team} porque su estado es ${status} (${statusCode})`);
            return event;
          }
        }
        const propsUrl = `https://api.the-odds-api.com/v4/sports/baseball_mlb/events/${event.id}/odds?apiKey=${activeKey}&regions=us&markets=pitcher_strikeouts&oddsFormat=american`;
        const propsRes = await fetchWithTimeout(propsUrl, 1e4);
        if (propsRes.ok) {
          const propsData = await propsRes.json();
          if (propsData && propsData.bookmakers) {
            for (const pb of propsData.bookmakers) {
              const existingB = event.bookmakers.find((b) => b.key === pb.key);
              if (existingB) {
                existingB.markets.push(...pb.markets);
              } else {
                event.bookmakers.push(pb);
              }
            }
          }
        }
      } catch (e) {
        console.warn(`Failed to fetch K props for event ${event.id}`);
      }
      return event;
    }));
    const dataStreakPitcherKs = await fetchDataStreakPitcherStrikeoutProps(date, forceRefreshOdds);
    const eventsWithDataStreakProps = mergeDataStreakPitcherStrikeouts(eventsWithProps, dataStreakPitcherKs);
    try {
      if (eventsWithDataStreakProps.length > 0 || !fs7.existsSync(cacheFile) || fs7.statSync(cacheFile).size < 10) {
        fs7.writeFileSync(cacheFile, JSON.stringify(eventsWithDataStreakProps, null, 2));
        console.log(`Cuotas guardadas en cache: odds_cache_${date}.json`);
      } else {
        console.log(`No se recibieron cuotas nuevas (posible fecha pasada). Conservando el cach\xE9 original: odds_cache_${date}.json`);
        return JSON.parse(fs7.readFileSync(cacheFile, "utf-8"));
      }
    } catch (e) {
      console.warn("No se pudo guardar el cache de cuotas.", e);
    }
    return eventsWithDataStreakProps;
  } catch (err) {
    console.error("Error al obtener lineas de apuestas reales:", err);
    return null;
  }
}
async function fetchRealMLBGameData(gamePk, homeTeamId, awayTeamId, date) {
  const season = date.substring(0, 4);
  const pitStatsCutoffDate = (() => {
    const d = /* @__PURE__ */ new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().split("T")[0];
  })();
  const realData = {
    pitchers: { home: null, away: null },
    lineups: { home: [], away: [] },
    teamOffense: { home: null, away: null },
    bullpenERA: { home: null, away: null },
    pitcherIds: { home: null, away: null },
    teamRecords: { home: "N/D", away: "N/D" },
    currentPitching: { home: null, away: null },
    linescore: null,
    liveBoxscore: null,
    playByPlay: null,
    injuries: { home: [], away: [] }
  };
  try {
    const schedRes = await fetchWithTimeout(
      `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}&hydrate=probablePitcher`
    );
    const schedData = await schedRes.json();
    let gameEntry = null;
    for (const d of schedData.dates || []) {
      for (const g of d.games || []) {
        if (String(g.gamePk) === String(gamePk)) {
          gameEntry = g;
          break;
        }
      }
    }
    const fetchPitcherStats = async (pitcher) => {
      if (!pitcher?.id) return null;
      try {
        const [statsRes, splitsRes, personRes] = await Promise.all([
          // CORREGIDO: stats=byDateRange sí respeta startDate/endDate (stats=season no).
          // endDate = pitStatsCutoffDate (día anterior al juego) para que sea genuinamente point-in-time.
          fetchWithTimeout(`https://statsapi.mlb.com/api/v1/people/${pitcher.id}/stats?stats=byDateRange&season=${season}&group=pitching&startDate=${season}-01-01&endDate=${pitStatsCutoffDate}&sportId=1`),
          // TODO(auditoría, sin verificar): no se pudo confirmar en vivo si stats=statSplits respeta
          // startDate/endDate de la misma forma que stats=season (sin acceso de red a statsapi.mlb.com
          // desde este entorno). Estos splits solo alimentan pitcher_allowed_avg/slg_vs_lhb/rhb, no las
          // columnas de temporada del bug reportado. Verificar manualmente antes de confiar en que esto
          // ya es point-in-time.
          fetchWithTimeout(`https://statsapi.mlb.com/api/v1/people/${pitcher.id}/stats?stats=statSplits&season=${season}&group=pitching&sitCodes=vl,vr&startDate=${season}-01-01&endDate=${date}`),
          fetchWithTimeout(`https://statsapi.mlb.com/api/v1/people/${pitcher.id}`)
        ]);
        const statsData = statsRes.ok ? await statsRes.json() : {};
        const splitsData = splitsRes.ok ? await splitsRes.json() : {};
        const personData = personRes.ok ? await personRes.json() : {};
        const s = statsData.stats?.[0]?.splits?.[0]?.stat || {};
        const bf = parseInt(s.battersFaced) || 1;
        const kPct = s.strikeOuts ? Math.round(parseInt(s.strikeOuts) / bf * 1e3) / 10 : null;
        const bbPct = s.baseOnBalls ? Math.round(parseInt(s.baseOnBalls) / bf * 1e3) / 10 : null;
        const pitchHand = personData.people?.[0]?.pitchHand?.code || "R";
        const splits = splitsData.stats?.[0]?.splits || [];
        let pitcher_allowed_avg_vs_lhb = 0;
        let pitcher_allowed_avg_vs_rhb = 0;
        let pitcher_allowed_slg_vs_lhb = 0;
        let pitcher_allowed_slg_vs_rhb = 0;
        for (const split of splits) {
          const code = split.split?.code;
          const stat = split.stat || {};
          if (code === "vl") {
            pitcher_allowed_avg_vs_lhb = safeFloat(stat.avg) ?? 0;
            pitcher_allowed_slg_vs_lhb = safeFloat(stat.slg) ?? 0;
          } else if (code === "vr") {
            pitcher_allowed_avg_vs_rhb = safeFloat(stat.avg) ?? 0;
            pitcher_allowed_slg_vs_rhb = safeFloat(stat.slg) ?? 0;
          }
        }
        return {
          name: pitcher.fullName,
          era: safeFloat(s.era),
          whip: safeFloat(s.whip),
          kPct,
          bbPct,
          wins: parseInt(s.wins) || 0,
          losses: parseInt(s.losses) || 0,
          ip: s.inningsPitched || "0.0",
          starts: parseInt(s.gamesPitched) || parseInt(s.gamesPlayed) || parseInt(s.gamesStarted) || 0,
          totalStrikeouts: parseInt(s.strikeOuts) || 0,
          totalWalks: parseInt(s.baseOnBalls) || 0,
          pitchHand,
          pitcher_allowed_avg_vs_lhb,
          pitcher_allowed_avg_vs_rhb,
          pitcher_allowed_slg_vs_lhb,
          pitcher_allowed_slg_vs_rhb
        };
      } catch (err) {
        console.error(`Error fetching stats/splits for pitcher ${pitcher.fullName}:`, err);
        return { name: pitcher.fullName };
      }
    };
    if (gameEntry) {
      realData.pitcherIds = {
        home: gameEntry.teams?.home?.probablePitcher?.id || null,
        away: gameEntry.teams?.away?.probablePitcher?.id || null
      };
      const homeRecord = gameEntry.teams?.home?.leagueRecord;
      const awayRecord = gameEntry.teams?.away?.leagueRecord;
      realData.teamRecords = {
        home: homeRecord ? `${homeRecord.wins}-${homeRecord.losses}` : "N/D",
        away: awayRecord ? `${awayRecord.wins}-${awayRecord.losses}` : "N/D"
      };
      const [homePitcher, awayPitcher] = await Promise.all([
        fetchPitcherStats(gameEntry.teams?.home?.probablePitcher),
        fetchPitcherStats(gameEntry.teams?.away?.probablePitcher)
      ]);
      realData.pitchers.home = homePitcher;
      realData.pitchers.away = awayPitcher;
    }
    const boxRes = await fetchWithTimeout(`https://statsapi.mlb.com/api/v1/game/${gamePk}/boxscore`);
    const boxData = await boxRes.json();
    const getStarterGamePitching = (teamBox) => {
      const starterId = teamBox?.pitchers?.[0];
      if (!starterId) return null;
      const starter = teamBox.players?.[`ID${starterId}`];
      if (!starter?.stats?.pitching) return null;
      const s = starter?.stats?.pitching || {};
      return {
        actualStrikeouts: parseInt(s.strikeOuts) || 0,
        battersFaced: parseInt(s.battersFaced) || 0,
        pitchCount: parseInt(s.numberOfPitches) || parseInt(s.pitchesThrown) || 0,
        ip: s.inningsPitched || "0.0"
      };
    };
    realData.currentPitching = {
      home: getStarterGamePitching(boxData.teams?.home),
      away: getStarterGamePitching(boxData.teams?.away)
    };
    const parseLineupFromBox = async (teamBox, teamName) => {
      if (!teamBox?.battingOrder?.length) return [];
      const players = teamBox.players || {};
      const promises = teamBox.battingOrder.map(async (id, idx) => {
        const p = players[`ID${id}`];
        if (!p?.person?.fullName) return null;
        const s = p.seasonStats?.batting || {};
        const playerId = p.person.id;
        const [last7, splits] = await Promise.all([
          fetchBatterLast7(playerId, season, date),
          fetchBatterSplits(playerId, season)
        ]);
        const plateAppearances = parseInt(s.plateAppearances) || 0;
        const strikeOuts = parseInt(s.strikeOuts) || 0;
        const baseOnBalls = parseInt(s.baseOnBalls) || 0;
        const hits = parseInt(s.hits) || 0;
        const doubles = parseInt(s.doubles) || 0;
        const triples = parseInt(s.triples) || 0;
        const homeRuns = parseInt(s.homeRuns) || 0;
        const sacrificeFlies = parseInt(s.sacrificeFlies) || 0;
        const hitByPitch = parseInt(s.hitByPitch) || 0;
        const intentionalWalks = parseInt(s.intentionalWalks) || 0;
        const atBats = parseInt(s.atBats) || 0;
        const avg = safeFloat(s.avg) ?? 0;
        const obp = safeFloat(s.obp) ?? 0;
        const slg = safeFloat(s.slg) ?? 0;
        const ops = safeFloat(s.ops) ?? 0;
        const iso = slg > 0 && avg > 0 ? Math.round((slg - avg) * 1e3) / 1e3 : 0;
        const strikeout_pct = plateAppearances > 0 ? Math.round(strikeOuts / plateAppearances * 1e3) / 10 : 0;
        const walk_pct = plateAppearances > 0 ? Math.round(baseOnBalls / plateAppearances * 1e3) / 10 : 0;
        const singles = hits - doubles - triples - homeRuns;
        const wobaDenom = atBats + baseOnBalls - intentionalWalks + sacrificeFlies + hitByPitch;
        const woba = wobaDenom > 0 ? Math.round((0.69 * (baseOnBalls - intentionalWalks) + 0.72 * hitByPitch + 0.88 * singles + 1.25 * doubles + 1.58 * triples + 2.05 * homeRuns) / wobaDenom * 1e3) / 1e3 : 0;
        return {
          name: p.person.fullName,
          id: playerId,
          mlbId: playerId,
          position: p.position?.abbreviation || "DH",
          avg,
          ops,
          hr: homeRuns,
          rbi: parseInt(s.rbi) || 0,
          kPct: strikeout_pct,
          // New fields
          player_name: p.person.fullName,
          team: teamName,
          bat_side: p.person.batSide?.code || "R",
          obp,
          slg,
          woba,
          iso,
          pa: plateAppearances,
          hits,
          doubles,
          triples,
          home_runs: homeRuns,
          strikeout_pct,
          walk_pct,
          batting_order: idx + 1,
          // Last 7 days & splits
          ...last7,
          ...splits
        };
      });
      const results = await Promise.all(promises);
      return results.filter(Boolean);
    };
    const [homeLineup, awayLineup] = await Promise.all([
      parseLineupFromBox(boxData.teams?.home, boxData.teams?.home?.team?.name || gameEntry?.teams?.home?.team?.name || "Home"),
      parseLineupFromBox(boxData.teams?.away, boxData.teams?.away?.team?.name || gameEntry?.teams?.away?.team?.name || "Away")
    ]);
    realData.lineups.home = homeLineup;
    realData.lineups.away = awayLineup;
    const parseLiveStats = (teamBox) => {
      const batters = [];
      const pitchers = [];
      if (!teamBox?.players) return { batters, pitchers };
      const players = teamBox.players;
      if (teamBox.batters) {
        teamBox.batters.forEach((id) => {
          const p = players[`ID${id}`];
          if (!p) return;
          const s = p.stats?.batting || {};
          const liveHits = s.hits || 0;
          const liveDbl = s.doubles || 0;
          const liveTpl = s.triples || 0;
          const liveHr = s.homeRuns || 0;
          const liveSingles = Math.max(0, liveHits - liveDbl - liveTpl - liveHr);
          batters.push({
            id,
            name: p.person?.fullName || "Bateador",
            position: p.position?.abbreviation || "DH",
            ab: s.atBats || 0,
            r: s.runs || 0,
            h: liveHits,
            rbi: s.rbi || 0,
            bb: s.baseOnBalls || 0,
            k: s.strikeOuts || 0,
            doubles: liveDbl,
            triples: liveTpl,
            home_runs: liveHr,
            total_bases: liveSingles + 2 * liveDbl + 3 * liveTpl + 4 * liveHr
          });
        });
      }
      if (teamBox.pitchers) {
        teamBox.pitchers.forEach((id) => {
          const p = players[`ID${id}`];
          if (!p) return;
          const s = p.stats?.pitching || {};
          pitchers.push({
            id,
            name: p.person?.fullName || "Lanzador",
            position: "P",
            ip: s.inningsPitched || "0.0",
            h: s.hits || 0,
            r: s.runs || 0,
            er: s.earnedRuns || 0,
            bb: s.baseOnBalls || 0,
            k: s.strikeOuts || 0,
            bf: s.battersFaced ?? "",
            pitches: s.numberOfPitches || 0,
            strikes: s.strikes || 0
          });
        });
      }
      return { batters, pitchers };
    };
    realData.liveBoxscore = {
      home: parseLiveStats(boxData.teams?.home),
      away: parseLiveStats(boxData.teams?.away)
    };
    const fetchTopBattersFromRoster = async (teamId, teamName) => {
      try {
        const r = await fetchWithTimeout(
          `https://statsapi.mlb.com/api/v1/teams/${teamId}/roster?rosterType=active&season=${season}&hydrate=person(stats(type=season,group=hitting))`
        );
        const d = await r.json();
        const roster = d.roster || [];
        const top9 = roster.filter((p) => {
          const pa = parseInt(
            p.person?.stats?.[0]?.splits?.[0]?.stat?.plateAppearances || "0"
          );
          return pa > 0;
        }).sort((a, b) => {
          const paA = parseInt(a.person?.stats?.[0]?.splits?.[0]?.stat?.plateAppearances || "0");
          const paB = parseInt(b.person?.stats?.[0]?.splits?.[0]?.stat?.plateAppearances || "0");
          return paB - paA;
        }).slice(0, 9);
        const promises = top9.map(async (p, idx) => {
          const s = p.person?.stats?.[0]?.splits?.[0]?.stat || {};
          const playerId = p.person.id;
          const [last7, splits] = await Promise.all([
            fetchBatterLast7(playerId, season, date),
            fetchBatterSplits(playerId, season)
          ]);
          const plateAppearances = parseInt(s.plateAppearances) || 0;
          const strikeOuts = parseInt(s.strikeOuts) || 0;
          const baseOnBalls = parseInt(s.baseOnBalls) || 0;
          const hits = parseInt(s.hits) || 0;
          const doubles = parseInt(s.doubles) || 0;
          const triples = parseInt(s.triples) || 0;
          const homeRuns = parseInt(s.homeRuns) || 0;
          const sacrificeFlies = parseInt(s.sacrificeFlies) || 0;
          const hitByPitch = parseInt(s.hitByPitch) || 0;
          const intentionalWalks = parseInt(s.intentionalWalks) || 0;
          const atBats = parseInt(s.atBats) || 0;
          const avg = safeFloat(s.avg) ?? 0;
          const obp = safeFloat(s.obp) ?? 0;
          const slg = safeFloat(s.slg) ?? 0;
          const ops = safeFloat(s.ops) ?? 0;
          const iso = slg > 0 && avg > 0 ? Math.round((slg - avg) * 1e3) / 1e3 : 0;
          const strikeout_pct = plateAppearances > 0 ? Math.round(strikeOuts / plateAppearances * 1e3) / 10 : 0;
          const walk_pct = plateAppearances > 0 ? Math.round(baseOnBalls / plateAppearances * 1e3) / 10 : 0;
          const singles = hits - doubles - triples - homeRuns;
          const wobaDenom = atBats + baseOnBalls - intentionalWalks + sacrificeFlies + hitByPitch;
          const woba = wobaDenom > 0 ? Math.round((0.69 * (baseOnBalls - intentionalWalks) + 0.72 * hitByPitch + 0.88 * singles + 1.25 * doubles + 1.58 * triples + 2.05 * homeRuns) / wobaDenom * 1e3) / 1e3 : 0;
          return {
            name: p.person.fullName,
            id: playerId,
            mlbId: playerId,
            position: p.position?.abbreviation || "DH",
            avg,
            ops,
            hr: homeRuns,
            rbi: parseInt(s.rbi) || 0,
            kPct: strikeout_pct,
            // New fields
            player_name: p.person.fullName,
            team: teamName,
            bat_side: p.person.batSide?.code || "R",
            obp,
            slg,
            woba,
            iso,
            pa: plateAppearances,
            hits,
            doubles,
            triples,
            home_runs: homeRuns,
            strikeout_pct,
            walk_pct,
            batting_order: idx + 1,
            // Last 7 days & splits
            ...last7,
            ...splits
          };
        });
        const results = await Promise.all(promises);
        return results;
      } catch {
        return [];
      }
    };
    if (realData.lineups.home.length === 0) {
      const homeTeamName = boxData.teams?.home?.team?.name || gameEntry?.teams?.home?.team?.name || "Home";
      realData.lineups.home = await fetchTopBattersFromRoster(homeTeamId, homeTeamName);
    }
    if (realData.lineups.away.length === 0) {
      const awayTeamName = boxData.teams?.away?.team?.name || gameEntry?.teams?.away?.team?.name || "Away";
      realData.lineups.away = await fetchTopBattersFromRoster(awayTeamId, awayTeamName);
    }
    const fetchTeamOffense = async (teamId) => {
      try {
        const r = await fetchWithTimeout(
          `https://statsapi.mlb.com/api/v1/teams/${teamId}/stats?stats=season&season=${season}&group=hitting`
        );
        const d = await r.json();
        const s = d.stats?.[0]?.splits?.[0]?.stat || {};
        const games = parseInt(s.gamesPlayed) || 1;
        return {
          runsPerGame: s.runs ? Math.round(parseInt(s.runs) / games * 10) / 10 : null,
          strikeoutsPerGame: s.strikeOuts ? Math.round(parseInt(s.strikeOuts) / games * 10) / 10 : null,
          ops: safeFloat(s.ops),
          obp: safeFloat(s.obp),
          slg: safeFloat(s.slg)
        };
      } catch {
        return null;
      }
    };
    const fetchTeamBullpenERA = async (teamId) => {
      try {
        const r = await fetchWithTimeout(
          `https://statsapi.mlb.com/api/v1/teams/${teamId}/stats?group=pitching&stats=statSplits&sitCodes=rp&season=${season}`
        );
        const d = await r.json();
        const s = d.stats?.[0]?.splits?.[0]?.stat || {};
        return safeFloat(s.era);
      } catch {
        return null;
      }
    };
    const fetchLinescore = async () => {
      try {
        const r = await fetchWithTimeout(`https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`);
        const fullD = await r.json();
        const d = fullD?.liveData?.linescore;
        if (!d || !d.innings) return null;
        return {
          innings: d.innings.map((i) => ({
            num: i.num,
            home: { runs: i.home?.runs || 0, hits: i.home?.hits || 0, errors: i.home?.errors || 0 },
            away: { runs: i.away?.runs || 0, hits: i.away?.hits || 0, errors: i.away?.errors || 0 }
          })),
          homeTotals: { runs: d.teams?.home?.runs || 0, hits: d.teams?.home?.hits || 0, errors: d.teams?.home?.errors || 0 },
          awayTotals: { runs: d.teams?.away?.runs || 0, hits: d.teams?.away?.hits || 0, errors: d.teams?.away?.errors || 0 },
          currentInning: d.currentInning,
          currentInningOrdinal: d.currentInningOrdinal,
          inningState: d.inningState,
          inningHalf: d.inningHalf,
          isTopInning: d.isTopInning,
          balls: d.balls,
          strikes: d.strikes,
          outs: d.outs,
          defense: d.defense?.pitcher ? {
            pitcher: { id: d.defense.pitcher.id, fullName: d.defense.pitcher.fullName }
          } : void 0,
          offense: d.offense ? {
            batter: d.offense.batter ? { id: d.offense.batter.id, fullName: d.offense.batter.fullName } : void 0,
            first: d.offense.first ? { id: d.offense.first.id, fullName: d.offense.first.fullName } : void 0,
            second: d.offense.second ? { id: d.offense.second.id, fullName: d.offense.second.fullName } : void 0,
            third: d.offense.third ? { id: d.offense.third.id, fullName: d.offense.third.fullName } : void 0
          } : void 0
        };
      } catch {
        return null;
      }
    };
    const fetchPxP = async () => {
      try {
        const r = await fetchWithTimeout(`https://statsapi.mlb.com/api/v1/game/${gamePk}/playByPlay`);
        const d = await r.json();
        const allPlays = d.allPlays || [];
        const mappedAllPlays = allPlays.map((p) => ({
          description: p.result?.description || "",
          inning: `${p.about?.halfInning === "top" ? "Top" : "Bot"} ${p.about?.inning || 1}`,
          score: `${p.result?.awayScore || 0} - ${p.result?.homeScore || 0}`,
          isScoringPlay: p.about?.isScoringPlay || false
        }));
        const scoring = mappedAllPlays.filter((p) => p.isScoringPlay);
        let currentPlay = null;
        const cp = d.currentPlay;
        if (cp) {
          currentPlay = {
            description: cp.result?.description || cp.playEvents?.[cp.playEvents.length - 1]?.details?.description || "En progreso...",
            inning: `${cp.about?.halfInning === "top" ? "Top" : "Bot"} ${cp.about?.inning || 1}`,
            score: `${cp.result?.awayScore || 0} - ${cp.result?.homeScore || 0}`,
            isScoringPlay: cp.about?.isScoringPlay || false
          };
        }
        return { scoringPlays: scoring, currentPlay, allPlays: mappedAllPlays };
      } catch {
        return null;
      }
    };
    const fetchInjuries = async (teamId) => {
      try {
        const r = await fetchWithTimeout(`https://statsapi.mlb.com/api/v1/teams/${teamId}/roster?rosterType=40Man`);
        const d = await r.json();
        const roster = d.roster || [];
        return roster.filter((p) => p.status.code !== "A").map((p) => ({
          player: p.person.fullName,
          status: p.status.description || p.status.code,
          detail: "Reporte oficial de MLB (40-Man Roster)"
        }));
      } catch {
        return [];
      }
    };
    const [homeOff, awayOff, homeBullpenERA, awayBullpenERA, ls, pxp, homeInj, awayInj] = await Promise.all([
      fetchTeamOffense(homeTeamId),
      fetchTeamOffense(awayTeamId),
      fetchTeamBullpenERA(homeTeamId),
      fetchTeamBullpenERA(awayTeamId),
      fetchLinescore(),
      fetchPxP(),
      fetchInjuries(homeTeamId),
      fetchInjuries(awayTeamId)
    ]);
    realData.teamOffense.home = homeOff;
    realData.teamOffense.away = awayOff;
    realData.bullpenERA.home = homeBullpenERA;
    realData.bullpenERA.away = awayBullpenERA;
    realData.linescore = ls;
    realData.playByPlay = pxp;
    realData.injuries.home = homeInj;
    realData.injuries.away = awayInj;
  } catch (err) {
    console.error(`Error fetching real MLB data for game ${gamePk}:`, err);
  }
  return realData;
}
var STADIUM_COORDINATES = {
  "chase field": { lat: 33.4453, lon: -112.0667, timezone: "America/Phoenix" },
  "truist park": { lat: 33.8907, lon: -84.4678, timezone: "America/New_York" },
  "camden yards": { lat: 39.284, lon: -76.6216, timezone: "America/New_York" },
  "oriole park": { lat: 39.284, lon: -76.6216, timezone: "America/New_York" },
  "fenway park": { lat: 42.3467, lon: -71.0972, timezone: "America/New_York" },
  "wrigley field": { lat: 41.9484, lon: -87.6553, timezone: "America/Chicago" },
  "guaranteed rate field": { lat: 41.8299, lon: -87.6337, timezone: "America/Chicago" },
  "great american ball park": { lat: 39.0979, lon: -84.5071, timezone: "America/New_York" },
  "progressive field": { lat: 41.4958, lon: -81.6852, timezone: "America/New_York" },
  "coors field": { lat: 39.7558, lon: -104.9942, timezone: "America/Denver" },
  "comerica park": { lat: 42.339, lon: -83.0485, timezone: "America/New_York" },
  "minute maid park": { lat: 29.7573, lon: -95.3555, timezone: "America/Chicago" },
  "kauffman stadium": { lat: 39.0517, lon: -94.4803, timezone: "America/Chicago" },
  "angel stadium": { lat: 33.8003, lon: -117.8827, timezone: "America/Los_Angeles" },
  "dodger stadium": { lat: 34.0739, lon: -118.24, timezone: "America/Los_Angeles" },
  "loandepot park": { lat: 25.7781, lon: -80.2197, timezone: "America/New_York" },
  "marlins park": { lat: 25.7781, lon: -80.2197, timezone: "America/New_York" },
  "american family field": { lat: 43.0285, lon: -87.9712, timezone: "America/Chicago" },
  "miller park": { lat: 43.0285, lon: -87.9712, timezone: "America/Chicago" },
  "target field": { lat: 44.9817, lon: -93.2778, timezone: "America/Chicago" },
  "citi field": { lat: 40.7571, lon: -73.8458, timezone: "America/New_York" },
  "yankee stadium": { lat: 40.8296, lon: -73.9262, timezone: "America/New_York" },
  "coliseum": { lat: 37.7516, lon: -122.2005, timezone: "America/Los_Angeles" },
  "citizens bank park": { lat: 39.9061, lon: -75.1665, timezone: "America/New_York" },
  "pnc park": { lat: 40.4469, lon: -80.0057, timezone: "America/New_York" },
  "petco park": { lat: 32.7073, lon: -117.1567, timezone: "America/Los_Angeles" },
  "oracle park": { lat: 37.7786, lon: -122.3892, timezone: "America/Los_Angeles" },
  "at&t park": { lat: 37.7786, lon: -122.3892, timezone: "America/Los_Angeles" },
  "t-mobile park": { lat: 47.5914, lon: -122.3325, timezone: "America/Los_Angeles" },
  "safeco field": { lat: 47.5914, lon: -122.3325, timezone: "America/Los_Angeles" },
  "busch stadium": { lat: 38.6226, lon: -90.1928, timezone: "America/Chicago" },
  "tropicana field": { lat: 27.7682, lon: -82.6534, timezone: "America/New_York" },
  "globe life field": { lat: 32.7473, lon: -97.0817, timezone: "America/Chicago" },
  "rogers centre": { lat: 43.6414, lon: -79.3894, timezone: "America/New_York" },
  "nationals park": { lat: 38.873, lon: -77.0074, timezone: "America/New_York" }
};
function weatherCodeToSkyStatus(code) {
  if (code === 0) return "Cielo Despejado";
  if (code >= 1 && code <= 3) return "Parcialmente Nublado";
  if (code === 45 || code === 48) return "Niebla";
  if (code >= 51 && code <= 55 || code >= 61 && code <= 65 || code >= 80 && code <= 82) return "Lluvia";
  if (code >= 71 && code <= 77) return "Nieve";
  if (code >= 95) return "Tormenta";
  return "Despejado";
}
async function fetchWeatherData(venue, date, gameDateISO) {
  try {
    const venueLower = venue.toLowerCase();
    let coords = STADIUM_COORDINATES["yankee stadium"];
    for (const key of Object.keys(STADIUM_COORDINATES)) {
      if (venueLower.includes(key)) {
        coords = STADIUM_COORDINATES[key];
        break;
      }
    }
    const { lat, lon, timezone } = coords;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&start_date=${date}&end_date=${date}&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation_probability,pressure_msl,wind_speed_10m,wind_direction_10m,weather_code&timezone=${encodeURIComponent(timezone)}`;
    const res = await fetchWithTimeout(url, 5e3);
    if (!res.ok) {
      console.warn(`Open-Meteo responded with status ${res.status}`);
      return void 0;
    }
    const data = await res.json();
    if (!data.hourly || !data.hourly.time) return void 0;
    const hourStr = new Date(gameDateISO).toLocaleTimeString("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      hour12: false
    });
    const hour = parseInt(hourStr) || 12;
    const idx = Math.min(Math.max(hour, 0), 23);
    const hData = data.hourly;
    return {
      temp: safeFloat(hData.temperature_2m?.[idx]) ?? 20,
      humidity: safeFloat(hData.relative_humidity_2m?.[idx]) ?? 50,
      windSpeed: safeFloat(hData.wind_speed_10m?.[idx]) ?? 10,
      windDirection: safeFloat(hData.wind_direction_10m?.[idx]) ?? 0,
      pressure: safeFloat(hData.pressure_msl?.[idx]) ?? 1013,
      rainProbability: safeFloat(hData.precipitation_probability?.[idx]) ?? 0,
      skyStatus: weatherCodeToSkyStatus(hData.weather_code?.[idx] ?? 0),
      apparentTemp: safeFloat(hData.apparent_temperature?.[idx]) ?? 20,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
  } catch (err) {
    console.error(`Error fetching weather for venue ${venue}:`, err);
    return void 0;
  }
}
async function fetchOffensiveSplits(teamId, season) {
  const defaultSplit = { avg: 0.25, ops: 0.72, obp: 0.32, slg: 0.4, runsPerGame: 4.5, hr: 15, kPct: 20 };
  try {
    const url = `https://statsapi.mlb.com/api/v1/teams/${teamId}/stats?stats=statSplits&season=${season}&group=hitting&sitCodes=vl,vr`;
    const res = await fetchWithTimeout(url, 6e3);
    if (!res.ok) return { vsRhp: defaultSplit, vsLhp: defaultSplit };
    const data = await res.json();
    const splits = data.stats?.[0]?.splits || [];
    let vsRhp = { ...defaultSplit };
    let vsLhp = { ...defaultSplit };
    for (const split of splits) {
      const code = split.split?.code;
      const s = split.stat || {};
      const gp = parseInt(s.gamesPlayed) || 1;
      const pa = parseInt(s.plateAppearances) || 0;
      const so = parseInt(s.strikeOuts) || 0;
      const splitData = {
        avg: safeFloat(s.avg) ?? 0.25,
        ops: safeFloat(s.ops) ?? 0.72,
        obp: safeFloat(s.obp) ?? 0.32,
        slg: safeFloat(s.slg) ?? 0.4,
        runsPerGame: s.runs ? Math.round(parseInt(s.runs) / gp * 10) / 10 : 4.5,
        hr: parseInt(s.homeRuns) || 0,
        kPct: pa > 0 ? Math.round(so / pa * 1e3) / 10 : 20
      };
      if (code === "vr") {
        vsRhp = splitData;
      } else if (code === "vl") {
        vsLhp = splitData;
      }
    }
    return { vsRhp, vsLhp };
  } catch (err) {
    console.error(`Error fetching splits for team ${teamId}:`, err);
    return { vsRhp: defaultSplit, vsLhp: defaultSplit };
  }
}
async function fetchAdvancedPitching(pitcherId2, season) {
  const defaults = {
    xEra: null,
    fip: null,
    xFip: null,
    siera: null,
    hardHitPct: null,
    barrelPct: null,
    groundBallPct: null,
    flyBallPct: null,
    strikeoutRate: null,
    walkRate: null,
    swingingStrikePct: null,
    projectedInnings: null,
    pitcher_k_pct_vs_lhb: null,
    pitcher_k_pct_vs_rhb: null
  };
  if (!pitcherId2) return defaults;
  try {
    const stdUrl = `https://statsapi.mlb.com/api/v1/people/${pitcherId2}/stats?stats=season,seasonAdvanced&season=${season}&group=pitching`;
    const splitsUrl = `https://statsapi.mlb.com/api/v1/people/${pitcherId2}/stats?stats=statSplits&season=${season}&group=pitching&sitCodes=vl,vr`;
    const [stdRes, splitsRes] = await Promise.all([
      fetchWithTimeout(stdUrl, 5e3),
      fetchWithTimeout(splitsUrl, 5e3)
    ]);
    let stdStat = {};
    let advStat = {};
    let pitcher_k_pct_vs_lhb = null;
    let pitcher_k_pct_vs_rhb = null;
    if (stdRes.ok) {
      const stdData = await stdRes.json();
      const seasonStats = stdData.stats?.find((s) => s.type.displayName === "season");
      const advancedStats = stdData.stats?.find((s) => s.type.displayName === "seasonAdvanced");
      stdStat = seasonStats?.splits?.[0]?.stat || {};
      advStat = advancedStats?.splits?.[0]?.stat || {};
    }
    if (splitsRes.ok) {
      const splitsData = await splitsRes.json();
      const splits = splitsData.stats?.[0]?.splits || [];
      for (const split of splits) {
        const code = split.split?.code;
        const stat = split.stat || {};
        const bf2 = parseInt(stat.battersFaced) || 0;
        const so2 = parseInt(stat.strikeOuts) || 0;
        const kPct = bf2 > 0 ? Math.round(so2 / bf2 * 1e3) / 10 : null;
        if (code === "vl") pitcher_k_pct_vs_lhb = kPct;
        if (code === "vr") pitcher_k_pct_vs_rhb = kPct;
      }
    }
    if (!stdStat.inningsPitched) {
      return defaults;
    }
    const hr = parseInt(stdStat.homeRuns) || 0;
    const bb = parseInt(stdStat.baseOnBalls) || 0;
    const hbp = parseInt(stdStat.hitByPitch) || 0;
    const so = parseInt(stdStat.strikeOuts) || 0;
    const ipOuts = inningsToOuts(stdStat.inningsPitched);
    const ip = ipOuts > 0 ? ipOuts / 3 : 0;
    const fipConstant = 3.2;
    const fip = ip > 0 ? roundNumber((13 * hr + 3 * (bb + hbp) - 2 * so) / ip + fipConstant, 2) : null;
    const bf = parseInt(stdStat.battersFaced) || 0;
    const strikeoutRate = bf > 0 && stdStat.strikeOuts ? Math.round(parseInt(stdStat.strikeOuts) / bf * 1e3) / 10 : null;
    const walkRate = bf > 0 && stdStat.baseOnBalls ? Math.round(parseInt(stdStat.baseOnBalls) / bf * 1e3) / 10 : null;
    let groundBallPct = null;
    let flyBallPct = null;
    const gb = (parseInt(advStat.groundHits) || 0) + (parseInt(advStat.groundOuts) || 0);
    const fb = (parseInt(advStat.flyHits) || 0) + (parseInt(advStat.flyOuts) || 0);
    const ld = (parseInt(advStat.lineHits) || 0) + (parseInt(advStat.lineOuts) || 0);
    const pu = (parseInt(advStat.popHits) || 0) + (parseInt(advStat.popOuts) || 0);
    const totalBip = gb + fb + ld + pu;
    const leagueHrPerFlyBallRate = 0.105;
    const xHr = fb * leagueHrPerFlyBallRate;
    const xFip = ip > 0 && fb > 0 ? roundNumber((13 * xHr + 3 * (bb + hbp) - 2 * so) / ip + fipConstant, 2) : null;
    const soPerPa = bf > 0 ? so / bf : null;
    const bbPerPa = bf > 0 ? (bb + hbp) / bf : null;
    const gbMinusFbPuPerPa = bf > 0 ? (gb - fb - pu) / bf : null;
    const siera = soPerPa !== null && bbPerPa !== null && gbMinusFbPuPerPa !== null ? roundNumber(
      6.145 - 16.986 * soPerPa + 11.434 * bbPerPa - 1.858 * gbMinusFbPuPerPa + 7.653 * Math.pow(soPerPa, 2) + 6.664 * Math.pow(gbMinusFbPuPerPa, 2) + 10.13 * soPerPa * gbMinusFbPuPerPa - 5.195 * bbPerPa * gbMinusFbPuPerPa,
      2
    ) : null;
    if (totalBip > 0) {
      groundBallPct = Math.round(gb / totalBip * 1e3) / 10;
      flyBallPct = Math.round(fb / totalBip * 1e3) / 10;
    } else {
      const go = parseInt(stdStat.groundOuts) || 0;
      const ao = parseInt(stdStat.airOuts) || 0;
      const totalOuts = go + ao;
      groundBallPct = totalOuts > 0 ? Math.round(go / totalOuts * 1e3) / 10 : null;
      flyBallPct = totalOuts > 0 ? Math.round(ao / totalOuts * 1e3) / 10 : null;
    }
    const pitches = stdStat.numberOfPitches ? parseInt(stdStat.numberOfPitches) : bf && advStat.pitchesPerPlateAppearance ? Math.round(bf * parseFloat(advStat.pitchesPerPlateAppearance)) : 0;
    const swingingStrikePct = pitches > 0 && advStat.swingAndMisses ? Math.round(parseInt(advStat.swingAndMisses) / pitches * 1e3) / 10 : null;
    const gs = parseInt(stdStat.gamesPitched) || parseInt(stdStat.gamesPlayed) || parseInt(stdStat.gamesStarted) || 0;
    const projectedPitchCount = saneAveragePitchCount(gs > 0 ? Math.round((parseInt(stdStat.numberOfPitches) || 0) / gs) : null);
    const battersFacedPerStart = saneBattersFacedPerStart(gs > 0 ? Math.round((parseInt(stdStat.battersFaced) || 0) / gs * 10) / 10 : null);
    const strikes = parseInt(stdStat.strikes) || 0;
    const totalSwings = parseInt(advStat.totalSwings) || 0;
    const swingAndMisses = parseInt(advStat.swingAndMisses) || 0;
    const cswPct = pitches > 0 && strikes > 0 && totalSwings > 0 ? Math.round((strikes - totalSwings + swingAndMisses) / pitches * 1e3) / 10 : null;
    return {
      xEra: null,
      fip,
      xFip,
      siera,
      hardHitPct: null,
      barrelPct: null,
      groundBallPct,
      flyBallPct,
      strikeoutRate,
      walkRate,
      swingingStrikePct,
      cswPct,
      projectedPitchCount,
      battersFacedPerStart,
      pitcher_k_pct_vs_lhb,
      pitcher_k_pct_vs_rhb
    };
  } catch (err) {
    console.error(`Error fetching advanced pitching for ${pitcherId2}:`, err);
    return defaults;
  }
}
async function fetchAdvancedPitchingLast7(pitcherId2, season, targetDateStr) {
  const defaults = {
    xEra: null,
    fip: null,
    xFip: null,
    siera: null,
    hardHitPct: null,
    barrelPct: null,
    groundBallPct: null,
    flyBallPct: null,
    strikeoutRate: null,
    walkRate: null,
    swingingStrikePct: null,
    projectedInnings: null
  };
  if (!pitcherId2) return defaults;
  try {
    const url = `https://statsapi.mlb.com/api/v1/people/${pitcherId2}/stats?stats=gameLog&season=${season}&group=pitching`;
    const res = await fetchWithTimeout(url, 5e3);
    if (!res.ok) return defaults;
    const data = await res.json();
    let logs = data.stats?.[0]?.splits || [];
    const targetDate = new Date(targetDateStr);
    logs = logs.filter((log) => log.date && new Date(log.date) < targetDate);
    logs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    logs = logs.slice(0, 7);
    if (logs.length === 0) return defaults;
    let hr = 0, bb = 0, hbp = 0, so = 0, ipOuts = 0, bf = 0, go = 0, ao = 0;
    let er = 0, hits = 0, wins = 0, losses = 0;
    for (const log of logs) {
      const s = log.stat || {};
      hr += parseInt(s.homeRuns) || 0;
      bb += parseInt(s.baseOnBalls) || 0;
      hbp += parseInt(s.hitByPitch) || 0;
      so += parseInt(s.strikeOuts) || 0;
      bf += parseInt(s.battersFaced) || 0;
      go += parseInt(s.groundOuts) || 0;
      ao += parseInt(s.airOuts) || 0;
      const ipStr = String(s.inningsPitched || "0.0");
      const parts = ipStr.split(".");
      const w = parseInt(parts[0]) || 0;
      const f = parseInt(parts[1]) || 0;
      ipOuts += w * 3 + f;
      er += parseInt(s.earnedRuns) || 0;
      hits += parseInt(s.hits) || 0;
      if (s.wins && parseInt(s.wins) > 0) wins++;
      if (s.losses && parseInt(s.losses) > 0) losses++;
    }
    const ip = ipOuts / 3;
    const fip = ip > 0 ? Math.round(((13 * hr + 3 * (bb + hbp) - 2 * so) / ip + 3.2) * 100) / 100 : null;
    const strikeoutRate = bf > 0 ? Math.round(so / bf * 1e3) / 10 : null;
    const walkRate = bf > 0 ? Math.round(bb / bf * 1e3) / 10 : null;
    const totalOuts = go + ao;
    const groundBallPct = totalOuts > 0 ? Math.round(go / totalOuts * 1e3) / 10 : null;
    const flyBallPct = totalOuts > 0 ? Math.round(ao / totalOuts * 1e3) / 10 : null;
    const era = ip > 0 ? (er * 9 / ip).toFixed(2) : null;
    const whip = ip > 0 ? ((bb + hits) / ip).toFixed(2) : null;
    const ipString = `${Math.floor(ipOuts / 3)}.${ipOuts % 3}`;
    return {
      ...defaults,
      fip,
      strikeoutRate,
      walkRate,
      groundBallPct,
      flyBallPct,
      era,
      whip,
      ip: ipString,
      wins,
      losses
    };
  } catch (err) {
    console.error(`Error fetching last 7 for ${pitcherId2}:`, err);
    return defaults;
  }
}
async function fetchPitcherLast5Profile(pitcherId2, season, targetDateStr) {
  if (!pitcherId2) return {};
  try {
    const url = `https://statsapi.mlb.com/api/v1/people/${pitcherId2}/stats?stats=gameLog&season=${season}&group=pitching`;
    const res = await fetchWithTimeout(url, 5e3);
    if (!res.ok) return {};
    const data = await res.json();
    const targetDate = new Date(targetDateStr);
    let logs = data.stats?.[0]?.splits || [];
    logs = logs.filter((log) => log.date && new Date(log.date) < targetDate).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const starts = logs.filter((log) => {
      const s = log.stat || {};
      const gamesStarted = parseInt(s.gamesStarted);
      if (!isNaN(gamesStarted)) return gamesStarted > 0;
      return inningsToOuts(s.inningsPitched) >= 9;
    });
    const last5 = (starts.length > 0 ? starts : logs).slice(0, 5);
    if (last5.length === 0) return {};
    const ks = last5.map((log) => parseInt(log.stat?.strikeOuts) || 0);
    const ip = last5.map((log) => outsToInnings(inningsToOuts(log.stat?.inningsPitched)));
    const bf = last5.map((log) => parseInt(log.stat?.battersFaced) || 0).filter((value) => value > 0);
    const pitchCounts = last5.map((log) => parseInt(log.stat?.numberOfPitches) || parseInt(log.stat?.pitchesThrown) || 0).filter((value) => value > 0);
    const last5BfAvg = saneBattersFacedPerStart(average(bf, 1));
    const last5PitchCountAvg = saneAveragePitchCount(average(pitchCounts, 0));
    const last3 = last5.slice(0, 3);
    const last3Ks = last3.map((log) => parseInt(log.stat?.strikeOuts) || 0);
    const last3Ip = last3.map((log) => outsToInnings(inningsToOuts(log.stat?.inningsPitched)));
    const last3Bf = last3.map((log) => parseInt(log.stat?.battersFaced) || 0);
    return {
      last5KsAvg: average(ks, 2),
      last5KsStd: standardDeviation(ks, 2),
      last5IpAvg: average(ip, 1),
      last5BfAvg,
      last5PitchCountAvg,
      last3Ks1: last3Ks[0] ?? null,
      last3Ks2: last3Ks[1] ?? null,
      last3Ks3: last3Ks[2] ?? null,
      last3Ip1: last3Ip[0] ?? null,
      last3Ip2: last3Ip[1] ?? null,
      last3Ip3: last3Ip[2] ?? null,
      last3Bf1: last3Bf[0] || null,
      last3Bf2: last3Bf[1] || null,
      last3Bf3: last3Bf[2] || null,
      projectedPitchCount: last5PitchCountAvg,
      battersFacedPerStart: last5BfAvg
    };
  } catch (err) {
    console.error(`Error fetching last 5 profile for pitcher ${pitcherId2}:`, err);
    return {};
  }
}
async function fetchBatterLast7(batterId, season, targetDateStr) {
  const defaults = {
    last7_avg: 0,
    last7_ops: 0,
    last7_slg: 0,
    last7_total_bases: 0,
    last7_hits: 0,
    last7_xbh: 0
  };
  if (!batterId) return defaults;
  try {
    const url = `https://statsapi.mlb.com/api/v1/people/${batterId}/stats?stats=gameLog&season=${season}&group=hitting`;
    const res = await fetchWithTimeout(url, 5e3);
    if (!res.ok) return defaults;
    const data = await res.json();
    let logs = data.stats?.[0]?.splits || [];
    const targetDate = new Date(targetDateStr);
    logs = logs.filter((log) => log.date && new Date(log.date) < targetDate);
    logs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    logs = logs.slice(0, 7);
    if (logs.length === 0) return defaults;
    let hits = 0, ab = 0, doubles = 0, triples = 0, hr = 0, bb = 0, hbp = 0, sf = 0;
    for (const log of logs) {
      const s = log.stat || {};
      hits += parseInt(s.hits) || 0;
      ab += parseInt(s.atBats) || 0;
      doubles += parseInt(s.doubles) || 0;
      triples += parseInt(s.triples) || 0;
      hr += parseInt(s.homeRuns) || 0;
      bb += parseInt(s.baseOnBalls) || 0;
      hbp += parseInt(s.hitByPitch) || 0;
      sf += parseInt(s.sacrificeFlies) || 0;
    }
    const singles = hits - doubles - triples - hr;
    const totalBases = singles + 2 * doubles + 3 * triples + 4 * hr;
    const xbh = doubles + triples + hr;
    const avg = ab > 0 ? Math.round(hits / ab * 1e3) / 1e3 : 0;
    const obpDenom = ab + bb + hbp + sf;
    const obp = obpDenom > 0 ? Math.round((hits + bb + hbp) / obpDenom * 1e3) / 1e3 : 0;
    const slg = ab > 0 ? Math.round(totalBases / ab * 1e3) / 1e3 : 0;
    const ops = Math.round((obp + slg) * 1e3) / 1e3;
    return {
      last7_avg: avg,
      last7_ops: ops,
      last7_slg: slg,
      last7_total_bases: totalBases,
      last7_hits: hits,
      last7_xbh: xbh
    };
  } catch (err) {
    console.error(`Error fetching batter last 7 days for ${batterId}:`, err);
    return defaults;
  }
}
async function fetchBatterSplits(batterId, season) {
  const defaults = {
    ops_vs_rhp: 0,
    ops_vs_lhp: 0,
    slg_vs_rhp: 0,
    slg_vs_lhp: 0,
    k_pct_vs_rhp: 0,
    k_pct_vs_lhp: 0,
    contact_pct_vs_rhp: null,
    contact_pct_vs_lhp: null
  };
  if (!batterId) return defaults;
  try {
    const url = `https://statsapi.mlb.com/api/v1/people/${batterId}/stats?stats=statSplits&season=${season}&group=hitting&sitCodes=vl,vr`;
    const res = await fetchWithTimeout(url, 5e3);
    if (!res.ok) return defaults;
    const data = await res.json();
    const splits = data.stats?.[0]?.splits || [];
    let ops_vs_rhp = 0;
    let ops_vs_lhp = 0;
    let slg_vs_rhp = 0;
    let slg_vs_lhp = 0;
    let k_pct_vs_rhp = 0;
    let k_pct_vs_lhp = 0;
    let contact_pct_vs_rhp = null;
    let contact_pct_vs_lhp = null;
    for (const split of splits) {
      const code = split.split?.code;
      const stat = split.stat || {};
      const pa = parseInt(stat.plateAppearances) || 0;
      const so = parseInt(stat.strikeOuts) || 0;
      const kPct = pa > 0 ? Math.round(so / pa * 1e3) / 10 : 0;
      if (code === "vr") {
        ops_vs_rhp = safeFloat(stat.ops) ?? 0;
        slg_vs_rhp = safeFloat(stat.slg) ?? 0;
        k_pct_vs_rhp = kPct;
        contact_pct_vs_rhp = safeFloat(stat.contactPct) ?? safeFloat(stat.contactPercent);
      } else if (code === "vl") {
        ops_vs_lhp = safeFloat(stat.ops) ?? 0;
        slg_vs_lhp = safeFloat(stat.slg) ?? 0;
        k_pct_vs_lhp = kPct;
        contact_pct_vs_lhp = safeFloat(stat.contactPct) ?? safeFloat(stat.contactPercent);
      }
    }
    return {
      ops_vs_rhp,
      ops_vs_lhp,
      slg_vs_rhp,
      slg_vs_lhp,
      k_pct_vs_rhp,
      k_pct_vs_lhp,
      contact_pct_vs_rhp,
      contact_pct_vs_lhp
    };
  } catch (err) {
    console.error(`Error fetching splits for batter ${batterId}:`, err);
    return defaults;
  }
}
async function fetchAdvancedPitchingVsOpp(pitcherId2, opposingTeamId) {
  const defaults = {
    xEra: null,
    fip: null,
    xFip: null,
    siera: null,
    hardHitPct: null,
    barrelPct: null,
    groundBallPct: null,
    flyBallPct: null,
    strikeoutRate: null,
    walkRate: null,
    swingingStrikePct: null,
    projectedInnings: null
  };
  if (!pitcherId2 || !opposingTeamId) return defaults;
  try {
    const url = `https://statsapi.mlb.com/api/v1/people/${pitcherId2}/stats?stats=vsTeamTotal&opposingTeamId=${opposingTeamId}&group=pitching`;
    const res = await fetchWithTimeout(url, 5e3);
    if (!res.ok) return defaults;
    const data = await res.json();
    const s = data.stats?.[0]?.splits?.[0]?.stat || {};
    if (Object.keys(s).length === 0) return defaults;
    const hr = parseInt(s.homeRuns) || 0;
    const bb = parseInt(s.baseOnBalls) || 0;
    const hbp = parseInt(s.hitByPitch) || 0;
    const so = parseInt(s.strikeOuts) || 0;
    const bf = parseInt(s.plateAppearances) || 0;
    const go = parseInt(s.groundOuts) || 0;
    const ao = parseInt(s.airOuts) || 0;
    const gidp = parseInt(s.groundIntoDoublePlay) || 0;
    const ipOuts = go + ao + so + gidp;
    const ip = ipOuts / 3;
    const fip = ip > 0 ? Math.round(((13 * hr + 3 * (bb + hbp) - 2 * so) / ip + 3.2) * 100) / 100 : null;
    const strikeoutRate = bf > 0 ? Math.round(so / bf * 1e3) / 10 : null;
    const walkRate = bf > 0 ? Math.round(bb / bf * 1e3) / 10 : null;
    const totalOuts = go + ao;
    const groundBallPct = totalOuts > 0 ? Math.round(go / totalOuts * 1e3) / 10 : null;
    const flyBallPct = totalOuts > 0 ? Math.round(ao / totalOuts * 1e3) / 10 : null;
    const hits = parseInt(s.hits) || 0;
    const rbi = parseInt(s.rbi) || 0;
    let estimatedWhip = null;
    let estimatedEra = null;
    const ipString = ipOuts > 0 ? `${Math.floor(ipOuts / 3)}.${ipOuts % 3}` : null;
    if (ip > 0) {
      estimatedWhip = ((hits + bb) / ip).toFixed(2);
      estimatedEra = (rbi / ip * 9).toFixed(2);
    }
    return {
      ...defaults,
      fip,
      strikeoutRate,
      walkRate,
      groundBallPct,
      flyBallPct,
      careerKPctVsTeam: strikeoutRate,
      era: estimatedEra,
      whip: estimatedWhip,
      ip: ipString,
      wins: 0,
      losses: 0
    };
  } catch (err) {
    console.error(`Error fetching vs Opp for ${pitcherId2}:`, err);
    return defaults;
  }
}
async function fetchPitcherLast3VsTeamProfile(pitcherId2, opposingTeamId, season, targetDateStr) {
  if (!pitcherId2 || !opposingTeamId) return {};
  try {
    const url = `https://statsapi.mlb.com/api/v1/people/${pitcherId2}/stats?stats=gameLog&season=${season}&group=pitching`;
    const res = await fetchWithTimeout(url, 5e3);
    if (!res.ok) return {};
    const data = await res.json();
    const targetDate = new Date(targetDateStr);
    let logs = data.stats?.[0]?.splits || [];
    logs = logs.filter((log) => {
      if (!log.date || new Date(log.date) >= targetDate) return false;
      const opponentId = log.opponent?.id ?? log.opponent?.team?.id ?? log.team?.opponent?.id ?? log.game?.opponent?.id;
      return String(opponentId) === String(opposingTeamId);
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 3);
    if (logs.length === 0) return {};
    const ks = logs.map((log) => parseInt(log.stat?.strikeOuts) || 0);
    const bf = logs.map((log) => parseInt(log.stat?.battersFaced) || 0).filter((value) => value > 0);
    return {
      last3VsTeamKsAvg: average(ks, 2),
      last3VsTeamBfAvg: average(bf, 1)
    };
  } catch (err) {
    console.error(`Error fetching last 3 vs team for pitcher ${pitcherId2}:`, err);
    return {};
  }
}
async function fetchAdvancedOffense(teamId, season) {
  const defaults = {
    wOba: null,
    xwOba: null,
    wrcPlus: null,
    iso: null,
    babip: null,
    hardHitPct: null,
    barrelPct: null,
    contactPct: null,
    chasePct: null
  };
  try {
    const stdUrl = `https://statsapi.mlb.com/api/v1/teams/${teamId}/stats?stats=season&season=${season}&group=hitting`;
    const advUrl = `https://statsapi.mlb.com/api/v1/teams/${teamId}/stats?stats=seasonAdvanced&season=${season}&group=hitting`;
    const [stdRes, advRes] = await Promise.all([
      fetchWithTimeout(stdUrl, 5e3),
      fetchWithTimeout(advUrl, 5e3)
    ]);
    let stdStat = {};
    let advStat = {};
    if (stdRes.ok) {
      const stdData = await stdRes.json();
      stdStat = stdData.stats?.[0]?.splits?.[0]?.stat || {};
    }
    if (advRes.ok) {
      const advData = await advRes.json();
      advStat = advData.stats?.[0]?.splits?.[0]?.stat || {};
    }
    if (!stdStat.atBats) {
      return defaults;
    }
    const avg = safeFloat(stdStat.avg) ?? 0;
    const slg = safeFloat(stdStat.slg) ?? 0;
    const iso = slg > 0 && avg > 0 ? Math.round((slg - avg) * 1e3) / 1e3 : null;
    const h = parseInt(stdStat.hits) || 0;
    const hr = parseInt(stdStat.homeRuns) || 0;
    const ab = parseInt(stdStat.atBats) || 0;
    const so = parseInt(stdStat.strikeOuts) || 0;
    const sf = parseInt(stdStat.sacrificeFlies) || 0;
    const denom = ab - so - hr + sf;
    const babip = denom > 0 ? Math.round((h - hr) / denom * 1e3) / 1e3 : null;
    const bb = parseInt(stdStat.baseOnBalls) || 0;
    const hbp = parseInt(stdStat.hitByPitch) || 0;
    const ibb = parseInt(stdStat.intentionalWalks) || 0;
    const dbl = parseInt(stdStat.doubles) || 0;
    const tpl = parseInt(stdStat.triples) || 0;
    const single = h - dbl - tpl - hr;
    const wobaDenom = ab + bb - ibb + sf + hbp;
    const woba = wobaDenom > 0 ? Math.round((0.69 * (bb - ibb) + 0.72 * hbp + 0.88 * single + 1.25 * dbl + 1.58 * tpl + 2.05 * hr) / wobaDenom * 1e3) / 1e3 : null;
    const firstNumber = (...values) => {
      for (const value of values) {
        const parsed = safeFloat(value);
        if (parsed !== null) return parsed;
      }
      return null;
    };
    const swings = firstNumber(advStat.totalSwings, advStat.swings, stdStat.totalSwings);
    const swingAndMisses = firstNumber(advStat.swingAndMisses, advStat.swingingStrikes, stdStat.swingAndMisses);
    const contactPct = swings && swingAndMisses !== null && swings > 0 ? roundNumber((swings - swingAndMisses) / swings * 100, 1) : firstNumber(advStat.contactPct, advStat.contactPercent, advStat.contact);
    const chasePct = firstNumber(
      advStat.chasePct,
      advStat.chasePercent,
      advStat.oSwingPct,
      advStat.outOfZoneSwingPct
    );
    return {
      wOba: woba,
      xwOba: null,
      wrcPlus: null,
      iso,
      babip,
      hardHitPct: null,
      barrelPct: null,
      contactPct,
      chasePct
    };
  } catch (err) {
    console.error(`Error fetching advanced offense for team ${teamId}:`, err);
    return defaults;
  }
}
async function fetchStarterFatigue(pitcherId2, date, season) {
  const defaults = { daysSinceLastStart: 5, pitchesLastStart: 0, pitchesLast3Starts: 0 };
  if (!pitcherId2) return defaults;
  try {
    const url = `https://statsapi.mlb.com/api/v1/people/${pitcherId2}/stats?stats=gameLog&season=${season}&group=pitching`;
    const res = await fetchWithTimeout(url, 6e3);
    if (!res.ok) return defaults;
    const data = await res.json();
    const logs = data.stats?.[0]?.splits || [];
    const targetDate = new Date(date);
    const pastLogs = logs.filter((log) => log.date && new Date(log.date) < targetDate).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    if (pastLogs.length === 0) {
      return defaults;
    }
    const lastStart = pastLogs[0];
    const lastStartDate = new Date(lastStart.date);
    const diffTime = Math.abs(targetDate.getTime() - lastStartDate.getTime());
    const daysSinceLastStart = Math.floor(diffTime / (1e3 * 60 * 60 * 24));
    const pitchesLastStart = parseInt(lastStart.stat?.numberOfPitches) || parseInt(lastStart.stat?.pitchesThrown) || 0;
    let pitchesLast3Starts = 0;
    for (let i = 0; i < Math.min(3, pastLogs.length); i++) {
      pitchesLast3Starts += parseInt(pastLogs[i].stat?.numberOfPitches) || parseInt(pastLogs[i].stat?.pitchesThrown) || 0;
    }
    return {
      daysSinceLastStart: daysSinceLastStart > 30 ? 5 : daysSinceLastStart,
      pitchesLastStart,
      pitchesLast3Starts,
      isInjuryReturn: daysSinceLastStart > 30
    };
  } catch (err) {
    console.error(`Error fetching starter fatigue for pitcher ${pitcherId2}:`, err);
    return defaults;
  }
}
async function fetchBullpenFatigue(teamId, date, season) {
  const defaults = {
    ipLast3Days: "N/A",
    ipLast7Days: "N/A",
    relieversUsedYesterday: "N/A",
    relieversUsedLast2Days: "N/A",
    availableCount: "N/A"
  };
  try {
    const today = new Date(date);
    const startDateTime = today.getTime() - 7 * 24 * 60 * 60 * 1e3;
    const startDateStr = new Date(startDateTime).toISOString().split("T")[0];
    const endDateTime = today.getTime() - 1 * 24 * 60 * 60 * 1e3;
    const endDateStr = new Date(endDateTime).toISOString().split("T")[0];
    const schedUrl = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=${teamId}&startDate=${startDateStr}&endDate=${endDateStr}`;
    const resSched = await fetchWithTimeout(schedUrl, 5e3);
    if (!resSched.ok) return defaults;
    const schedData = await resSched.json();
    const gamePks = [];
    for (const d of schedData.dates || []) {
      for (const g of d.games || []) {
        if (g.gamePk) gamePks.push(String(g.gamePk));
      }
    }
    if (gamePks.length === 0) return defaults;
    const rosterUrl = `https://statsapi.mlb.com/api/v1/teams/${teamId}/roster?rosterType=active&date=${date}`;
    const resRoster = await fetchWithTimeout(rosterUrl, 5e3);
    const activePitcherIds = /* @__PURE__ */ new Set();
    let hasActiveRoster = false;
    if (resRoster.ok) {
      const rosterData = await resRoster.json();
      if (Array.isArray(rosterData.roster)) {
        hasActiveRoster = true;
        for (const item of rosterData.roster) {
          if (item.position?.code === "1" && item.person?.id) {
            activePitcherIds.add(item.person.id);
          }
        }
      }
    }
    const boxscores = await Promise.all(
      gamePks.map(async (pk) => {
        try {
          const r = await fetchWithTimeout(`https://statsapi.mlb.com/api/v1/game/${pk}/boxscore`, 4e3);
          return r.ok ? await r.json() : null;
        } catch {
          return null;
        }
      })
    );
    let outs3d = 0;
    let outs7d = 0;
    let usedYesterday = 0;
    let used2Days = 0;
    const yesterdayStr = endDateStr;
    const twoDaysAgoStr = new Date(today.getTime() - 2 * 24 * 60 * 60 * 1e3).toISOString().split("T")[0];
    for (let i = 0; i < gamePks.length; i++) {
      const box = boxscores[i];
      if (!box) continue;
      let teamData = null;
      if (box.teams?.home?.team?.id === teamId) {
        teamData = box.teams.home;
      } else if (box.teams?.away?.team?.id === teamId) {
        teamData = box.teams.away;
      }
      if (!teamData) continue;
      let gameDateStr = "";
      for (const d of schedData.dates || []) {
        const matchingGame = d.games?.find((g) => String(g.gamePk) === gamePks[i]);
        if (matchingGame) {
          gameDateStr = d.date || "";
          break;
        }
      }
      if (!gameDateStr) continue;
      const pitchers = teamData.pitchers || [];
      const bullpenPitchers = pitchers.slice(1);
      let bullpenOuts = 0;
      let relieversCount = 0;
      for (const pid of bullpenPitchers) {
        if (hasActiveRoster && !activePitcherIds.has(pid)) {
          continue;
        }
        relieversCount++;
        const p = teamData.players?.[`ID${pid}`];
        const ipStr = p?.stats?.pitching?.inningsPitched;
        if (ipStr) {
          const parts = String(ipStr).split(".");
          const w = parseInt(parts[0]) || 0;
          const f = parseInt(parts[1]) || 0;
          bullpenOuts += w * 3 + f;
        }
      }
      const gameTime = new Date(gameDateStr).getTime();
      const diffDays = (today.getTime() - gameTime) / (1e3 * 60 * 60 * 24);
      if (diffDays <= 3) {
        outs3d += bullpenOuts;
      }
      if (diffDays <= 7) {
        outs7d += bullpenOuts;
      }
      if (gameDateStr === yesterdayStr) {
        usedYesterday += relieversCount;
      }
      if (gameDateStr === yesterdayStr || gameDateStr === twoDaysAgoStr) {
        used2Days += relieversCount;
      }
    }
    const formatIP = (outs) => {
      const w = Math.floor(outs / 3);
      const f = outs % 3;
      return w + f / 10;
    };
    return {
      ipLast3Days: formatIP(outs3d),
      ipLast7Days: formatIP(outs7d),
      relieversUsedYesterday: usedYesterday,
      relieversUsedLast2Days: used2Days,
      availableCount: Math.max(8 - usedYesterday, 2)
    };
  } catch (err) {
    console.error(`Error calculating bullpen fatigue for team ${teamId}:`, err);
    return defaults;
  }
}
async function fetchFatigueMetrics(homeStarterId, awayStarterId, homeTeamId, awayTeamId, date) {
  const season = date.substring(0, 4);
  const [homeStarter, awayStarter, homeBullpen, awayBullpen] = await Promise.all([
    fetchStarterFatigue(homeStarterId, date, season),
    fetchStarterFatigue(awayStarterId, date, season),
    fetchBullpenFatigue(homeTeamId, date, season),
    fetchBullpenFatigue(awayTeamId, date, season)
  ]);
  return {
    pitchers: {
      home: homeStarter,
      away: awayStarter
    },
    bullpen: {
      home: homeBullpen,
      away: awayBullpen
    }
  };
}
function parseRecordWinPct(record) {
  if (!record || !record.includes("-")) return 0.5;
  const [w, l] = record.split("-").map(Number);
  if (isNaN(w) || isNaN(l) || w + l === 0) return 0.5;
  return w / (w + l);
}
function calculateModelFeatures(gameData) {
  const homeStarterEra = safeFloat(gameData.pitchers?.home?.era) ?? 4;
  const awayStarterEra = safeFloat(gameData.pitchers?.away?.era) ?? 4;
  const homeStarterXera = safeFloat(gameData.advanced_pitching?.home?.xEra) ?? homeStarterEra;
  const awayStarterXera = safeFloat(gameData.advanced_pitching?.away?.xEra) ?? awayStarterEra;
  const homeStarterFip = safeFloat(gameData.advanced_pitching?.home?.fip) ?? homeStarterEra;
  const awayStarterFip = safeFloat(gameData.advanced_pitching?.away?.fip) ?? awayStarterEra;
  const homeOps = safeFloat(gameData.offense?.home?.ops) ?? 0.73;
  const awayOps = safeFloat(gameData.offense?.away?.ops) ?? 0.73;
  const homeXwoba = safeFloat(gameData.advanced_offense?.home?.xwOba) ?? safeFloat(gameData.advanced_offense?.home?.wOba) ?? 0.32;
  const awayXwoba = safeFloat(gameData.advanced_offense?.away?.xwOba) ?? safeFloat(gameData.advanced_offense?.away?.wOba) ?? 0.32;
  const homeBullpenEra = safeFloat(gameData.bullpen?.home?.era) ?? 4;
  const awayBullpenEra = safeFloat(gameData.bullpen?.away?.era) ?? 4;
  const homeRpg = safeFloat(gameData.offense?.home?.runsPerGame) ?? 4.5;
  const awayRpg = safeFloat(gameData.offense?.away?.runsPerGame) ?? 4.5;
  const homeRecordLast10 = parseRecordWinPct(gameData.trends?.home?.recordLast10);
  const awayRecordLast10 = parseRecordWinPct(gameData.trends?.away?.recordLast10);
  const homeWinPct = parseRecordWinPct(gameData.trends?.home?.recordHome);
  const awayWinPct = parseRecordWinPct(gameData.trends?.away?.recordAway);
  const homeStarterRest = safeFloat(gameData.fatigue_metrics?.pitchers?.home?.daysSinceLastStart) ?? 5;
  const awayStarterRest = safeFloat(gameData.fatigue_metrics?.pitchers?.away?.daysSinceLastStart) ?? 5;
  const homeBullpenFatigue = safeFloat(gameData.fatigue_metrics?.bullpen?.home?.ipLast3Days) ?? 10;
  const awayBullpenFatigue = safeFloat(gameData.fatigue_metrics?.bullpen?.away?.ipLast3Days) ?? 10;
  let varMoneyline = 0;
  let varRunLine = 0;
  let varTotalRuns = 0;
  if (hasRealBettingLines2(gameData) && gameData.line_movements && gameData.line_movements.length > 1) {
    const opening = gameData.line_movements[0];
    const current = gameData.line_movements[gameData.line_movements.length - 1];
    const currentMoneylineHome = safeFloat(current.currentMoneylineHome);
    const openingMoneylineHome = safeFloat(opening.currentMoneylineHome);
    const currentRunLineOdds = safeFloat(current.runLineHomeOdds);
    const openingRunLineOdds = safeFloat(opening.runLineHomeOdds);
    const currentTotalRuns = safeFloat(current.totalRuns);
    const openingTotalRuns = safeFloat(opening.totalRuns);
    varMoneyline = currentMoneylineHome !== null && openingMoneylineHome !== null ? currentMoneylineHome - openingMoneylineHome : 0;
    varRunLine = currentRunLineOdds !== null && openingRunLineOdds !== null ? currentRunLineOdds - openingRunLineOdds : 0;
    varTotalRuns = currentTotalRuns !== null && openingTotalRuns !== null ? currentTotalRuns - openingTotalRuns : 0;
  }
  return {
    diffEra: Math.round((homeStarterEra - awayStarterEra) * 100) / 100,
    diffXera: Math.round((homeStarterXera - awayStarterXera) * 100) / 100,
    diffFip: Math.round((homeStarterFip - awayStarterFip) * 100) / 100,
    diffOps: Math.round((homeOps - awayOps) * 1e3) / 1e3,
    diffXwoba: Math.round((homeXwoba - awayXwoba) * 1e4) / 1e4,
    diffBullpenEra: Math.round((homeBullpenEra - awayBullpenEra) * 100) / 100,
    diffRunsPerGame: Math.round((homeRpg - awayRpg) * 10) / 10,
    diffRecordLast10: Math.round((homeRecordLast10 - awayRecordLast10) * 100) / 100,
    diffRecordHomeAway: Math.round((homeWinPct - awayWinPct) * 100) / 100,
    diffStarterRest: homeStarterRest - awayStarterRest,
    diffBullpenFatigue: Math.round((homeBullpenFatigue - awayBullpenFatigue) * 10) / 10,
    varMoneyline,
    varRunLine,
    varTotalRuns
  };
}
async function fetchGameResult(gamePk, bettingLines) {
  try {
    const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&gamePk=${gamePk}`;
    const res = await fetchWithTimeout(url, 4e3);
    if (!res.ok) return void 0;
    const data = await res.json();
    const game = data.dates?.[0]?.games?.[0];
    if (!game) return void 0;
    const status = game.status?.detailedState || game.status?.abstractGameState || "Scheduled";
    const isScheduled = status === "Scheduled" || status === "Pre-Game" || status === "Warmup";
    let homeScore = 0;
    let awayScore = 0;
    if (!isScheduled) {
      homeScore = parseInt(game.teams?.home?.score) || 0;
      awayScore = parseInt(game.teams?.away?.score) || 0;
    }
    let winner = "none";
    if (homeScore > awayScore) winner = "home";
    else if (awayScore > homeScore) winner = "away";
    else if (!isScheduled && homeScore === awayScore) winner = "tie";
    const runLineHome = bettingLines?.runLineHome ?? -1.5;
    let runLineCovered = "push";
    if (homeScore + runLineHome > awayScore) {
      runLineCovered = "home";
    } else if (homeScore + runLineHome < awayScore) {
      runLineCovered = "away";
    }
    const totalRuns = bettingLines?.totalRuns ?? 8.5;
    const totalScore = homeScore + awayScore;
    let overUnderResult = "push";
    if (totalScore > totalRuns) {
      overUnderResult = "over";
    } else if (totalScore < totalRuns) {
      overUnderResult = "under";
    }
    return {
      homeScore,
      awayScore,
      winner,
      runLineCovered,
      overUnderResult,
      gameStatus: status
    };
  } catch (err) {
    console.error(`Error fetching game result for pk ${gamePk}:`, err);
    return void 0;
  }
}
async function fetchLiveResultOnly(gamePk) {
  const parseLiveStats = (teamBox) => {
    const batters = [];
    const pitchers = [];
    if (!teamBox?.players) return { batters, pitchers };
    const players = teamBox.players;
    if (teamBox.batters) {
      teamBox.batters.forEach((id) => {
        const p = players[`ID${id}`];
        if (!p) return;
        const s = p.stats?.batting || {};
        const liveHits = s.hits || 0;
        const liveDbl = s.doubles || 0;
        const liveTpl = s.triples || 0;
        const liveHr = s.homeRuns || 0;
        const liveSingles = Math.max(0, liveHits - liveDbl - liveTpl - liveHr);
        batters.push({
          id,
          name: p.person?.fullName || "Bateador",
          position: p.position?.abbreviation || "DH",
          ab: s.atBats || 0,
          r: s.runs || 0,
          h: liveHits,
          rbi: s.rbi || 0,
          bb: s.baseOnBalls || 0,
          k: s.strikeOuts || 0,
          doubles: liveDbl,
          triples: liveTpl,
          home_runs: liveHr,
          total_bases: liveSingles + 2 * liveDbl + 3 * liveTpl + 4 * liveHr
        });
      });
    }
    if (teamBox.pitchers) {
      teamBox.pitchers.forEach((id) => {
        const p = players[`ID${id}`];
        if (!p) return;
        const s = p.stats?.pitching || {};
        pitchers.push({
          id,
          name: p.person?.fullName || "Lanzador",
          position: "P",
          ip: s.inningsPitched || "0.0",
          h: s.hits || 0,
          r: s.runs || 0,
          er: s.earnedRuns || 0,
          bb: s.baseOnBalls || 0,
          k: s.strikeOuts || 0,
          bf: s.battersFaced ?? "",
          pitches: s.numberOfPitches || 0,
          strikes: s.strikes || 0
        });
      });
    }
    return { batters, pitchers };
  };
  const fetchBoxscore = async () => {
    try {
      const boxRes = await fetchWithTimeout(`https://statsapi.mlb.com/api/v1/game/${gamePk}/boxscore`);
      const boxData = await boxRes.json();
      return {
        home: parseLiveStats(boxData.teams?.home),
        away: parseLiveStats(boxData.teams?.away)
      };
    } catch {
      return null;
    }
  };
  const fetchLinescore = async () => {
    try {
      const r = await fetchWithTimeout(`https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`);
      const fullD = await r.json();
      const d = fullD?.liveData?.linescore;
      if (!d || !d.innings) return null;
      return {
        innings: d.innings.map((i) => ({
          num: i.num,
          home: { runs: i.home?.runs || 0, hits: i.home?.hits || 0, errors: i.home?.errors || 0 },
          away: { runs: i.away?.runs || 0, hits: i.away?.hits || 0, errors: i.away?.errors || 0 }
        })),
        homeTotals: { runs: d.teams?.home?.runs || 0, hits: d.teams?.home?.hits || 0, errors: d.teams?.home?.errors || 0 },
        awayTotals: { runs: d.teams?.away?.runs || 0, hits: d.teams?.away?.hits || 0, errors: d.teams?.away?.errors || 0 },
        currentInning: d.currentInning,
        currentInningOrdinal: d.currentInningOrdinal,
        inningState: d.inningState,
        inningHalf: d.inningHalf,
        isTopInning: d.isTopInning,
        balls: d.balls,
        strikes: d.strikes,
        outs: d.outs,
        defense: d.defense?.pitcher ? {
          pitcher: { id: d.defense.pitcher.id, fullName: d.defense.pitcher.fullName }
        } : void 0,
        offense: d.offense ? {
          batter: d.offense.batter ? { id: d.offense.batter.id, fullName: d.offense.batter.fullName } : void 0,
          first: d.offense.first ? { id: d.offense.first.id, fullName: d.offense.first.fullName } : void 0,
          second: d.offense.second ? { id: d.offense.second.id, fullName: d.offense.second.fullName } : void 0,
          third: d.offense.third ? { id: d.offense.third.id, fullName: d.offense.third.fullName } : void 0
        } : void 0
      };
    } catch {
      return null;
    }
  };
  const fetchPxP = async () => {
    try {
      const r = await fetchWithTimeout(`https://statsapi.mlb.com/api/v1/game/${gamePk}/playByPlay`);
      const d = await r.json();
      const allPlays = d.allPlays || [];
      const mappedAllPlays = allPlays.map((p) => ({
        description: p.result?.description || "",
        inning: `${p.about?.halfInning === "top" ? "Top" : "Bot"} ${p.about?.inning || 1}`,
        score: `${p.result?.awayScore || 0} - ${p.result?.homeScore || 0}`,
        isScoringPlay: p.about?.isScoringPlay || false
      }));
      const scoring = mappedAllPlays.filter((p) => p.isScoringPlay);
      let currentPlay = null;
      const cp = d.currentPlay;
      if (cp) {
        currentPlay = {
          description: cp.result?.description || cp.playEvents?.[cp.playEvents.length - 1]?.details?.description || "En progreso...",
          inning: `${cp.about?.halfInning === "top" ? "Top" : "Bot"} ${cp.about?.inning || 1}`,
          score: `${cp.result?.awayScore || 0} - ${cp.result?.homeScore || 0}`,
          isScoringPlay: cp.about?.isScoringPlay || false
        };
      }
      return { scoringPlays: scoring, currentPlay, allPlays: mappedAllPlays };
    } catch {
      return null;
    }
  };
  const [liveBoxscore, linescore, playByPlay] = await Promise.all([fetchBoxscore(), fetchLinescore(), fetchPxP()]);
  return { linescore, liveBoxscore, playByPlay };
}
function hasSolidPregameCoverage(stored) {
  if (!stored) return false;
  const homeName = stored?.pitchers?.home?.name;
  const awayName = stored?.pitchers?.away?.name;
  const pitchersKnown = !!homeName && homeName !== "Por definir" && homeName !== "TBD" && !!awayName && awayName !== "Por definir" && awayName !== "TBD";
  return pitchersKnown && !!stored?.weather && !!stored?.betting_lines && !!stored?.advanced_pitching?.home && !!stored?.advanced_pitching?.away && !!stored?.offensive_splits?.home && !!stored?.offensive_splits?.away;
}
function applyLiveResultRefresh(baseGame, gameResult, live, starterBoxStats) {
  const merged = { ...baseGame };
  if (gameResult) merged.game_result = gameResult;
  merged.linescore = live.linescore ?? merged.linescore ?? null;
  merged.liveBoxscore = live.liveBoxscore ?? merged.liveBoxscore ?? null;
  merged.playByPlay = live.playByPlay ?? merged.playByPlay ?? null;
  const canUseActualKs = isFinalGameStatus2(merged.game_result?.gameStatus);
  merged.boxscore_stats = canUseActualKs ? starterBoxStats : null;
  merged.advanced_pitching = {
    ...merged.advanced_pitching,
    home: { ...merged.advanced_pitching?.home, actualStrikeouts: canUseActualKs ? starterBoxStats?.home?.strikeOuts ?? null : null },
    away: { ...merged.advanced_pitching?.away, actualStrikeouts: canUseActualKs ? starterBoxStats?.away?.strikeOuts ?? null : null }
  };
  merged.timestamp = (/* @__PURE__ */ new Date()).toISOString();
  merged.lastReverifyAttempt = merged.timestamp;
  return merged;
}
function hasMatchupPropRows(rows, pitcherTeam, opponentTeam) {
  if (!Array.isArray(rows) || rows.length === 0) return false;
  const teamAbbr = getTeamAbbr2(pitcherTeam);
  const opponentAbbr = getTeamAbbr2(opponentTeam);
  return rows.some((row) => {
    const rowTeam = String(row.team_abbr || row.team || "").toUpperCase();
    const rowOpponent = String(row.opponent || "").toUpperCase();
    const teamMatches = !teamAbbr || !rowTeam || rowTeam === teamAbbr;
    const opponentMatches = !opponentAbbr || !rowOpponent || rowOpponent === opponentAbbr;
    return teamMatches && opponentMatches;
  });
}
function resolvePropCaptureStatus(opts) {
  const { attempted, propData, pitcherName, hadOddsApiMarketForGame, dataStreakRows, pitcherTeam, opponentTeam } = opts;
  if (!attempted) return "not_attempted";
  if (propData && propData.point != null) return "captured";
  if (!pitcherName || pitcherName === "Por definir" || pitcherName === "TBD") return "no_market";
  const hadAnyMatchupMarket = hadOddsApiMarketForGame || hasMatchupPropRows(dataStreakRows, pitcherTeam, opponentTeam);
  return hadAnyMatchupMarket ? "no_name_match" : "no_market";
}
function buildDirectGameData(gameId2, homeName, awayName, venueName, date, matchTime, realMLBData, realOddsData, pitcherStrikeoutRows = [], totalBasesRows = [], propsFetchAttempted = true) {
  let odds = null;
  let homeKPropData = null;
  let awayKPropData = null;
  let hadOddsApiPitcherKMarket = false;
  if (realOddsData && Array.isArray(realOddsData)) {
    const matchOdds = realOddsData.find((o) => {
      const oHome = o.home_team.toLowerCase();
      const oAway = o.away_team.toLowerCase();
      const dbHome = homeName.toLowerCase();
      const dbAway = awayName.toLowerCase();
      return (oHome === dbHome || oHome.includes(dbHome) || dbHome.includes(oHome)) && (oAway === dbAway || oAway.includes(dbAway) || dbAway.includes(oAway));
    });
    if (matchOdds && matchOdds.bookmakers && matchOdds.bookmakers.length > 0) {
      const bookie = matchOdds.bookmakers.find((b) => b.key === "draftkings" || b.key === "fanduel") || matchOdds.bookmakers[0];
      const h2h = bookie.markets.find((m) => m.key === "h2h");
      const spreads = bookie.markets.find((m) => m.key === "spreads");
      const totals = bookie.markets.find((m) => m.key === "totals");
      let pitcherStrikeoutsOutcomes = [];
      let batterTotalBasesOutcomes = [];
      for (const b of matchOdds.bookmakers) {
        const mPitcher = b.markets.find((mk) => mk.key === "pitcher_strikeouts");
        if (mPitcher && mPitcher.outcomes) {
          pitcherStrikeoutsOutcomes.push(...mPitcher.outcomes.map((outcome) => ({
            ...outcome,
            bookKey: b.key,
            source: outcome.source || (b.key === "datastreak" ? "datastreak" : "the_odds_api")
          })));
        }
        const mBatter = b.markets.find((mk) => mk.key === "batter_total_bases");
        if (mBatter && mBatter.outcomes) {
          batterTotalBasesOutcomes.push(...mBatter.outcomes.map((outcome) => ({
            ...outcome,
            bookKey: b.key,
            source: outcome.source || (b.key === "datastreak" ? "datastreak" : "the_odds_api")
          })));
        }
      }
      if (batterTotalBasesOutcomes.length > 0) {
        const mappedBatterProps = /* @__PURE__ */ new Map();
        for (const outcome of batterTotalBasesOutcomes) {
          if (outcome.source === "datastreak" || outcome.bookKey === "datastreak") continue;
          const pName = outcome.description;
          const rowKey = `${normalizeName(pName)}|${outcome.bookKey || "the_odds_api"}`;
          if (!mappedBatterProps.has(rowKey)) {
            mappedBatterProps.set(rowKey, { player_name: pName, vendor: outcome.bookKey || "TheOddsAPI", source: "the_odds_api" });
          }
          const pData = mappedBatterProps.get(rowKey);
          pData.line = outcome.point;
          if (outcome.name === "Over") {
            pData.odds = outcome.price;
          } else if (outcome.name === "Under") {
            pData.under_odds = outcome.price;
          }
        }
        const oddsApiTotalBasesRows = Array.from(mappedBatterProps.values());
        totalBasesRows = [...oddsApiTotalBasesRows, ...totalBasesRows];
      }
      hadOddsApiPitcherKMarket = pitcherStrikeoutsOutcomes.length > 0;
      if (pitcherStrikeoutsOutcomes.length > 0) {
        const matchProp = (pitcherName) => {
          if (!pitcherName || pitcherName === "Por definir" || pitcherName === "TBD") return null;
          const normalizedPitcherName = normalizeName(pitcherName);
          const parts = normalizedPitcherName.split(" ");
          const lastName = parts[parts.length - 1];
          const outcomes = pitcherStrikeoutsOutcomes.filter((o) => {
            const description = normalizeName(o.description);
            const isTheOddsApi = o.source !== "datastreak" && o.bookKey !== "datastreak";
            return isTheOddsApi && (description === normalizedPitcherName || description.includes(normalizedPitcherName) || description.split(" ").includes(lastName));
          });
          if (outcomes.length > 0) {
            const over = outcomes.find((o) => o.name === "Over");
            const under = outcomes.find((o) => o.name === "Under");
            return { point: over?.point || under?.point || null, overOdds: over?.price || null, underOdds: under?.price || null, book: over?.bookKey || under?.bookKey || "TheOddsAPI", source: "the_odds_api" };
          }
          return null;
        };
        homeKPropData = matchProp(realMLBData?.pitchers?.home?.name);
        awayKPropData = matchProp(realMLBData?.pitchers?.away?.name);
      }
      odds = {
        openingMoneylineHome: h2h?.outcomes?.find((o) => o.name?.toLowerCase() === matchOdds.home_team?.toLowerCase())?.price ?? null,
        openingMoneylineAway: h2h?.outcomes?.find((o) => o.name?.toLowerCase() === matchOdds.away_team?.toLowerCase())?.price ?? null,
        currentMoneylineHome: h2h?.outcomes?.find((o) => o.name?.toLowerCase() === matchOdds.home_team?.toLowerCase())?.price ?? null,
        currentMoneylineAway: h2h?.outcomes?.find((o) => o.name?.toLowerCase() === matchOdds.away_team?.toLowerCase())?.price ?? null,
        runLineHome: spreads?.outcomes?.find((o) => o.name?.toLowerCase() === matchOdds.home_team?.toLowerCase())?.point ?? null,
        runLineHomeOdds: spreads?.outcomes?.find((o) => o.name?.toLowerCase() === matchOdds.home_team?.toLowerCase())?.price ?? null,
        runLineAway: spreads?.outcomes?.find((o) => o.name?.toLowerCase() === matchOdds.away_team?.toLowerCase())?.point ?? null,
        runLineAwayOdds: spreads?.outcomes?.find((o) => o.name?.toLowerCase() === matchOdds.away_team?.toLowerCase())?.price ?? null,
        totalRuns: totals?.outcomes?.find((o) => o.name?.toLowerCase() === "over")?.point ?? totals?.outcomes?.find((o) => o.name?.toLowerCase() === "under")?.point ?? null,
        overOdds: totals?.outcomes?.find((o) => o.name?.toLowerCase() === "over")?.price ?? null,
        underOdds: totals?.outcomes?.find((o) => o.name?.toLowerCase() === "under")?.price ?? null,
        lineSource: "the_odds_api",
        lineMovementSummary: "L\xEDneas de cuotas provistas por The Odds API (Modo Directo)."
      };
    }
  }
  homeKPropData = homeKPropData || findDataStreakPitcherKProp(
    pitcherStrikeoutRows,
    realMLBData?.pitchers?.home?.name,
    homeName,
    awayName
  );
  awayKPropData = awayKPropData || findDataStreakPitcherKProp(
    pitcherStrikeoutRows,
    realMLBData?.pitchers?.away?.name,
    awayName,
    homeName
  );
  const homeStrikeoutPropCaptureStatus = resolvePropCaptureStatus({
    attempted: propsFetchAttempted,
    propData: homeKPropData,
    pitcherName: realMLBData?.pitchers?.home?.name,
    hadOddsApiMarketForGame: hadOddsApiPitcherKMarket,
    dataStreakRows: pitcherStrikeoutRows,
    pitcherTeam: homeName,
    opponentTeam: awayName
  });
  const awayStrikeoutPropCaptureStatus = resolvePropCaptureStatus({
    attempted: propsFetchAttempted,
    propData: awayKPropData,
    pitcherName: realMLBData?.pitchers?.away?.name,
    hadOddsApiMarketForGame: hadOddsApiPitcherKMarket,
    dataStreakRows: pitcherStrikeoutRows,
    pitcherTeam: awayName,
    opponentTeam: homeName
  });
  if (!odds) {
    odds = {
      openingMoneylineHome: null,
      openingMoneylineAway: null,
      currentMoneylineHome: null,
      currentMoneylineAway: null,
      runLineHome: null,
      runLineHomeOdds: null,
      runLineAway: null,
      runLineAwayOdds: null,
      totalRuns: null,
      overOdds: null,
      underOdds: null,
      lineSource: null,
      lineMovementSummary: "Sin lineas reales disponibles."
    };
  }
  return {
    id: gameId2,
    metadata: { id: gameId2, date, time: matchTime, homeTeam: homeName, awayTeam: awayName, venue: venueName },
    teams: { home: homeName, away: awayName },
    pitchers: {
      home: {
        name: realMLBData?.pitchers?.home?.name || "Por definir",
        pitcherId: realMLBData?.pitcherIds?.home ?? null,
        era: safeFloat(realMLBData?.pitchers?.home?.era) ?? "N/A",
        whip: safeFloat(realMLBData?.pitchers?.home?.whip) ?? "N/A",
        kPct: safeFloat(realMLBData?.pitchers?.home?.kPct) ?? "N/A",
        bbPct: safeFloat(realMLBData?.pitchers?.home?.bbPct) ?? "N/A",
        wins: parseInt(realMLBData?.pitchers?.home?.wins) || "N/A",
        losses: parseInt(realMLBData?.pitchers?.home?.losses) || "N/A",
        ip: realMLBData?.pitchers?.home?.ip || "N/A",
        starts: safeFloat(realMLBData?.pitchers?.home?.starts) ?? "N/A",
        totalStrikeouts: safeFloat(realMLBData?.pitchers?.home?.totalStrikeouts) ?? "N/A",
        totalWalks: safeFloat(realMLBData?.pitchers?.home?.totalWalks) ?? "N/A",
        strikeoutProp: homeKPropData?.point ?? null,
        strikeoutPropOverOdds: homeKPropData?.overOdds ?? null,
        strikeoutPropUnderOdds: homeKPropData?.underOdds ?? null,
        strikeoutPropSource: homeKPropData?.source ?? null,
        strikeoutPropCaptureStatus: homeStrikeoutPropCaptureStatus,
        pitchHand: realMLBData?.pitchers?.home?.pitchHand || "R",
        pitcher_allowed_avg_vs_lhb: safeFloat(realMLBData?.pitchers?.home?.pitcher_allowed_avg_vs_lhb) ?? 0,
        pitcher_allowed_avg_vs_rhb: safeFloat(realMLBData?.pitchers?.home?.pitcher_allowed_avg_vs_rhb) ?? 0,
        pitcher_allowed_slg_vs_lhb: safeFloat(realMLBData?.pitchers?.home?.pitcher_allowed_slg_vs_lhb) ?? 0,
        pitcher_allowed_slg_vs_rhb: safeFloat(realMLBData?.pitchers?.home?.pitcher_allowed_slg_vs_rhb) ?? 0
      },
      away: {
        name: realMLBData?.pitchers?.away?.name || "Por definir",
        pitcherId: realMLBData?.pitcherIds?.away ?? null,
        era: safeFloat(realMLBData?.pitchers?.away?.era) ?? "N/A",
        whip: safeFloat(realMLBData?.pitchers?.away?.whip) ?? "N/A",
        kPct: safeFloat(realMLBData?.pitchers?.away?.kPct) ?? "N/A",
        bbPct: safeFloat(realMLBData?.pitchers?.away?.bbPct) ?? "N/A",
        wins: parseInt(realMLBData?.pitchers?.away?.wins) || "N/A",
        losses: parseInt(realMLBData?.pitchers?.away?.losses) || "N/A",
        ip: realMLBData?.pitchers?.away?.ip || "N/A",
        starts: safeFloat(realMLBData?.pitchers?.away?.starts) ?? "N/A",
        totalStrikeouts: safeFloat(realMLBData?.pitchers?.away?.totalStrikeouts) ?? "N/A",
        totalWalks: safeFloat(realMLBData?.pitchers?.away?.totalWalks) ?? "N/A",
        strikeoutProp: awayKPropData?.point ?? null,
        strikeoutPropOverOdds: awayKPropData?.overOdds ?? null,
        strikeoutPropUnderOdds: awayKPropData?.underOdds ?? null,
        strikeoutPropSource: awayKPropData?.source ?? null,
        strikeoutPropCaptureStatus: awayStrikeoutPropCaptureStatus,
        pitchHand: realMLBData?.pitchers?.away?.pitchHand || "R",
        pitcher_allowed_avg_vs_lhb: safeFloat(realMLBData?.pitchers?.away?.pitcher_allowed_avg_vs_lhb) ?? 0,
        pitcher_allowed_avg_vs_rhb: safeFloat(realMLBData?.pitchers?.away?.pitcher_allowed_avg_vs_rhb) ?? 0,
        pitcher_allowed_slg_vs_lhb: safeFloat(realMLBData?.pitchers?.away?.pitcher_allowed_slg_vs_lhb) ?? 0,
        pitcher_allowed_slg_vs_rhb: safeFloat(realMLBData?.pitchers?.away?.pitcher_allowed_slg_vs_rhb) ?? 0
      }
    },
    bullpen: {
      home: {
        era: safeFloat(realMLBData?.bullpenERA?.home) ?? "N/A",
        usageLast3Days: "N/A",
        availableRelievers: ["N/A"],
        ipLast3Days: "N/A"
      },
      away: {
        era: safeFloat(realMLBData?.bullpenERA?.away) ?? "N/A",
        usageLast3Days: "N/A",
        availableRelievers: ["N/A"],
        ipLast3Days: "N/A"
      }
    },
    offense: {
      home: {
        runsPerGame: safeFloat(realMLBData?.teamOffense?.home?.runsPerGame) ?? "N/A",
        strikeoutsPerGame: safeFloat(realMLBData?.teamOffense?.home?.strikeoutsPerGame) ?? "N/A",
        ops: safeFloat(realMLBData?.teamOffense?.home?.ops) ?? "N/A",
        obp: safeFloat(realMLBData?.teamOffense?.home?.obp) ?? "N/A",
        slg: safeFloat(realMLBData?.teamOffense?.home?.slg) ?? "N/A"
      },
      away: {
        runsPerGame: safeFloat(realMLBData?.teamOffense?.away?.runsPerGame) ?? "N/A",
        strikeoutsPerGame: safeFloat(realMLBData?.teamOffense?.away?.strikeoutsPerGame) ?? "N/A",
        ops: safeFloat(realMLBData?.teamOffense?.away?.ops) ?? "N/A",
        obp: safeFloat(realMLBData?.teamOffense?.away?.obp) ?? "N/A",
        slg: safeFloat(realMLBData?.teamOffense?.away?.slg) ?? "N/A"
      }
    },
    trends: {
      home: { recordLast10: "N/D", recordHome: realMLBData?.teamRecords?.home || "N/D", recordAway: "N/D" },
      away: { recordLast10: "N/D", recordHome: realMLBData?.teamRecords?.away || "N/D", recordAway: "N/D" }
    },
    betting_lines: odds,
    injuries: [
      ...(realMLBData?.injuries?.home || []).map((inj) => ({ ...inj, team: homeName })),
      ...(realMLBData?.injuries?.away || []).map((inj) => ({ ...inj, team: awayName }))
    ],
    lineups: {
      home: enrichLineupWithTotalBasesProps(realMLBData?.lineups?.home || [], totalBasesRows).map((p) => ({
        name: p.name || "Jugador",
        id: p.id ?? p.mlbId ?? null,
        mlbId: p.mlbId ?? p.id ?? null,
        position: p.position || "DH",
        avg: safeFloat(p.avg) || 0.25,
        ops: safeFloat(p.ops) || 0.7,
        hr: safeFloat(p.hr) || 0,
        rbi: safeFloat(p.rbi) || 0,
        player_name: p.player_name || p.name || "Jugador",
        team: p.team || "",
        bat_side: p.bat_side || "R",
        obp: safeFloat(p.obp) || 0.3,
        slg: safeFloat(p.slg) || 0.4,
        woba: safeFloat(p.woba) || 0.3,
        iso: safeFloat(p.iso) || 0.15,
        pa: parseInt(p.pa) || 0,
        hits: parseInt(p.hits) || 0,
        doubles: parseInt(p.doubles) || 0,
        triples: parseInt(p.triples) || 0,
        home_runs: parseInt(p.home_runs) || parseInt(p.hr) || 0,
        strikeout_pct: safeFloat(p.strikeout_pct) || 0,
        walk_pct: safeFloat(p.walk_pct) || 0,
        batting_order: p.batting_order ?? null,
        ops_vs_rhp: p.ops_vs_rhp ?? 0,
        ops_vs_lhp: p.ops_vs_lhp ?? 0,
        slg_vs_rhp: p.slg_vs_rhp ?? 0,
        slg_vs_lhp: p.slg_vs_lhp ?? 0,
        k_pct_vs_rhp: p.k_pct_vs_rhp ?? 0,
        k_pct_vs_lhp: p.k_pct_vs_lhp ?? 0,
        contact_pct_vs_rhp: p.contact_pct_vs_rhp ?? null,
        contact_pct_vs_lhp: p.contact_pct_vs_lhp ?? null,
        last7_avg: safeFloat(p.last7_avg) || 0,
        last7_ops: safeFloat(p.last7_ops) || 0,
        last7_slg: safeFloat(p.last7_slg) || 0,
        last7_total_bases: parseInt(p.last7_total_bases) || 0,
        last7_hits: parseInt(p.last7_hits) || 0,
        last7_xbh: parseInt(p.last7_xbh) || 0,
        totalBasesProp: safeFloat(p.totalBasesProp),
        totalBasesPropOverOdds: safeFloat(p.totalBasesPropOverOdds),
        totalBasesPropUnderOdds: safeFloat(p.totalBasesPropUnderOdds),
        totalBasesPropBook: p.totalBasesPropBook ?? null,
        totalBasesPropSource: p.totalBasesPropSource ?? null,
        totalBasesPropHitRate: safeFloat(p.totalBasesPropHitRate),
        totalBasesPropHitRateDisplay: p.totalBasesPropHitRateDisplay ?? null
      })),
      away: enrichLineupWithTotalBasesProps(realMLBData?.lineups?.away || [], totalBasesRows).map((p) => ({
        name: p.name || "Jugador",
        id: p.id ?? p.mlbId ?? null,
        mlbId: p.mlbId ?? p.id ?? null,
        position: p.position || "DH",
        avg: safeFloat(p.avg) || 0.25,
        ops: safeFloat(p.ops) || 0.7,
        hr: safeFloat(p.hr) || 0,
        rbi: safeFloat(p.rbi) || 0,
        player_name: p.player_name || p.name || "Jugador",
        team: p.team || "",
        bat_side: p.bat_side || "R",
        obp: safeFloat(p.obp) || 0.3,
        slg: safeFloat(p.slg) || 0.4,
        woba: safeFloat(p.woba) || 0.3,
        iso: safeFloat(p.iso) || 0.15,
        pa: parseInt(p.pa) || 0,
        hits: parseInt(p.hits) || 0,
        doubles: parseInt(p.doubles) || 0,
        triples: parseInt(p.triples) || 0,
        home_runs: parseInt(p.home_runs) || parseInt(p.hr) || 0,
        strikeout_pct: safeFloat(p.strikeout_pct) || 0,
        walk_pct: safeFloat(p.walk_pct) || 0,
        batting_order: p.batting_order ?? null,
        ops_vs_rhp: p.ops_vs_rhp ?? 0,
        ops_vs_lhp: p.ops_vs_lhp ?? 0,
        slg_vs_rhp: p.slg_vs_rhp ?? 0,
        slg_vs_lhp: p.slg_vs_lhp ?? 0,
        k_pct_vs_rhp: p.k_pct_vs_rhp ?? 0,
        k_pct_vs_lhp: p.k_pct_vs_lhp ?? 0,
        contact_pct_vs_rhp: p.contact_pct_vs_rhp ?? null,
        contact_pct_vs_lhp: p.contact_pct_vs_lhp ?? null,
        last7_avg: safeFloat(p.last7_avg) || 0,
        last7_ops: safeFloat(p.last7_ops) || 0,
        last7_slg: safeFloat(p.last7_slg) || 0,
        last7_total_bases: parseInt(p.last7_total_bases) || 0,
        last7_hits: parseInt(p.last7_hits) || 0,
        last7_xbh: parseInt(p.last7_xbh) || 0,
        totalBasesProp: safeFloat(p.totalBasesProp),
        totalBasesPropOverOdds: safeFloat(p.totalBasesPropOverOdds),
        totalBasesPropUnderOdds: safeFloat(p.totalBasesPropUnderOdds),
        totalBasesPropBook: p.totalBasesPropBook ?? null,
        totalBasesPropSource: p.totalBasesPropSource ?? null,
        totalBasesPropHitRate: safeFloat(p.totalBasesPropHitRate),
        totalBasesPropHitRateDisplay: p.totalBasesPropHitRateDisplay ?? null
      }))
    },
    linescore: realMLBData?.linescore || null,
    liveBoxscore: realMLBData?.liveBoxscore || null,
    playByPlay: realMLBData?.playByPlay || null
  };
}
app2.post("/api/harvest", async (req, res) => {
  const { date, refreshOdds, force } = req.body;
  const forceRebuild = force === true;
  if (!date || typeof date !== "string") {
    res.status(400).json({ error: "Fecha es requerida (formato YYYY-MM-DD)" });
    return;
  }
  if (harvestDatesInFlight.has(date)) {
    res.status(409).json({ error: `Ya existe una extracci\xF3n en progreso para ${date}` });
    return;
  }
  harvestDatesInFlight.add(date);
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no"
  });
  const emit = (data) => {
    res.write(`data: ${JSON.stringify(data)}

`);
  };
  let isCancelled = false;
  res.on("close", () => {
    harvestDatesInFlight.delete(date);
    if (!res.writableEnded) {
      isCancelled = true;
      console.log(`[ETL] Conexi\xF3n cerrada por el cliente. Cancelando proceso para ${date}...`);
    }
  });
  console.log(`Iniciando recolecci\xF3n MLB para fecha: ${date}`);
  const harvestStartedAt = Date.now();
  emit({ phase: "schedule", step: "Conectando con MLB Stats API...", pct: 2 });
  let mlbMatches = [];
  try {
    const mlbRes = await fetchWithTimeout(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}&hydrate=probablePitcher`, 12e3);
    const mlbData = await mlbRes.json();
    if (mlbData.dates && mlbData.dates[0] && mlbData.dates[0].games) {
      mlbMatches = mlbData.dates[0].games;
    }
  } catch (error) {
    console.error("Error consultando MLB Stats API:", error);
  }
  const currentDBSnapshot = readGamesDB();
  const existingGamesForDate = currentDBSnapshot[date] || [];
  const historicalDate = isPastGameDate(date);
  const existingGamesById = new Map(existingGamesForDate.map((game) => [String(game?.id || game?.metadata?.id || ""), game]));
  const pitLookupsForReverify = readPitLookups();
  const hasPitCoverage = (gamePk, stored) => {
    const homeName = stored?.pitchers?.home?.name;
    const awayName = stored?.pitchers?.away?.name;
    const homeNeedsPit = homeName && homeName !== "Por definir" && homeName !== "TBD";
    const awayNeedsPit = awayName && awayName !== "Por definir" && awayName !== "TBD";
    const pit = pitLookupsForReverify.pitchers?.[gamePk];
    if (homeNeedsPit && !pit?.home) return false;
    if (awayNeedsPit && !pit?.away) return false;
    return true;
  };
  const canReuseStoredGame = (match) => {
    if (forceRebuild) return false;
    const gamePk = String(match?.gamePk);
    const stored = existingGamesById.get(gamePk);
    if (!stored) return false;
    if (!historicalDate) return isFinalGameStatus2(stored?.game_result?.gameStatus);
    if (!isFinalGameStatus2(stored?.game_result?.gameStatus)) return false;
    if (hasPitCoverage(gamePk, stored)) return true;
    const lastAttempt = stored?.lastReverifyAttempt;
    if (!lastAttempt) return false;
    const daysSinceLastAttempt = (Date.now() - new Date(lastAttempt).getTime()) / (1e3 * 60 * 60 * 24);
    return daysSinceLastAttempt < REVERIFY_COOLDOWN_DAYS;
  };
  const matchesNeedingExtraction = mlbMatches.filter((match) => !canReuseStoredGame(match));
  if (!forceRebuild && historicalDate && existingGamesForDate.length > 0 && matchesNeedingExtraction.length === 0) {
    const cachedGames = mlbMatches.length > 0 ? mlbMatches.map((match) => existingGamesById.get(String(match.gamePk))).filter(Boolean) : existingGamesForDate;
    console.log(`[Cach\xE9] ${date}: ${cachedGames.length} juego(s) hist\xF3ricos reutilizados; extracci\xF3n omitida por completo.`);
    emit({
      phase: "done",
      step: `Fecha hist\xF3rica ya guardada \u2014 ${cachedGames.length} juego(s) reutilizados`,
      pct: 100,
      games: cachedGames,
      cached: true,
      skippedGames: cachedGames.length,
      errorsCount: 0
    });
    res.end();
    return;
  }
  const realOddsData = await fetchRealBettingLines(date, refreshOdds === true, matchesNeedingExtraction);
  const pitcherStrikeoutRows = historicalDate ? [] : await fetchDataStreakPitcherStrikeoutProps(date, refreshOdds === true);
  const totalBasesRows = historicalDate ? [] : await fetchDataStreakTotalBasesProps(date, refreshOdds === true);
  const season = date.substring(0, 4);
  emit({ phase: "schedule", step: "Cargando datos sabermetricos...", pct: 4 });
  await Promise.all([
    savantCache.load(parseInt(season)),
    parkFactorsScraper.load()
  ]);
  emit({ phase: "schedule", step: "Cargando m\xE9tricas PyBaseball...", pct: 5 });
  const endDatePy = new Date(date);
  const startDatePy = new Date(date);
  startDatePy.setDate(startDatePy.getDate() - 10);
  const startStrPy = startDatePy.toISOString().split("T")[0];
  const endStrPy = endDatePy.toISOString().split("T")[0];
  let pybaseballStatcast = null;
  let preloadedArsenalData = {};
  let preloadedAdvancedMetrics = {};
  try {
    const startedAt = Date.now();
    pybaseballStatcast = await getRecentStatcast(startStrPy, endStrPy);
    for (const pitcher of pybaseballStatcast?.data?.pitchers_recent || []) {
      preloadedAdvancedMetrics[String(pitcher.pitcher)] = {
        spinRate: safeFloat(pitcher.avg_spin_rate),
        chasePct: safeFloat(pitcher.chase_pct),
        stuffPlus: null
      };
    }
    console.log(`[ETL Timing] Statcast agregado: ${Date.now() - startedAt}ms, ${Object.keys(preloadedAdvancedMetrics).length} pitchers.`);
  } catch (err) {
    console.error("Error cargando PyBaseball", err);
  }
  emit({ phase: "schedule", step: "Precargando arsenal y m\xE9tricas avanzadas...", pct: 6 });
  try {
    const allProbablePitchers = matchesNeedingExtraction.flatMap((m) => [m.teams?.home?.probablePitcher?.id, m.teams?.away?.probablePitcher?.id]).map((id) => String(id)).filter((id) => id && id !== "undefined" && id !== "0");
    const uniquePitchers = [...new Set(allProbablePitchers)];
    if (uniquePitchers.length > 0) {
      console.log(`[ETL] Precargando PyBaseball para ${uniquePitchers.length} pitchers en lote...`);
      const startedAt = Date.now();
      preloadedArsenalData = await getPitcherArsenals(uniquePitchers, season);
      console.log(`[ETL Timing] Arsenal agregado: ${Date.now() - startedAt}ms, ${Object.keys(preloadedArsenalData).length} pitchers.`);
      console.log(`[ETL] Precarga de PyBaseball completada.`);
    }
  } catch (err) {
    console.error("Error en precarga masiva de PyBaseball:", err);
  }
  const harvestedGames = [];
  const errorsCollection = readErrorsDB();
  try {
    const matchesToHarvest = mlbMatches;
    const totalGames = matchesToHarvest.length;
    emit({ phase: "schedule", step: `${totalGames} juego(s) encontrados para ${date}`, pct: 5 });
    if (totalGames === 0) {
      emit({ phase: "save", step: "Guardando base de datos...", pct: 90 });
      const db3 = readGamesDB();
      db3[date] = [];
      writeGamesDB(db3);
      emit({
        phase: "done",
        step: `Extracci\xF3n completada \u2014 0 juego(s)`,
        pct: 100,
        games: [],
        errorsCount: errorsCollection.length
      });
      res.end();
      return;
    }
    const pctPerGame = Math.floor(87 / totalGames);
    for (let gi = 0; gi < matchesToHarvest.length; gi++) {
      if (isCancelled) {
        console.log(`[ETL] Abortando bucle de juegos. Proceso cancelado.`);
        emit({ phase: "done", step: "Extracci\xF3n cancelada por el usuario" });
        break;
      }
      const match = matchesToHarvest[gi];
      const homeName = match.teams.home.team.name;
      const awayName = match.teams.away.team.name;
      const homeTeamId = match.teams.home.team.id;
      const awayTeamId = match.teams.away.team.id;
      const venueName = match.venue?.name || "MLB Stadium";
      const matchTime = formatGameTime(match.gameDate);
      const gameId2 = String(match.gamePk);
      const gameLabel = `${awayName} @ ${homeName}`;
      const basePct = 5 + gi * pctPerGame;
      const gameStartedAt = Date.now();
      if (!forceRebuild) {
        const cachedGame = existingGamesForDate.find((g) => String(g.id) === String(gameId2));
        if (cachedGame && isFinalGameStatus2(cachedGame.game_result?.gameStatus)) {
          console.log(`[Cach\xE9] Juego ${gameId2} (${gameLabel}) ya finaliz\xF3 \u2014 cargando desde DB local.`);
          harvestedGames.push(cachedGame);
          emit({
            phase: "game_done",
            step: `\u2713 ${gameLabel} (sin cambios \u2014 reutilizado desde la base local)`,
            gameLabel,
            gameIndex: gi + 1,
            totalGames,
            pct: basePct + pctPerGame,
            cached: true
          });
          continue;
        }
        if (!refreshOdds && cachedGame && hasSolidPregameCoverage(cachedGame)) {
          emit({
            phase: "real_data",
            step: `Actualizando resultado: ${gameLabel}`,
            gameLabel,
            gameIndex: gi + 1,
            totalGames,
            pct: basePct + Math.floor(pctPerGame * 0.3)
          });
          try {
            const [gameResultLight, liveOnly, starterBoxLight] = await Promise.all([
              fetchGameResult(gameId2, cachedGame.betting_lines),
              fetchLiveResultOnly(gameId2),
              getStarterBoxscoreStats(gameId2)
            ]);
            const refreshedGame = applyLiveResultRefresh(cachedGame, gameResultLight, liveOnly, starterBoxLight);
            const validationResultLight = validateGamePayload(refreshedGame, errorsCollection);
            refreshedGame.validation = {
              isValid: validationResultLight.isValid,
              errors: validationResultLight.errors,
              checkedAt: (/* @__PURE__ */ new Date()).toISOString()
            };
            enrichWithVortexMetrics(refreshedGame);
            capturePregameSnapshot(refreshedGame);
            harvestedGames.push(refreshedGame);
            saveGameData(gameId2, refreshedGame).catch((fsErr) => {
              console.error(`Error saving to Firestore for game ${gameId2}:`, fsErr);
              errorsCollection.push({
                id: `err-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                timestamp: (/* @__PURE__ */ new Date()).toISOString(),
                gameId: gameId2,
                source: "Firestore",
                message: `Fallo al sincronizar con Firestore: ${fsErr instanceof Error ? fsErr.message : String(fsErr)}`,
                severity: "medium"
              });
            });
            const incrementalDB2 = readGamesDB();
            const incrementalDateGames2 = [...incrementalDB2[date] || []];
            const incrementalIndex2 = incrementalDateGames2.findIndex((g) => String(g.id) === String(gameId2));
            if (incrementalIndex2 >= 0) incrementalDateGames2[incrementalIndex2] = refreshedGame;
            else incrementalDateGames2.push(refreshedGame);
            incrementalDB2[date] = incrementalDateGames2;
            writeGamesDB(incrementalDB2);
            console.log(`[Refresco liviano] Juego ${gameId2} (${gameLabel}): ${Date.now() - gameStartedAt}ms \u2014 pregame reutilizado, solo resultado actualizado.`);
            emit({
              phase: "game_done",
              step: `\u2713 ${gameLabel} (resultado actualizado)`,
              gameLabel,
              gameIndex: gi + 1,
              totalGames,
              pct: basePct + pctPerGame
            });
            await new Promise((r) => setTimeout(r, 400));
            continue;
          } catch (lightErr) {
            console.warn(`[Refresco liviano] Fall\xF3 para ${gameId2}, se har\xE1 extracci\xF3n completa:`, lightErr);
          }
        }
      }
      emit({
        phase: "real_data",
        step: `Datos MLB: ${gameLabel}`,
        gameLabel,
        gameIndex: gi + 1,
        totalGames,
        pct: basePct + Math.floor(pctPerGame * 0.1)
      });
      console.log(`Consultando MLB Stats API para datos reales del juego ${gameId2}...`);
      const realMLBData = await fetchRealMLBGameData(gameId2, homeTeamId, awayTeamId, date);
      console.log(`Datos reales: pitcher local=${realMLBData.pitchers?.home?.name || "N/D"}, visitante=${realMLBData.pitchers?.away?.name || "N/D"}`);
      emit({
        phase: "validate",
        step: `Validando: ${gameLabel}`,
        gameLabel,
        gameIndex: gi + 1,
        totalGames,
        pct: basePct + Math.floor(pctPerGame * 0.6)
      });
      const gameDataParsed = buildDirectGameData(gameId2, homeName, awayName, venueName, date, matchTime, realMLBData, realOddsData, pitcherStrikeoutRows, totalBasesRows, !historicalDate);
      emit({
        phase: "advanced_data",
        step: `Clima y Sabermetr\xEDa: ${gameLabel}`,
        gameLabel,
        gameIndex: gi + 1,
        totalGames,
        pct: basePct + Math.floor(pctPerGame * 0.35)
      });
      console.log(`fetching climate, splits, fatigue and advanced stats for game ${gameId2}...`);
      const season2 = date.substring(0, 4);
      const homePitcherId = realMLBData.pitcherIds?.home || 0;
      const awayPitcherId = realMLBData.pitcherIds?.away || 0;
      const [
        weather,
        homeSplits,
        awaySplits,
        homeAdvPitching,
        awayAdvPitching,
        homeLast7,
        awayLast7,
        homeLast5Profile,
        awayLast5Profile,
        homeVsOpp,
        awayVsOpp,
        homeLast3VsTeam,
        awayLast3VsTeam,
        homeAdvOffense,
        awayAdvOffense,
        fatigue
      ] = await Promise.all([
        fetchWeatherData(venueName, date, match.gameDate || (/* @__PURE__ */ new Date()).toISOString()),
        fetchOffensiveSplits(homeTeamId, season2),
        fetchOffensiveSplits(awayTeamId, season2),
        fetchAdvancedPitching(homePitcherId, season2),
        fetchAdvancedPitching(awayPitcherId, season2),
        fetchAdvancedPitchingLast7(homePitcherId, season2, date),
        fetchAdvancedPitchingLast7(awayPitcherId, season2, date),
        fetchPitcherLast5Profile(homePitcherId, season2, date),
        fetchPitcherLast5Profile(awayPitcherId, season2, date),
        fetchAdvancedPitchingVsOpp(homePitcherId, awayTeamId),
        fetchAdvancedPitchingVsOpp(awayPitcherId, homeTeamId),
        fetchPitcherLast3VsTeamProfile(homePitcherId, awayTeamId, season2, date),
        fetchPitcherLast3VsTeamProfile(awayPitcherId, homeTeamId, season2, date),
        fetchAdvancedOffense(homeTeamId, season2),
        fetchAdvancedOffense(awayTeamId, season2),
        fetchFatigueMetrics(homePitcherId, awayPitcherId, homeTeamId, awayTeamId, date)
      ]);
      gameDataParsed.weather = weather;
      gameDataParsed.park_factors = parkFactorsScraper.getParkFactors(venueName) || {
        index_so: 100,
        index_runs: 100,
        index_hr: 100
      };
      gameDataParsed.offensive_splits = {
        home: homeSplits,
        away: awaySplits
      };
      const homePitcherSavant = savantCache.getPitcher(homePitcherId);
      const awayPitcherSavant = savantCache.getPitcher(awayPitcherId);
      if (homePitcherSavant) {
        homeAdvPitching.xEra = homePitcherSavant.xERA;
        homeAdvPitching.hardHitPct = homePitcherSavant.hardHitPct;
        homeAdvPitching.barrelPct = homePitcherSavant.barrelPct;
        homeAdvPitching.fastballPct = homePitcherSavant.fastballPct;
        homeAdvPitching.sliderPct = homePitcherSavant.sliderPct;
        homeAdvPitching.curvePct = homePitcherSavant.curvePct;
        homeAdvPitching.changeupPct = homePitcherSavant.changeupPct;
        homeAdvPitching.splitterPct = homePitcherSavant.splitterPct;
        if (homePitcherSavant.xwOBA !== null) {
          homeAdvOffense.xwOba = homeAdvOffense.xwOba ?? homePitcherSavant.xwOBA;
        }
      }
      if (awayPitcherSavant) {
        awayAdvPitching.xEra = awayPitcherSavant.xERA;
        awayAdvPitching.hardHitPct = awayPitcherSavant.hardHitPct;
        awayAdvPitching.barrelPct = awayPitcherSavant.barrelPct;
        awayAdvPitching.fastballPct = awayPitcherSavant.fastballPct;
        awayAdvPitching.sliderPct = awayPitcherSavant.sliderPct;
        awayAdvPitching.curvePct = awayPitcherSavant.curvePct;
        awayAdvPitching.changeupPct = awayPitcherSavant.changeupPct;
        awayAdvPitching.splitterPct = awayPitcherSavant.splitterPct;
        if (awayPitcherSavant.xwOBA !== null) {
          awayAdvOffense.xwOba = awayAdvOffense.xwOba ?? awayPitcherSavant.xwOBA;
        }
      }
      try {
        const pitcherArsenalData = preloadedArsenalData;
        const advancedMetricsData = preloadedAdvancedMetrics;
        const homeArsenal = pitcherArsenalData[String(homePitcherId)];
        const awayArsenal = pitcherArsenalData[String(awayPitcherId)];
        const homeAdvSavant = advancedMetricsData[String(homePitcherId)];
        const awayAdvSavant = advancedMetricsData[String(awayPitcherId)];
        if (homeArsenal) {
          homeAdvPitching.fastballPct = homeArsenal.fastballPct;
          homeAdvPitching.sliderPct = homeArsenal.sliderPct;
          homeAdvPitching.curvePct = homeArsenal.curvePct;
          homeAdvPitching.changeupPct = homeArsenal.changeupPct;
          homeAdvPitching.splitterPct = homeArsenal.splitterPct;
          console.log(`[Arsenal Python] HOME ${gameDataParsed.pitchers?.home?.name}: FB=${homeArsenal.fastballPct}% SL=${homeArsenal.sliderPct}% CU=${homeArsenal.curvePct}%`);
        }
        if (awayArsenal) {
          awayAdvPitching.fastballPct = awayArsenal.fastballPct;
          awayAdvPitching.sliderPct = awayArsenal.sliderPct;
          awayAdvPitching.curvePct = awayArsenal.curvePct;
          awayAdvPitching.changeupPct = awayArsenal.changeupPct;
          awayAdvPitching.splitterPct = awayArsenal.splitterPct;
          console.log(`[Arsenal Python] AWAY ${gameDataParsed.pitchers?.away?.name}: FB=${awayArsenal.fastballPct}% SL=${awayArsenal.sliderPct}% CU=${awayArsenal.curvePct}%`);
        }
        if (homeAdvSavant) {
          homeAdvPitching.pitcher_spin_rate = homeAdvSavant.spinRate;
          homeAdvPitching.pitcher_o_swing_pct = homeAdvSavant.chasePct;
          homeAdvPitching.pitcher_stuff_plus = homeAdvSavant.stuffPlus;
        }
        if (awayAdvSavant) {
          awayAdvPitching.pitcher_spin_rate = awayAdvSavant.spinRate;
          awayAdvPitching.pitcher_o_swing_pct = awayAdvSavant.chasePct;
          awayAdvPitching.pitcher_stuff_plus = awayAdvSavant.stuffPlus;
        }
      } catch (arsenalErr) {
        console.warn(`[Python Scraper] Error al obtener arsenal/metricas para juego ${gameId2}:`, arsenalErr);
      }
      if (pybaseballStatcast?.data?.pitchers_recent) {
        const homePStats = pybaseballStatcast.data.pitchers_recent.find((p) => String(p.pitcher) === String(homePitcherId));
        if (homePStats && gameDataParsed.pitchers?.home) {
          gameDataParsed.pitchers.home.pitcher_csw_pct = homePStats.csw_pct;
          gameDataParsed.pitchers.home.pitcher_recent_velocity = homePStats.avg_velocity;
        }
        const awayPStats = pybaseballStatcast.data.pitchers_recent.find((p) => String(p.pitcher) === String(awayPitcherId));
        if (awayPStats && gameDataParsed.pitchers?.away) {
          gameDataParsed.pitchers.away.pitcher_csw_pct = awayPStats.csw_pct;
          gameDataParsed.pitchers.away.pitcher_recent_velocity = awayPStats.avg_velocity;
        }
      }
      const homeLineup = gameDataParsed.lineups?.home || [];
      const awayLineup = gameDataParsed.lineups?.away || [];
      const homeLineupSavant = calculateLineupSavantAverages(homeLineup);
      const awayLineupSavant = calculateLineupSavantAverages(awayLineup);
      if (homeLineupSavant.xwOba !== null) homeAdvOffense.xwOba = homeLineupSavant.xwOba;
      if (awayLineupSavant.xwOba !== null) awayAdvOffense.xwOba = awayLineupSavant.xwOba;
      if (homeLineupSavant.hardHitPct !== null) homeAdvOffense.hardHitPct = homeLineupSavant.hardHitPct;
      if (awayLineupSavant.hardHitPct !== null) awayAdvOffense.hardHitPct = awayLineupSavant.hardHitPct;
      if (homeLineupSavant.barrelPct !== null) homeAdvOffense.barrelPct = homeLineupSavant.barrelPct;
      if (awayLineupSavant.barrelPct !== null) awayAdvOffense.barrelPct = awayLineupSavant.barrelPct;
      if (homeLineupSavant.chasePct !== null) homeAdvOffense.chasePct = homeLineupSavant.chasePct;
      if (awayLineupSavant.chasePct !== null) awayAdvOffense.chasePct = awayLineupSavant.chasePct;
      if (homeLineupSavant.whiffPct !== null) {
        homeAdvOffense.projectedLineupWhiffPctVsHand = homeLineupSavant.whiffPct;
        homeAdvOffense.contactPct = 100 - homeLineupSavant.whiffPct;
        homeAdvOffense.projectedLineupContactPctVsHand = 100 - homeLineupSavant.whiffPct;
      }
      homeAdvOffense.whiffPctVsFastball = homeLineupSavant.whiffPctVsFastball;
      homeAdvOffense.whiffPctVsSlider = homeLineupSavant.whiffPctVsSlider;
      homeAdvOffense.whiffPctVsCurve = homeLineupSavant.whiffPctVsCurve;
      homeAdvOffense.whiffPctVsChangeup = homeLineupSavant.whiffPctVsChangeup;
      homeAdvOffense.whiffPctVsSplitter = homeLineupSavant.whiffPctVsSplitter;
      if (awayLineupSavant.whiffPct !== null) {
        awayAdvOffense.projectedLineupWhiffPctVsHand = awayLineupSavant.whiffPct;
        awayAdvOffense.contactPct = 100 - awayLineupSavant.whiffPct;
        awayAdvOffense.projectedLineupContactPctVsHand = 100 - awayLineupSavant.whiffPct;
      }
      awayAdvOffense.whiffPctVsFastball = awayLineupSavant.whiffPctVsFastball;
      awayAdvOffense.whiffPctVsSlider = awayLineupSavant.whiffPctVsSlider;
      awayAdvOffense.whiffPctVsCurve = awayLineupSavant.whiffPctVsCurve;
      awayAdvOffense.whiffPctVsChangeup = awayLineupSavant.whiffPctVsChangeup;
      awayAdvOffense.whiffPctVsSplitter = awayLineupSavant.whiffPctVsSplitter;
      const homeCatcher = homeLineup.find((p) => p.position === "C");
      if (homeCatcher) {
        homeAdvPitching.catcherName = homeCatcher.name;
        const savantCatcher = savantCache.getCatcher(homeCatcher.id ?? homeCatcher.mlbId);
        if (savantCatcher && savantCatcher.framingRuns !== null) {
          homeAdvPitching.catcherFramingRuns = savantCatcher.framingRuns;
        }
      }
      const awayCatcher = awayLineup.find((p) => p.position === "C");
      if (awayCatcher) {
        awayAdvPitching.catcherName = awayCatcher.name;
        const savantCatcher = savantCache.getCatcher(awayCatcher.id ?? awayCatcher.mlbId);
        if (savantCatcher && savantCatcher.framingRuns !== null) {
          awayAdvPitching.catcherFramingRuns = savantCatcher.framingRuns;
        }
      }
      for (const p of homeLineup) {
        const savant = savantCache.getBatter(p.id ?? p.mlbId);
        if (savant) {
          p.chase_pct = savant.chasePct;
          p.whiff_pct = savant.whiffPct;
          if (savant.whiffPct !== null) {
            const contactPct = roundNumber(100 - savant.whiffPct, 1);
            p.contact_pct_vs_rhp = contactPct;
            p.contact_pct_vs_lhp = contactPct;
          }
        }
      }
      for (const p of awayLineup) {
        const savant = savantCache.getBatter(p.id ?? p.mlbId);
        if (savant) {
          p.chase_pct = savant.chasePct;
          p.whiff_pct = savant.whiffPct;
          if (savant.whiffPct !== null) {
            const contactPct = roundNumber(100 - savant.whiffPct, 1);
            p.contact_pct_vs_rhp = contactPct;
            p.contact_pct_vs_lhp = contactPct;
          }
        }
      }
      const homePitcherHand = realMLBData.pitchers?.home?.pitchHand || "R";
      const awayPitcherHand = realMLBData.pitchers?.away?.pitchHand || "R";
      homeAdvOffense.kPctVsPitchHand = awayPitcherHand === "L" ? homeSplits?.vsLhp?.kPct ?? 20 : homeSplits?.vsRhp?.kPct ?? 20;
      awayAdvOffense.kPctVsPitchHand = homePitcherHand === "L" ? awaySplits?.vsLhp?.kPct ?? 20 : awaySplits?.vsRhp?.kPct ?? 20;
      const getLineupVsHandProjection = (lineup, pitcherHand) => {
        if (!lineup.length) return { kPct: null, contactPct: null };
        const isLefty = pitcherHand === "L";
        const kPct = calculateOpponentLineupKPct(lineup, pitcherHand);
        const validContactPlayers = lineup.map((p) => ({
          val: safeFloat(isLefty ? p.contact_pct_vs_lhp : p.contact_pct_vs_rhp),
          pa: p.pa && p.pa > 0 ? p.pa : 50
        })).filter((p) => p.val !== null && p.val > 0);
        let contactPct = null;
        if (validContactPlayers.length > 0) {
          const totalWeightedContact = validContactPlayers.reduce((sum, p) => sum + p.val * p.pa, 0);
          const totalPAContact = validContactPlayers.reduce((sum, p) => sum + p.pa, 0);
          contactPct = totalPAContact > 0 ? totalWeightedContact / totalPAContact : null;
        }
        return {
          kPct,
          contactPct
        };
      };
      const homeLineupVsHand = getLineupVsHandProjection(homeLineup, awayPitcherHand);
      const awayLineupVsHand = getLineupVsHandProjection(awayLineup, homePitcherHand);
      homeAdvOffense.projectedLineupKPct = homeLineupVsHand.kPct;
      awayAdvOffense.projectedLineupKPct = awayLineupVsHand.kPct;
      if (homeLineupVsHand.contactPct !== null) homeAdvOffense.projectedLineupContactPctVsHand = homeLineupVsHand.contactPct;
      if (awayLineupVsHand.contactPct !== null) awayAdvOffense.projectedLineupContactPctVsHand = awayLineupVsHand.contactPct;
      Object.assign(homeAdvPitching, homeLast5Profile, homeLast3VsTeam);
      Object.assign(awayAdvPitching, awayLast5Profile, awayLast3VsTeam);
      homeAdvPitching.projectedPitchCount = calculateProjectedPitchCount(homeAdvPitching, fatigue.pitchers?.home);
      awayAdvPitching.projectedPitchCount = calculateProjectedPitchCount(awayAdvPitching, fatigue.pitchers?.away);
      homeAdvPitching.projectedInnings = calculateProjectedInnings(homeAdvPitching);
      awayAdvPitching.projectedInnings = calculateProjectedInnings(awayAdvPitching);
      homeAdvPitching.projectedStrikeoutsBase = calculateVortexProjectedKs(homeAdvPitching, awayAdvOffense, fatigue.pitchers?.home);
      awayAdvPitching.projectedStrikeoutsBase = calculateVortexProjectedKs(awayAdvPitching, homeAdvOffense, fatigue.pitchers?.away);
      gameDataParsed.advanced_pitching = {
        home: homeAdvPitching,
        away: awayAdvPitching,
        homeLast7,
        awayLast7,
        homeVsOpp,
        awayVsOpp
      };
      gameDataParsed.advanced_offense = {
        home: homeAdvOffense,
        away: awayAdvOffense
      };
      gameDataParsed.fatigue_metrics = fatigue;
      if (fatigue?.bullpen) {
        gameDataParsed.bullpen.home.ipLast3Days = fatigue.bullpen.home.ipLast3Days;
        gameDataParsed.bullpen.away.ipLast3Days = fatigue.bullpen.away.ipLast3Days;
        const getUsage = (ip3d) => {
          if (typeof ip3d !== "number") return "N/A";
          if (ip3d >= 8) return "Alta";
          if (ip3d >= 3) return "Moderada";
          return "Baja";
        };
        gameDataParsed.bullpen.home.usageLast3Days = getUsage(fatigue.bullpen.home.ipLast3Days);
        gameDataParsed.bullpen.away.usageLast3Days = getUsage(fatigue.bullpen.away.ipLast3Days);
      }
      const existingGame = existingGamesForDate.find((g) => String(g.id) === String(gameId2));
      if (existingGame && (historicalDate || !hasRealBettingLines2(gameDataParsed))) {
        if (preserveCapturedBettingData(gameDataParsed, existingGame)) {
          console.log(`[Persistencia] L\xEDneas y props capturados preservados para el juego ${gameId2} (Modo Batch).`);
        }
      }
      const lineMovements = [...existingGame?.line_movements || []];
      const currentOdds = gameDataParsed.betting_lines;
      const newMovement = {
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        openingMoneylineHome: currentOdds.openingMoneylineHome,
        openingMoneylineAway: currentOdds.openingMoneylineAway,
        currentMoneylineHome: currentOdds.currentMoneylineHome,
        currentMoneylineAway: currentOdds.currentMoneylineAway,
        runLineHome: currentOdds.runLineHome,
        runLineHomeOdds: currentOdds.runLineHomeOdds,
        runLineAway: currentOdds.runLineAway,
        runLineAwayOdds: currentOdds.runLineAwayOdds,
        totalRuns: currentOdds.totalRuns,
        overOdds: currentOdds.overOdds,
        underOdds: currentOdds.underOdds
      };
      if (!historicalDate || lineMovements.length === 0) lineMovements.push(newMovement);
      gameDataParsed.line_movements = lineMovements;
      appendBettingSnapshotIfChanged(gameDataParsed, existingGame);
      gameDataParsed.model_features = calculateModelFeatures(gameDataParsed);
      const gameResult = await fetchGameResult(gameId2, currentOdds);
      if (gameResult) {
        gameDataParsed.game_result = gameResult;
      }
      const canUseActualKs = isFinalGameStatus2(gameDataParsed.game_result?.gameStatus);
      if (canUseActualKs) {
        try {
          const bsStats = await getStarterBoxscoreStats(gameId2);
          gameDataParsed.boxscore_stats = bsStats;
          gameDataParsed.advanced_pitching.home.actualStrikeouts = bsStats.home?.strikeOuts ?? null;
          gameDataParsed.advanced_pitching.away.actualStrikeouts = bsStats.away?.strikeOuts ?? null;
        } catch (err) {
          console.warn(`Could not fetch boxscore for ${gameId2}:`, err);
        }
      } else {
        gameDataParsed.boxscore_stats = null;
        gameDataParsed.advanced_pitching.home.actualStrikeouts = null;
        gameDataParsed.advanced_pitching.away.actualStrikeouts = null;
      }
      const validationResult = validateGamePayload(gameDataParsed, errorsCollection);
      gameDataParsed.validation = {
        isValid: validationResult.isValid,
        errors: validationResult.errors,
        checkedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      gameDataParsed.timestamp = (/* @__PURE__ */ new Date()).toISOString();
      gameDataParsed.lastReverifyAttempt = gameDataParsed.timestamp;
      capturePregameSnapshot(gameDataParsed);
      saveGameData(gameId2, gameDataParsed).catch((fsErr) => {
        console.error(`Error saving to Firestore for game ${gameId2}:`, fsErr);
        errorsCollection.push({
          id: `err-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          gameId: gameId2,
          source: "Firestore",
          message: `Fallo al sincronizar con Firestore: ${fsErr instanceof Error ? fsErr.message : String(fsErr)}`,
          severity: "medium"
        });
      });
      harvestedGames.push(gameDataParsed);
      const incrementalDB = readGamesDB();
      const incrementalDateGames = [...incrementalDB[date] || []];
      const incrementalIndex = incrementalDateGames.findIndex((game) => String(game.id) === String(gameId2));
      if (incrementalIndex >= 0) incrementalDateGames[incrementalIndex] = gameDataParsed;
      else incrementalDateGames.push(gameDataParsed);
      incrementalDB[date] = incrementalDateGames;
      writeGamesDB(incrementalDB);
      console.log(`[ETL Timing] Juego ${gameId2}: ${Date.now() - gameStartedAt}ms.`);
      emit({
        phase: "game_done",
        step: `\u2713 ${gameLabel}`,
        gameLabel,
        gameIndex: gi + 1,
        totalGames,
        pct: basePct + pctPerGame
      });
      await new Promise((r) => setTimeout(r, 400));
    }
    emit({ phase: "save", step: "Guardando en base de datos local...", pct: 93 });
    const db2 = readGamesDB();
    for (const newGame of harvestedGames) {
      const newGameId = String(newGame.id);
      for (const otherDate of Object.keys(db2)) {
        if (otherDate === date) continue;
        const otherGames = Array.isArray(db2[otherDate]) ? db2[otherDate] : [];
        const clash = otherGames.find((g) => String(g?.id) === newGameId);
        if (clash) {
          const msg = `[DUPLICADO game_id] ${newGameId} ya existe bajo la fecha ${otherDate} (status=${clash?.game_result?.gameStatus ?? "?"}) y se est\xE1 guardando tambi\xE9n bajo ${date} (status=${newGame?.game_result?.gameStatus ?? "?"}). Revisar manualmente cu\xE1l fecha es la vigente.`;
          console.warn(msg);
          errorsCollection.push({
            id: `err-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            timestamp: (/* @__PURE__ */ new Date()).toISOString(),
            gameId: newGameId,
            source: "DuplicateGameId",
            message: msg,
            severity: "low"
          });
        }
      }
    }
    db2[date] = harvestedGames;
    writeGamesDB(db2);
    writeErrorsDB(errorsCollection);
    console.log(`[ETL Timing] Extracci\xF3n ${date}: ${Date.now() - harvestStartedAt}ms para ${harvestedGames.length} juegos.`);
    emit({
      phase: "done",
      step: `Extracci\xF3n completada \u2014 ${harvestedGames.length} juego(s)`,
      pct: 100,
      games: harvestedGames,
      errorsCount: errorsCollection.length
    });
    res.end();
  } catch (error) {
    console.error("General harvesting failure:", error);
    emit({ phase: "error", step: "Error general: " + (error instanceof Error ? error.message : String(error)), pct: 0 });
    res.end();
  }
});
async function updateSingleGameData(gameId2, date, forceRefreshOdds = false) {
  console.log(`Actualizando juego individual ${gameId2} para la fecha ${date}...`);
  const mlbRes = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}`);
  const mlbData = await mlbRes.json();
  let match = null;
  let actualDate = date;
  if (mlbData.dates && mlbData.dates[0] && mlbData.dates[0].games) {
    match = mlbData.dates[0].games.find((g) => String(g.gamePk) === String(gameId2));
  }
  if (!match) {
    const byGamePkRes = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&gamePk=${gameId2}`);
    const byGamePkData = await byGamePkRes.json();
    for (const scheduleDate of byGamePkData.dates || []) {
      const found = (scheduleDate.games || []).find((g) => String(g.gamePk) === String(gameId2));
      if (found) {
        match = found;
        actualDate = scheduleDate.date || String(found.gameDate || "").split("T")[0] || date;
        console.warn(`Juego ${gameId2} no pertenece a ${date}; usando fecha real ${actualDate}.`);
        break;
      }
    }
  }
  if (!match) {
    throw new Error(`Juego ${gameId2} no encontrado en el calendario de MLB`);
  }
  const homeName = match.teams.home.team.name;
  const awayName = match.teams.away.team.name;
  const homeTeamId = match.teams.home.team.id;
  const awayTeamId = match.teams.away.team.id;
  const venueName = match.venue?.name || "MLB Stadium";
  const matchTime = formatGameTime(match.gameDate);
  if (!forceRefreshOdds) {
    const dbForLightCheck = readGamesDB();
    const gamesForDateLightCheck = dbForLightCheck[actualDate] || [];
    const cachedGameLight = gamesForDateLightCheck.find((g) => String(g.id) === String(gameId2));
    if (cachedGameLight && !isFinalGameStatus2(cachedGameLight.game_result?.gameStatus) && hasSolidPregameCoverage(cachedGameLight)) {
      console.log(`[Refresco liviano] Juego individual ${gameId2} \u2014 pregame ya completo, solo se actualiza el resultado.`);
      const [gameResultLight, liveOnlyLight, starterBoxLight] = await Promise.all([
        fetchGameResult(gameId2, cachedGameLight.betting_lines),
        fetchLiveResultOnly(gameId2),
        getStarterBoxscoreStats(gameId2)
      ]);
      const refreshedGameLight = applyLiveResultRefresh(cachedGameLight, gameResultLight, liveOnlyLight, starterBoxLight);
      const errorsCollectionLight = readErrorsDB();
      const validationResultLight = validateGamePayload(refreshedGameLight, errorsCollectionLight);
      refreshedGameLight.validation = {
        isValid: validationResultLight.isValid,
        errors: validationResultLight.errors,
        checkedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      enrichWithVortexMetrics(refreshedGameLight);
      capturePregameSnapshot(refreshedGameLight);
      saveGameData(gameId2, refreshedGameLight).catch((fsErr) => {
        console.error(`Error saving to Firestore for game ${gameId2}:`, fsErr);
      });
      const updatedGamesLight = gamesForDateLightCheck.map(
        (g) => String(g.id) === String(gameId2) ? refreshedGameLight : g
      );
      dbForLightCheck[actualDate] = updatedGamesLight;
      writeGamesDB(dbForLightCheck);
      writeErrorsDB(errorsCollectionLight);
      return refreshedGameLight;
    }
  }
  const historicalDate = isPastGameDate(actualDate);
  const realOddsData = await fetchRealBettingLines(actualDate, forceRefreshOdds);
  const pitcherStrikeoutRows = historicalDate ? [] : await fetchDataStreakPitcherStrikeoutProps(actualDate, forceRefreshOdds);
  const totalBasesRows = historicalDate ? [] : await fetchDataStreakTotalBasesProps(actualDate, forceRefreshOdds);
  const realMLBData = await fetchRealMLBGameData(gameId2, homeTeamId, awayTeamId, actualDate);
  const gameDataParsed = buildDirectGameData(gameId2, homeName, awayName, venueName, actualDate, matchTime, realMLBData, realOddsData, pitcherStrikeoutRows, totalBasesRows, !historicalDate);
  const season = actualDate.substring(0, 4);
  await Promise.all([
    savantCache.load(parseInt(season)),
    parkFactorsScraper.load()
  ]);
  const homePitcherId = realMLBData.pitcherIds?.home || 0;
  const awayPitcherId = realMLBData.pitcherIds?.away || 0;
  const [
    weather,
    homeSplits,
    awaySplits,
    homeAdvPitching,
    awayAdvPitching,
    homeLast7,
    awayLast7,
    homeLast5Profile,
    awayLast5Profile,
    homeVsOpp,
    awayVsOpp,
    homeLast3VsTeam,
    awayLast3VsTeam,
    homeAdvOffense,
    awayAdvOffense,
    fatigue
  ] = await Promise.all([
    fetchWeatherData(venueName, actualDate, match.gameDate || (/* @__PURE__ */ new Date()).toISOString()),
    fetchOffensiveSplits(homeTeamId, season),
    fetchOffensiveSplits(awayTeamId, season),
    fetchAdvancedPitching(homePitcherId, season),
    fetchAdvancedPitching(awayPitcherId, season),
    fetchAdvancedPitchingLast7(homePitcherId, season, actualDate),
    fetchAdvancedPitchingLast7(awayPitcherId, season, actualDate),
    fetchPitcherLast5Profile(homePitcherId, season, actualDate),
    fetchPitcherLast5Profile(awayPitcherId, season, actualDate),
    fetchAdvancedPitchingVsOpp(homePitcherId, awayTeamId),
    fetchAdvancedPitchingVsOpp(awayPitcherId, homeTeamId),
    fetchPitcherLast3VsTeamProfile(homePitcherId, awayTeamId, season, actualDate),
    fetchPitcherLast3VsTeamProfile(awayPitcherId, homeTeamId, season, actualDate),
    fetchAdvancedOffense(homeTeamId, season),
    fetchAdvancedOffense(awayTeamId, season),
    fetchFatigueMetrics(homePitcherId, awayPitcherId, homeTeamId, awayTeamId, actualDate)
  ]);
  gameDataParsed.weather = weather;
  gameDataParsed.park_factors = parkFactorsScraper.getParkFactors(venueName) || {
    index_so: 100,
    index_runs: 100,
    index_hr: 100
  };
  gameDataParsed.offensive_splits = { home: homeSplits, away: awaySplits };
  const homePitcherSavantU = savantCache.getPitcher(homePitcherId);
  const awayPitcherSavantU = savantCache.getPitcher(awayPitcherId);
  if (homePitcherSavantU) {
    homeAdvPitching.xEra = homePitcherSavantU.xERA;
    homeAdvPitching.hardHitPct = homePitcherSavantU.hardHitPct;
    homeAdvPitching.barrelPct = homePitcherSavantU.barrelPct;
    homeAdvPitching.fastballPct = homePitcherSavantU.fastballPct;
    homeAdvPitching.sliderPct = homePitcherSavantU.sliderPct;
    homeAdvPitching.curvePct = homePitcherSavantU.curvePct;
    homeAdvPitching.changeupPct = homePitcherSavantU.changeupPct;
    homeAdvPitching.splitterPct = homePitcherSavantU.splitterPct;
    if (homePitcherSavantU.xwOBA !== null) {
      homeAdvOffense.xwOba = homeAdvOffense.xwOba ?? homePitcherSavantU.xwOBA;
    }
  }
  if (awayPitcherSavantU) {
    awayAdvPitching.xEra = awayPitcherSavantU.xERA;
    awayAdvPitching.hardHitPct = awayPitcherSavantU.hardHitPct;
    awayAdvPitching.barrelPct = awayPitcherSavantU.barrelPct;
    awayAdvPitching.fastballPct = awayPitcherSavantU.fastballPct;
    awayAdvPitching.sliderPct = awayPitcherSavantU.sliderPct;
    awayAdvPitching.curvePct = awayPitcherSavantU.curvePct;
    awayAdvPitching.changeupPct = awayPitcherSavantU.changeupPct;
    awayAdvPitching.splitterPct = awayPitcherSavantU.splitterPct;
    if (awayPitcherSavantU.xwOBA !== null) {
      awayAdvOffense.xwOba = awayAdvOffense.xwOba ?? awayPitcherSavantU.xwOBA;
    }
  }
  try {
    const d = new Date(actualDate);
    const startD = new Date(d.getTime() - 10 * 24 * 60 * 60 * 1e3);
    const startDStr = startD.toISOString().split("T")[0];
    const validPitchersU = [String(homePitcherId), String(awayPitcherId)].filter((id) => id !== "0");
    const [pitcherArsenalDataU, recentStatcastU] = await Promise.all([
      getPitcherArsenals(validPitchersU, season),
      getRecentStatcast(startDStr, actualDate)
    ]);
    const advancedMetricsDataU = {};
    for (const pitcher of recentStatcastU?.data?.pitchers_recent || []) {
      advancedMetricsDataU[String(pitcher.pitcher)] = {
        spinRate: safeFloat(pitcher.avg_spin_rate),
        chasePct: safeFloat(pitcher.chase_pct),
        stuffPlus: null
      };
    }
    const homeArsenalU = pitcherArsenalDataU[String(homePitcherId)];
    const awayArsenalU = pitcherArsenalDataU[String(awayPitcherId)];
    const homeAdvSavantU = advancedMetricsDataU[String(homePitcherId)];
    const awayAdvSavantU = advancedMetricsDataU[String(awayPitcherId)];
    if (homeArsenalU) {
      homeAdvPitching.fastballPct = homeArsenalU.fastballPct;
      homeAdvPitching.sliderPct = homeArsenalU.sliderPct;
      homeAdvPitching.curvePct = homeArsenalU.curvePct;
      homeAdvPitching.changeupPct = homeArsenalU.changeupPct;
      homeAdvPitching.splitterPct = homeArsenalU.splitterPct;
    }
    if (awayArsenalU) {
      awayAdvPitching.fastballPct = awayArsenalU.fastballPct;
      awayAdvPitching.sliderPct = awayArsenalU.sliderPct;
      awayAdvPitching.curvePct = awayArsenalU.curvePct;
      awayAdvPitching.changeupPct = awayArsenalU.changeupPct;
      awayAdvPitching.splitterPct = awayArsenalU.splitterPct;
    }
    if (homeAdvSavantU) {
      homeAdvPitching.pitcher_spin_rate = homeAdvSavantU.spinRate;
      homeAdvPitching.pitcher_o_swing_pct = homeAdvSavantU.chasePct;
      homeAdvPitching.pitcher_stuff_plus = homeAdvSavantU.stuffPlus;
    }
    if (awayAdvSavantU) {
      awayAdvPitching.pitcher_spin_rate = awayAdvSavantU.spinRate;
      awayAdvPitching.pitcher_o_swing_pct = awayAdvSavantU.chasePct;
      awayAdvPitching.pitcher_stuff_plus = awayAdvSavantU.stuffPlus;
    }
  } catch (arsenalErr) {
    console.warn(`[Python Scraper] Error al obtener arsenal/metricas para juego ${gameId2}:`, arsenalErr);
  }
  const homeLineupU = gameDataParsed.lineups?.home || [];
  const awayLineupU = gameDataParsed.lineups?.away || [];
  const homeLineupSavantU = calculateLineupSavantAverages(homeLineupU);
  const awayLineupSavantU = calculateLineupSavantAverages(awayLineupU);
  if (homeLineupSavantU.xwOba !== null) homeAdvOffense.xwOba = homeLineupSavantU.xwOba;
  if (awayLineupSavantU.xwOba !== null) awayAdvOffense.xwOba = awayLineupSavantU.xwOba;
  if (homeLineupSavantU.hardHitPct !== null) homeAdvOffense.hardHitPct = homeLineupSavantU.hardHitPct;
  if (awayLineupSavantU.hardHitPct !== null) awayAdvOffense.hardHitPct = awayLineupSavantU.hardHitPct;
  if (homeLineupSavantU.barrelPct !== null) homeAdvOffense.barrelPct = homeLineupSavantU.barrelPct;
  if (awayLineupSavantU.barrelPct !== null) awayAdvOffense.barrelPct = awayLineupSavantU.barrelPct;
  if (homeLineupSavantU.chasePct !== null) homeAdvOffense.chasePct = homeLineupSavantU.chasePct;
  if (awayLineupSavantU.chasePct !== null) awayAdvOffense.chasePct = awayLineupSavantU.chasePct;
  if (homeLineupSavantU.whiffPct !== null) {
    homeAdvOffense.projectedLineupWhiffPctVsHand = homeLineupSavantU.whiffPct;
    homeAdvOffense.contactPct = 100 - homeLineupSavantU.whiffPct;
    homeAdvOffense.projectedLineupContactPctVsHand = 100 - homeLineupSavantU.whiffPct;
  }
  homeAdvOffense.whiffPctVsFastball = homeLineupSavantU.whiffPctVsFastball;
  homeAdvOffense.whiffPctVsSlider = homeLineupSavantU.whiffPctVsSlider;
  homeAdvOffense.whiffPctVsCurve = homeLineupSavantU.whiffPctVsCurve;
  homeAdvOffense.whiffPctVsChangeup = homeLineupSavantU.whiffPctVsChangeup;
  homeAdvOffense.whiffPctVsSplitter = homeLineupSavantU.whiffPctVsSplitter;
  if (awayLineupSavantU.whiffPct !== null) {
    awayAdvOffense.projectedLineupWhiffPctVsHand = awayLineupSavantU.whiffPct;
    awayAdvOffense.contactPct = 100 - awayLineupSavantU.whiffPct;
    awayAdvOffense.projectedLineupContactPctVsHand = 100 - awayLineupSavantU.whiffPct;
  }
  awayAdvOffense.whiffPctVsFastball = awayLineupSavantU.whiffPctVsFastball;
  awayAdvOffense.whiffPctVsSlider = awayLineupSavantU.whiffPctVsSlider;
  awayAdvOffense.whiffPctVsCurve = awayLineupSavantU.whiffPctVsCurve;
  awayAdvOffense.whiffPctVsChangeup = awayLineupSavantU.whiffPctVsChangeup;
  awayAdvOffense.whiffPctVsSplitter = awayLineupSavantU.whiffPctVsSplitter;
  const homeCatcherU = homeLineupU.find((p) => p.position === "C");
  if (homeCatcherU) {
    homeAdvPitching.catcherName = homeCatcherU.name;
    const savantCatcher = savantCache.getCatcher(homeCatcherU.id ?? homeCatcherU.mlbId);
    if (savantCatcher && savantCatcher.framingRuns !== null) {
      homeAdvPitching.catcherFramingRuns = savantCatcher.framingRuns;
    }
  }
  const awayCatcherU = awayLineupU.find((p) => p.position === "C");
  if (awayCatcherU) {
    awayAdvPitching.catcherName = awayCatcherU.name;
    const savantCatcher = savantCache.getCatcher(awayCatcherU.id ?? awayCatcherU.mlbId);
    if (savantCatcher && savantCatcher.framingRuns !== null) {
      awayAdvPitching.catcherFramingRuns = savantCatcher.framingRuns;
    }
  }
  for (const p of homeLineupU) {
    const savant = savantCache.getBatter(p.id ?? p.mlbId);
    if (savant) {
      p.chase_pct = savant.chasePct;
      p.whiff_pct = savant.whiffPct;
      if (savant.whiffPct !== null) {
        const contactPct = roundNumber(100 - savant.whiffPct, 1);
        p.contact_pct_vs_rhp = contactPct;
        p.contact_pct_vs_lhp = contactPct;
      }
    }
  }
  for (const p of awayLineupU) {
    const savant = savantCache.getBatter(p.id ?? p.mlbId);
    if (savant) {
      p.chase_pct = savant.chasePct;
      p.whiff_pct = savant.whiffPct;
      if (savant.whiffPct !== null) {
        const contactPct = roundNumber(100 - savant.whiffPct, 1);
        p.contact_pct_vs_rhp = contactPct;
        p.contact_pct_vs_lhp = contactPct;
      }
    }
  }
  const homePitcherHand = realMLBData.pitchers?.home?.pitchHand || "R";
  const awayPitcherHand = realMLBData.pitchers?.away?.pitchHand || "R";
  homeAdvOffense.kPctVsPitchHand = awayPitcherHand === "L" ? homeSplits?.vsLhp?.kPct ?? 20 : homeSplits?.vsRhp?.kPct ?? 20;
  awayAdvOffense.kPctVsPitchHand = homePitcherHand === "L" ? awaySplits?.vsLhp?.kPct ?? 20 : awaySplits?.vsRhp?.kPct ?? 20;
  const getLineupVsHandProjection = (lineup, pitcherHand) => {
    if (!lineup.length) return { kPct: null, contactPct: null };
    const isLefty = pitcherHand === "L";
    const contactValues = lineup.map((p) => safeFloat(isLefty ? p.contact_pct_vs_lhp : p.contact_pct_vs_rhp)).filter((value) => value !== null && value > 0);
    const kPct = calculateOpponentLineupKPct(lineup, pitcherHand);
    return {
      kPct,
      contactPct: contactValues.length > 0 ? average(contactValues, 1) : null
    };
  };
  const homeLineupVsHand = getLineupVsHandProjection(homeLineupU, awayPitcherHand);
  const awayLineupVsHand = getLineupVsHandProjection(awayLineupU, homePitcherHand);
  homeAdvOffense.projectedLineupKPct = homeLineupVsHand.kPct;
  awayAdvOffense.projectedLineupKPct = awayLineupVsHand.kPct;
  if (homeLineupVsHand.contactPct !== null) homeAdvOffense.projectedLineupContactPctVsHand = homeLineupVsHand.contactPct;
  if (awayLineupVsHand.contactPct !== null) awayAdvOffense.projectedLineupContactPctVsHand = awayLineupVsHand.contactPct;
  Object.assign(homeAdvPitching, homeLast5Profile, homeLast3VsTeam);
  Object.assign(awayAdvPitching, awayLast5Profile, awayLast3VsTeam);
  homeAdvPitching.projectedPitchCount = calculateProjectedPitchCount(homeAdvPitching, fatigue.pitchers?.home);
  awayAdvPitching.projectedPitchCount = calculateProjectedPitchCount(awayAdvPitching, fatigue.pitchers?.away);
  homeAdvPitching.projectedInnings = calculateProjectedInnings(homeAdvPitching);
  awayAdvPitching.projectedInnings = calculateProjectedInnings(awayAdvPitching);
  homeAdvPitching.projectedStrikeoutsBase = calculateVortexProjectedKs(homeAdvPitching, awayAdvOffense, fatigue.pitchers?.home);
  awayAdvPitching.projectedStrikeoutsBase = calculateVortexProjectedKs(awayAdvPitching, homeAdvOffense, fatigue.pitchers?.away);
  gameDataParsed.advanced_pitching = {
    home: homeAdvPitching,
    away: awayAdvPitching,
    homeLast7,
    awayLast7,
    homeVsOpp,
    awayVsOpp
  };
  gameDataParsed.advanced_offense = { home: homeAdvOffense, away: awayAdvOffense };
  gameDataParsed.fatigue_metrics = fatigue;
  if (fatigue?.bullpen) {
    gameDataParsed.bullpen.home.ipLast3Days = fatigue.bullpen.home.ipLast3Days;
    gameDataParsed.bullpen.away.ipLast3Days = fatigue.bullpen.away.ipLast3Days;
    const getUsage = (ip3d) => {
      if (typeof ip3d !== "number") return "N/A";
      if (ip3d >= 8) return "Alta";
      if (ip3d >= 3) return "Moderada";
      return "Baja";
    };
    gameDataParsed.bullpen.home.usageLast3Days = getUsage(fatigue.bullpen.home.ipLast3Days);
    gameDataParsed.bullpen.away.usageLast3Days = getUsage(fatigue.bullpen.away.ipLast3Days);
  }
  const currentDB = readGamesDB();
  const existingGamesForDate = currentDB[actualDate] || [];
  const existingGame = existingGamesForDate.find((g) => String(g.id) === String(gameId2));
  if (existingGame && (historicalDate || !hasRealBettingLines2(gameDataParsed))) {
    if (preserveCapturedBettingData(gameDataParsed, existingGame)) {
      console.log(`[Persistencia] L\xEDneas y props capturados preservados para el juego ${gameId2} (Modo Single).`);
    }
  }
  const lineMovements = [...existingGame?.line_movements || []];
  const currentOdds = gameDataParsed.betting_lines;
  const newMovement = {
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    openingMoneylineHome: currentOdds.openingMoneylineHome,
    openingMoneylineAway: currentOdds.openingMoneylineAway,
    currentMoneylineHome: currentOdds.currentMoneylineHome,
    currentMoneylineAway: currentOdds.currentMoneylineAway,
    runLineHome: currentOdds.runLineHome,
    runLineHomeOdds: currentOdds.runLineHomeOdds,
    runLineAway: currentOdds.runLineAway,
    runLineAwayOdds: currentOdds.runLineAwayOdds,
    totalRuns: currentOdds.totalRuns,
    overOdds: currentOdds.overOdds,
    underOdds: currentOdds.underOdds
  };
  if (!historicalDate || lineMovements.length === 0) lineMovements.push(newMovement);
  gameDataParsed.line_movements = lineMovements;
  appendBettingSnapshotIfChanged(gameDataParsed, existingGame);
  gameDataParsed.model_features = calculateModelFeatures(gameDataParsed);
  const gameResult = await fetchGameResult(gameId2, currentOdds);
  if (gameResult) {
    gameDataParsed.game_result = gameResult;
  }
  const canUseActualKs = isFinalGameStatus2(gameDataParsed.game_result?.gameStatus);
  gameDataParsed.advanced_pitching.home.actualStrikeouts = canUseActualKs ? realMLBData.currentPitching?.home?.actualStrikeouts ?? null : null;
  gameDataParsed.advanced_pitching.away.actualStrikeouts = canUseActualKs ? realMLBData.currentPitching?.away?.actualStrikeouts ?? null : null;
  const errorsCollection = readErrorsDB();
  const validationResult = validateGamePayload(gameDataParsed, errorsCollection);
  enrichWithVortexMetrics(gameDataParsed);
  gameDataParsed.validation = {
    isValid: validationResult.isValid,
    errors: validationResult.errors,
    checkedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  gameDataParsed.timestamp = (/* @__PURE__ */ new Date()).toISOString();
  gameDataParsed.lastReverifyAttempt = gameDataParsed.timestamp;
  capturePregameSnapshot(gameDataParsed);
  saveGameData(gameId2, gameDataParsed).catch((fsErr) => {
    console.error(`Error saving to Firestore for game ${gameId2}:`, fsErr);
  });
  const updatedGames = existingGamesForDate.map(
    (g) => String(g.id) === String(gameId2) ? gameDataParsed : g
  );
  if (!existingGamesForDate.some((g) => String(g.id) === String(gameId2))) {
    updatedGames.push(gameDataParsed);
  }
  currentDB[actualDate] = updatedGames;
  writeGamesDB(currentDB);
  writeErrorsDB(errorsCollection);
  return gameDataParsed;
}
app2.post("/api/harvest-game", async (req, res) => {
  const { gameId: gameId2, date, refreshOdds } = req.body;
  if (!gameId2 || !date || typeof gameId2 !== "string" || typeof date !== "string") {
    res.status(400).json({ error: "gameId y date son requeridos" });
    return;
  }
  try {
    const updatedGame = await updateSingleGameData(gameId2, date, refreshOdds === true);
    res.json({ success: true, game: updatedGame });
  } catch (err) {
    console.error(`Error al actualizar juego individual ${gameId2}:`, err);
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
registerCronPipelineRoutes(app2, {
  port: PORT,
  readGamesDB,
  readPitLookups,
  generateBattersCSV,
  enrichGamesWithSavantBatterContact,
  enrichGamesWithTotalBasesProps,
  getNewYorkDateString
});
function startLiveGamesAutoupdater() {
  const INTERVAL_MS = 2 * 60 * 1e3;
  console.log(`[Auto-Updater] Iniciando programador de actualizaci\xF3n cada 2 minutos...`);
  setInterval(async () => {
    try {
      console.log(`[Auto-Updater] Ejecutando verificaci\xF3n de juegos en progreso para actualizaci\xF3n autom\xE1tica...`);
      const db2 = readGamesDB();
      const liveGamesToUpdate = [];
      for (const date of Object.keys(db2)) {
        const games = db2[date] || [];
        for (const game of games) {
          const status = game.game_result?.gameStatus || "";
          const isLive = status.includes("In Progress") || status.includes("Live") || status.includes("Delayed") || status.includes("Suspended");
          if (isLive) {
            liveGamesToUpdate.push({
              gameId: String(game.id),
              date: game.metadata?.date || date,
              label: `${game.metadata?.awayTeam} vs ${game.metadata?.homeTeam}`
            });
          }
        }
      }
      if (liveGamesToUpdate.length === 0) {
        console.log(`[Auto-Updater] No se encontraron juegos en progreso para actualizar.`);
        return;
      }
      console.log(`[Auto-Updater] Detectados ${liveGamesToUpdate.length} juego(s) en progreso. Iniciando actualizaci\xF3n secuencial...`);
      for (const item of liveGamesToUpdate) {
        try {
          console.log(`[Auto-Updater] Actualizando juego ${item.label} (ID: ${item.gameId}, Fecha: ${item.date})...`);
          await updateSingleGameData(item.gameId, item.date);
          console.log(`[Auto-Updater] \u2713 Juego ${item.label} actualizado exitosamente.`);
        } catch (err) {
          console.error(`[Auto-Updater] \u2717 Error al actualizar juego ${item.label}:`, err);
        }
      }
      console.log(`[Auto-Updater] Ciclo de actualizaci\xF3n completado.`);
    } catch (err) {
      console.error(`[Auto-Updater] Error en el ciclo del programador:`, err);
    }
  }, INTERVAL_MS);
}
async function runStartupFirestoreSync() {
  try {
    const localDB = readGamesDB();
    const isLocalEmpty = Object.keys(localDB).length === 0;
    if (isLocalEmpty) {
      console.log("[Restaurador Firestore] La base de datos local est\xE1 vac\xEDa. Restaurando solo la fecha m\xE1s reciente desde Firestore...");
      const games = await loadLatestGamesFromFirestore();
      if (games && games.length > 0) {
        mergeGamesIntoLocalDB(games);
        console.log(`[Restaurador Firestore] Fecha m\xE1s reciente restaurada exitosamente con ${games.length} juegos.`);
      } else {
        console.log("[Restaurador Firestore] No se encontraron juegos en Firestore o la colecci\xF3n est\xE1 vac\xEDa.");
      }
    }
  } catch (fsRestoreErr) {
    console.error("[Restaurador Firestore] Error general al intentar restaurar desde Firestore:", fsRestoreErr);
  }
  if (process.env.FULL_FIRESTORE_STARTUP_SYNC === "true") {
    try {
      await syncFirestoreToLocalDB("startup");
    } catch (fsSyncErr) {
      console.error("[Firestore Sync] Error general al sincronizar desde Firestore:", fsSyncErr);
    }
  }
}
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { default: tailwindcss } = await import("@tailwindcss/vite");
    const { default: react } = await import("@vitejs/plugin-react");
    const vite = await createViteServer({
      configFile: false,
      plugins: [react(), tailwindcss()],
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== "true",
        watch: process.env.DISABLE_HMR === "true" ? null : {
          ignored: [
            "**/mlb_*.json",
            "**/datastreak_*.json",
            "**/odds_*.json",
            "**/savant_*.json",
            "**/games_db*.json",
            "**/boxscore_*.json",
            "**/pitcher_stats_*.json",
            "**/offense_stats_*.json",
            "**/cache/**",
            "**/datasets/**",
            "**/*.csv",
            "**/server.mjs",
            "**/dev-server.log"
          ]
        }
      },
      appType: "spa"
    });
    app2.use(vite.middlewares);
  } else {
    const distPath = path6.join(process.cwd(), "dist");
    app2.use(express.static(distPath));
    app2.get("*", (req, res) => {
      res.sendFile(path6.join(distPath, "index.html"));
    });
  }
  app2.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    ensureAnonymousAuth().then((authed) => {
      console.log(`[Firebase] Autenticaci\xF3n an\xF3nima en arranque: ${authed ? "OK" : "Fallida"}`);
    }).catch(console.error);
    startLiveGamesAutoupdater();
    runStartupFirestoreSync().catch((err) => {
      console.error("[Firestore Sync] Error en sincronizaci\xF3n de arranque en segundo plano:", err);
    });
  });
}
startServer();
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
