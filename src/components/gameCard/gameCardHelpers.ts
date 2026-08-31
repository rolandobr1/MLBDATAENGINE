/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Helpers puros de formateo/cálculo usados por GameCard y sus subcomponentes
 * (Fase 6, punto 1 del plan de mejora: dividir GameCard.tsx en piezas más chicas).
 *
 * Ninguna de estas funciones depende de estado de React ni del prop `game` —
 * reciben todo lo que necesitan por parámetro, así que se movieron tal cual
 * (mismo cuerpo, mismo comportamiento) desde adentro de GameCard.tsx a este
 * módulo compartido, para que cada tab pueda importarlas sin duplicar código
 * ni prop-drilling de funciones.
 */

export const getTrueKPercentage = (lineup: any[]) => {
  if (!lineup || lineup.length === 0) return "0.0";
  let totalPA = 0;
  let totalSO = 0;
  for (const p of lineup) {
    const pa = p.pa || 0;
    if (pa > 0) {
      totalPA += pa;
      totalSO += ((p.strikeout_pct ?? p.kPct ?? 0) / 100) * pa;
    }
  }
  if (totalPA === 0) {
    return (lineup.reduce((sum, p) => sum + (p.strikeout_pct ?? p.kPct ?? 0), 0) / lineup.length).toFixed(1);
  }
  return ((totalSO / totalPA) * 100).toFixed(1);
};

export const calcKMinusBb = (k: any, bb: any) => {
  if (!k || !bb || k === "-" || bb === "-") return "-";
  const kNum = parseFloat(String(k).replace("%", ""));
  const bbNum = parseFloat(String(bb).replace("%", ""));
  if (isNaN(kNum) || isNaN(bbNum)) return "-";
  return (kNum - bbNum).toFixed(1) + "%";
};

export const formatOdds = (value: number | null | undefined) => {
  if (value === null || value === undefined) return "N/D";
  if (value > 1 && value < 20) return value.toFixed(2);
  if (value > 0) return (1 + value / 100).toFixed(2);
  if (value < 0) return (1 + 100 / Math.abs(value)).toFixed(2);
  return "N/D";
};

export const inningsToDecimal = (ip: string | number | undefined) => {
  const raw = String(ip ?? "0.0");
  const [wholeRaw, outsRaw = "0"] = raw.split(".");
  const whole = parseInt(wholeRaw, 10) || 0;
  const outs = Math.min(parseInt(outsRaw, 10) || 0, 2);
  return whole + outs / 3;
};

export const formatKPerIp = (pitcher: any) => {
  const strikeouts = Number(pitcher.totalStrikeouts);
  const ip = inningsToDecimal(pitcher.ip);
  if (!Number.isFinite(strikeouts) || ip <= 0) return "N/D";
  return (strikeouts / ip).toFixed(2);
};

export const formatPitcherValue = (value: any) => {
  if (value === null || value === undefined || value === "") return "N/D";
  return value;
};

export const formatNumber = (value: any, decimals = 1, suffix = "") => {
  if (value === null || value === undefined || value === "" || value === "N/A") return "N/D";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return `${value}${suffix}`;
  return `${numeric.toFixed(decimals).replace(/\.0$/, "")}${suffix}`;
};

export const formatPct = (value: any) => formatNumber(value, 1, "%");

export const getPitcherRoleLabel = (bfPerStart: any, projectedPitches: any) => {
  const bf = Number(bfPerStart);
  const projected = Number(projectedPitches);
  if ((Number.isFinite(bf) && bf < 15) || (Number.isFinite(projected) && projected < 55)) return "Short role / Opener";
  if (Number.isFinite(bf) && bf < 18) return "Limited starter";
  if (Number.isFinite(bf) && bf < 21) return "Low volume starter";
  if (Number.isFinite(bf) && bf < 24) return "Normal starter";
  if (Number.isFinite(bf)) return "High volume starter";
  return "N/D";
};

export const getUsageTooltip = (usage: string) => {
  if (usage === "Alta") return "Alta fatiga. Relevistas principales muy utilizados recientemente.";
  if (usage === "Moderada") return "Fatiga moderada. Uso intermedio del bullpen clave.";
  return "Baja fatiga. Bullpen descansado.";
};

export const getUsageBadgeClass = (usage: string) => {
  if (usage === "Alta") return "bg-red-100 text-red-800";
  if (usage === "Moderada") return "bg-amber-100 text-amber-800";
  return "bg-emerald-100 text-emerald-800";
};

export const sumIP = (pitchers: any[]) => {
  let totalOuts = 0;
  pitchers.forEach(p => {
    const ipStr = String(p.ip || "0.0");
    const parts = ipStr.split('.');
    const innings = parseInt(parts[0], 10) || 0;
    const outs = parts.length > 1 ? parseInt(parts[1], 10) || 0 : 0;
    totalOuts += innings * 3 + outs;
  });
  const totalInnings = Math.floor(totalOuts / 3);
  const remainingOuts = totalOuts % 3;
  return `${totalInnings}.${remainingOuts}`;
};

export const getBattersTotals = (batters: any[]) => {
  let ab = 0, r = 0, h = 0, rbi = 0, bb = 0, k = 0;
  batters.forEach(p => {
    ab += parseInt(p.ab, 10) || 0;
    r += parseInt(p.r, 10) || 0;
    h += parseInt(p.h, 10) || 0;
    rbi += parseInt(p.rbi, 10) || 0;
    bb += parseInt(p.bb, 10) || 0;
    k += parseInt(p.k, 10) || 0;
  });
  return { ab, r, h, rbi, bb, k };
};

export const getPitchersTotals = (pitchers: any[]) => {
  let h = 0, r = 0, er = 0, bb = 0, k = 0;
  pitchers.forEach(p => {
    h += parseInt(p.h, 10) || 0;
    r += parseInt(p.r, 10) || 0;
    er += parseInt(p.er, 10) || 0;
    bb += parseInt(p.bb, 10) || 0;
    k += parseInt(p.k, 10) || 0;
  });
  return { ip: sumIP(pitchers), h, r, er, bb, k };
};

/**
 * No se llama desde ningún lado hoy (ya estaba sin uso dentro de GameCard.tsx
 * antes de esta división) — se conserva tal cual para no cambiar comportamiento,
 * solo parametrizada con el timestamp en vez de cerrar sobre `game.timestamp`.
 */
export const formatLastUpdate = (timestamp: string | number | Date | null | undefined) => {
  if (!timestamp) return "";
  try {
    const date = new Date(timestamp);
    return `${date.toLocaleTimeString("es-MX", {
      timeZone: "America/Santo_Domingo",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    })} RD`;
  } catch {
    return "";
  }
};

export const formatFloat = (val: any, decimals: number = 2) => {
  return typeof val === 'number' ? val.toFixed(decimals) : 'N/D';
};
