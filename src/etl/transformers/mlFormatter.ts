/**
 * ⚠️ ARCHIVADO / NO USADO EN PRODUCCIÓN (Fase 4, punto 3 del plan de mejora).
 *
 * Solo lo importa `src/workflow.ts` (también archivado). El export real de
 * CSV en producción usa `generateMLDatasetCSV`/`generateBattersCSV` en
 * `src/utils.ts`, no esta función. Nota: NO confundir con
 * `vortexMetrics.ts` (misma carpeta `transformers/`), que sí está vivo.
 *
 * Se deja en su lugar porque esta sesión no puede mover/eliminar archivos
 * en tu máquina — ver el mensaje de la Fase 4 para el comando manual.
 */
export const flattenGameForML = (gameDoc: any): any[] => {
  // Retorna un array ordenado que coincide con las columnas en Google Sheets
  // Columnas: date, game_id, home_team, away_team, home_pitcher, away_pitcher, home_pitcher_xERA, away_pitcher_xERA, open_home_ml, open_total
  
  const metadata = gameDoc.metadata || {};
  const pitchers = gameDoc.pitchers || {};
  const lines = gameDoc.betting_lines?.opening || {};
  const currentLines = gameDoc.betting_lines?.current || {};

  const advancedOffense = gameDoc.advanced_offense || {};
  const advancedPitching = gameDoc.advanced_pitching || {};
  const bullpen = gameDoc.bullpen || {};

  return [
    // --- METADATA Y APUESTAS (10 variables) ---
    metadata.date || '',
    metadata.game_id || '',
    metadata.home_team || '',
    metadata.away_team || '',
    pitchers.home_starter?.name || '',
    pitchers.away_starter?.name || '',
    pitchers.home_starter?.xERA || '',
    pitchers.away_starter?.xERA || '',
    lines.home_ml || currentLines.home_ml || '',
    lines.total || currentLines.total || '',
    
    // --- VORTEX V10.3 METRICS (Las 47 Variables) ---
    
    // 1-3. Metadatos del Lineup
    gameDoc.lineups?.lineup_confirmed ? 1 : 0,
    gameDoc.lineups?.lineup_source || '',
    gameDoc.lineups?.lineup_updated_at || '',

    // 4-11. Splits del Bateador vs LHP/RHP (Ejemplo Agregado Lineup Local)
    advancedOffense.home?.babip || '',
    advancedOffense.home?.hardHitPct || '',
    advancedOffense.home?.kPctVsPitchHand || '',
    advancedOffense.home?.projectedLineupContactPctVsHand || '',
    advancedOffense.home?.projectedLineupWhiffPctVsHand || '',
    advancedOffense.away?.babip || '',
    advancedOffense.away?.hardHitPct || '',
    advancedOffense.away?.kPctVsPitchHand || '',

    // 12-13. Matchup vs Pitcheo Principal
    advancedOffense.home?.whiffPctVsFastball || '',
    advancedOffense.away?.whiffPctVsFastball || '',

    // 14-19. Arsenal y Pitches del Pitcher
    advancedPitching.home?.pitcher_primary_pitch || pitchers.home_starter?.pitcher_primary_pitch || '',
    advancedPitching.home?.pitcher_primary_pitch_usage_pct || pitchers.home_starter?.pitcher_primary_pitch_usage_pct || '',
    advancedPitching.home?.pitcher_secondary_pitch || pitchers.home_starter?.pitcher_secondary_pitch || '',
    advancedPitching.home?.pitcher_secondary_pitch_usage_pct || pitchers.home_starter?.pitcher_secondary_pitch_usage_pct || '',
    advancedPitching.home?.pitcher_pitches_per_bf_last5 || pitchers.home_starter?.pitcher_pitches_per_bf_last5 || '',
    advancedPitching.home?.pitcher_pitches_per_ip_last5 || pitchers.home_starter?.pitcher_pitches_per_ip_last5 || '',

    // 20-25. Límites y Rol del Pitcher
    advancedPitching.home?.pitcher_avg_pitches_last3 || pitchers.home_starter?.pitcher_avg_pitches_last3 || '',
    advancedPitching.home?.pitcher_rest_status || pitchers.home_starter?.pitcher_rest_status || '',
    advancedPitching.away?.pitcher_avg_pitches_last3 || pitchers.away_starter?.pitcher_avg_pitches_last3 || '',
    advancedPitching.away?.pitcher_rest_status || pitchers.away_starter?.pitcher_rest_status || '',
    pitchers.home_starter?.pitchHand || pitchers.home?.pitchHand || '',
    pitchers.away_starter?.pitchHand || pitchers.away?.pitchHand || '',

    // 26-30. Detalles del Bullpen
    bullpen.home?.ipLast3Days || bullpen.home || '', // Compatibility with mock
    bullpen.home?.ipLast7Days || '',
    bullpen.away?.ipLast3Days || bullpen.away || '',
    bullpen.away?.ipLast7Days || '',
    bullpen.home?.relieversUsedYesterday || '',

    // 31-36. Scores Sintéticos del Lineup
    advancedOffense.home?.lineup_contact_stress_score || '',
    advancedOffense.home?.lineup_pitch_count_risk_score || '',
    advancedOffense.home?.lineup_high_hardhit_batters_count || '',
    advancedOffense.away?.lineup_contact_stress_score || '',
    advancedOffense.away?.lineup_pitch_count_risk_score || '',
    advancedOffense.away?.lineup_high_hardhit_batters_count || '',

    // 37-40. BvP (Batter vs Pitcher)
    advancedOffense.home?.projectedLineupKPct || '',
    advancedOffense.away?.projectedLineupKPct || '',
    advancedOffense.home?.wOba || '',
    advancedOffense.away?.wOba || '',

    // 41-43. Cambios Recientes (Hot Hand)
    pitchers.home_starter?.pitcher_recent_velocity || '',
    pitchers.away_starter?.pitcher_recent_velocity || '',
    pitchers.home_starter?.pitcher_csw_pct || '',
    pitchers.away_starter?.pitcher_csw_pct || '',

    // 44-47. Contexto de Juego
    gameDoc.weather?.temp || '',
    gameDoc.weather?.windSpeed || '',
    gameDoc.weather?.rainProbability || '',
    gameDoc.weather?.skyStatus || ''
  ];
};
