import { saveGameData } from './src/services/firestoreService';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function test() {
  const dummyGame = {
    id: "test_123",
    metadata: { id: "test_123", date: "2026-06-12", time: "12:00 PM" },
    teams: { home: "Home", away: "Away" },
    pitchers: { home: {}, away: {} },
    bullpen: { home: {}, away: {} },
    offense: { home: {}, away: {} },
    trends: { home: {}, away: {} },
    betting_lines: { openingMoneylineHome: -110 },
    timestamp: new Date().toISOString()
  };

  try {
    console.log("Saving to Firestore...");
    await saveGameData("test_123", dummyGame);
    console.log("Success!");
  } catch (err) {
    console.error("Failed:", err);
  }
  process.exit(0);
}
test();
