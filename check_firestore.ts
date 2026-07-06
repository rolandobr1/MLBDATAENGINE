import { db } from "./src/services/firestoreService";
async function check() {
  const snapshot = await db.collection("mlb_games_2026").where("date", "==", "2026-07-04").get();
  console.log(`Found ${snapshot.size} games for 2026-07-04`);
  snapshot.forEach(doc => {
    const data = doc.data();
    console.log(data.teams?.away?.team?.name, "@", data.teams?.home?.team?.name, "Odds:", data.betting);
  });
  process.exit(0);
}
check();
