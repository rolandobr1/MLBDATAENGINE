export const flattenGameForML = (gameDoc: any): any[] => {
  // Retorna un array ordenado que coincide con las columnas en Google Sheets
  // Columnas: date, game_id, home_team, away_team, home_pitcher, away_pitcher, home_pitcher_xERA, away_pitcher_xERA, open_home_ml, open_total
  
  const metadata = gameDoc.metadata || {};
  const pitchers = gameDoc.pitchers || {};
  const lines = gameDoc.betting_lines?.opening || {};
  const currentLines = gameDoc.betting_lines?.current || {};

  return [
    metadata.date || '',
    metadata.game_id || '',
    metadata.home_team || '',
    metadata.away_team || '',
    pitchers.home_starter?.name || '',
    pitchers.away_starter?.name || '',
    pitchers.home_starter?.xERA || '',
    pitchers.away_starter?.xERA || '',
    lines.home_ml || currentLines.home_ml || '',
    lines.total || currentLines.total || ''
  ];
};
