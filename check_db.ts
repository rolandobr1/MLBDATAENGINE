import { getFirestore, collection, getDocs, query, where } from "firebase/firestore";
import { app } from "./src/config/firebase.ts";

const db = getFirestore(app);

async function check14th() {
  const snapshot = await getDocs(query(collection(db, "games")));
  const games = snapshot.docs.map(d => d.data());
  const dates = new Set(games.map(g => g.metadata?.date));
  console.log("All dates in Firestore:", Array.from(dates));
  
  const g14 = games.filter(g => g.metadata?.date === "2026-06-14");
  console.log("Games on 14th:", g14.length);
  
  // Try looking for Eovaldi, Grayson, etc
  const withEovaldi = games.filter(g => JSON.stringify(g).includes("Eovaldi"));
  console.log("Games with Eovaldi:", withEovaldi.map(g => `${g.id} - ${g.metadata?.date} - ${g.game_result?.gameStatus}`));
}
check14th();
