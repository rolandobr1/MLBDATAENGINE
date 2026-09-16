import { MLBGame, AdvancedPitchingStats, FatigueMetrics } from '../../types';

export const enrichWithVortexMetrics = (game: MLBGame): MLBGame => {
  if (game.advanced_pitching && game.fatigue_metrics) {
    // Enrich Home Pitcher
    if (game.advanced_pitching.home && game.fatigue_metrics.pitchers?.home) {
      enrichPitcherMetrics(game.advanced_pitching.home, game.fatigue_metrics.pitchers.home);
    }
    // Enrich Away Pitcher
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

const enrichPitcherMetrics = (
  pitchingStats: AdvancedPitchingStats, 
  fatigueStats: FatigueMetrics['pitchers']['home']
) => {
  // 18. Pitches per BF (last 5)
  if (pitchingStats.last5PitchCountAvg != null && pitchingStats.last5BfAvg != null && pitchingStats.last5BfAvg > 0) {
    pitchingStats.pitcher_pitches_per_bf_last5 = pitchingStats.last5PitchCountAvg / pitchingStats.last5BfAvg;
  }

  // 19. Pitches per IP (last 5)
  if (pitchingStats.last5PitchCountAvg != null && pitchingStats.last5IpAvg != null && pitchingStats.last5IpAvg > 0) {
    pitchingStats.pitcher_pitches_per_ip_last5 = pitchingStats.last5PitchCountAvg / pitchingStats.last5IpAvg;
  }

  // 22. Avg pitches last 3
  if (fatigueStats.pitchesLast3Starts != null) {
    // Suponiendo que pitchesLast3Starts es el total sumado, dividimos por 3.
    // Si fuera promedio, se coparía directamente.
    pitchingStats.pitcher_avg_pitches_last3 = fatigueStats.pitchesLast3Starts / 3;
  }

  // 25. Rest status
  if (fatigueStats.daysSinceLastStart != null) {
    const days = fatigueStats.daysSinceLastStart;
    if (days <= 4) pitchingStats.pitcher_rest_status = "Short Rest";
    else if (days === 5) pitchingStats.pitcher_rest_status = "Normal";
    else pitchingStats.pitcher_rest_status = "Extra Rest";
  }

  // 14-17. Primary and Secondary Pitch
  const arsenal = [
    { name: 'fastball', pct: pitchingStats.fastballPct || 0 },
    { name: 'slider', pct: pitchingStats.sliderPct || 0 },
    { name: 'curve', pct: pitchingStats.curvePct || 0 },
    { name: 'changeup', pct: pitchingStats.changeupPct || 0 },
    { name: 'splitter', pct: pitchingStats.splitterPct || 0 },
  ].sort((a, b) => b.pct - a.pct); // Orden descendente

  if (arsenal[0].pct > 0) {
    pitchingStats.pitcher_primary_pitch = arsenal[0].name;
    pitchingStats.pitcher_primary_pitch_usage_pct = arsenal[0].pct;
  }

  if (arsenal[1].pct > 0) {
    pitchingStats.pitcher_secondary_pitch = arsenal[1].name;
    pitchingStats.pitcher_secondary_pitch_usage_pct = arsenal[1].pct;
  }
};

const enrichLineupMetrics = (
  batters: any[],
  offenseStats: any
) => {
  let lineupContactStress = 0;
  let lineupPitchRisk = 0;
  let lowKCount = 0;
  let highBabipCount = 0;
  let highHardhitCount = 0;

  for (const batter of batters) {
    // Basic Contact Stress Formula (Mock)
    // Higher contact and lower K means more stress
    // Sept. 2026 — auditoría con el usuario (ronda 2): contact_pct_vs_rhp, kPct/strikeout_pct
    // y walk_pct del bateador vienen TODOS en escala 0-100 (ej. contact 78.5, K% 18.5, BB% 8.2)
    // — son el mismo patrón "Math.round((x/pa)*1000)/10" usado en server.ts. Este bloque los
    // trataba como fracciones 0-1 y volvía a multiplicar por 100, inflando batter_contact_stress_score
    // ~100x y lineup_pitch_count_risk_score ~100x cuando había dato real (los fallbacks sí estaban
    // en escala 0-1, así que sólo fallaba con datos reales, nunca en el caso default). babip
    // se deja igual: esa sí es una fracción 0-1 real (ver home/away_offense_babip).
    const contactFactor = batter.contact_pct_vs_rhp ?? 80;
    const kFactor = batter.kPct ?? batter.strikeout_pct ?? 20;
    const batterStress = contactFactor - kFactor;
    batter.batter_contact_stress_score = Math.max(0, batterStress);

    lineupContactStress += batter.batter_contact_stress_score;

    // Umbral ajustado a la misma escala 0-100 que kFactor (antes comparaba contra 0.18,
    // por lo que lineup_low_k_batters_count también daba siempre 0 con datos reales).
    if (kFactor < 18) lowKCount++;
    if ((batter.babip || 0) > 0.300) highBabipCount++;
    // Sept. 2026 — auditoría con el usuario: batter.hardHitPct viene de Baseball Savant
    // en escala 0-100 (ej. 42.3), no 0-1 — el umbral 0.40 nunca se cumplía. Además, hasta
    // este fix, hardHitPct nunca se copiaba al bateador individual en server.ts (solo
    // existía a nivel de equipo/pitcher agregado), así que el conteo daba siempre 0 por
    // partida doble: campo vacío + umbral en escala equivocada. Ver applyBatterSavantContact
    // en server.ts para el otro lado del fix.
    if ((batter.hardHitPct || 0) > 40) highHardhitCount++;

    // Pitch count risk: higher walk rate = higher risk (walk_pct ya viene en escala 0-100)
    const bbPct = batter.walk_pct ?? 8;
    lineupPitchRisk += bbPct;
  }

  if (batters.length > 0) {
    offenseStats.lineup_contact_stress_score = lineupContactStress / batters.length;
    offenseStats.lineup_pitch_count_risk_score = lineupPitchRisk / batters.length;
  }
  
  offenseStats.lineup_low_k_batters_count = lowKCount;
  offenseStats.lineup_high_babip_batters_count = highBabipCount;
  offenseStats.lineup_high_hardhit_batters_count = highHardhitCount;
};

