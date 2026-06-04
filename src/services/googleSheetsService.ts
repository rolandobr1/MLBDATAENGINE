import { getSheetsClient } from '../config/googleSheets';

const SPREADSHEET_ID = process.env.SPREADSHEET_ID || 'TU_SPREADSHEET_ID_AQUI';

export const appendRowToMLSheet = async (rowData: any[]) => {
  try {
    const sheets = await getSheetsClient();
    
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'MLB_MASTER_DATA!A:Z', // Asume que la hoja se llama así
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [rowData]
      }
    });
    
    console.log('Successfully appended row to Google Sheets.');
  } catch (error) {
    console.error('Error appending row to Google Sheets:', error);
    throw error;
  }
};
