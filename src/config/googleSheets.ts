import { google } from 'googleapis';
import * as dotenv from 'dotenv';

dotenv.config();

// Se asume que las credenciales de la cuenta de servicio (Service Account) están en un archivo
// o cargadas por GOOGLE_APPLICATION_CREDENTIALS.
export const getSheetsClient = async () => {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const authClient = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: authClient as any });

  return sheets;
};
