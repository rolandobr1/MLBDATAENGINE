function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * K% esperado del lineup rival contra la mano del pitcher, ponderado por las
 * apariciones al plato de temporada de cada bateador.
 */
export function calculateOpponentLineupKPct(lineup: any[], pitcherHand: string): number | null {
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
    const plateAppearances = rawPlateAppearances !== null && rawPlateAppearances > 0
      ? rawPlateAppearances
      : 50;

    weightedTotal += kPct * plateAppearances;
    totalPlateAppearances += plateAppearances;
  }

  return totalPlateAppearances > 0 ? weightedTotal / totalPlateAppearances : null;
}
