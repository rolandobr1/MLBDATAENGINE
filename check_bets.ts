import { getFirestore, collection, getDocs, doc } from "firebase/firestore";
import { app } from "./src/config/firebase.ts";

const db = getFirestore(app);

async function checkBets() {
  const bets15 = await getDocs(collection(db, "bets_2026-06-15"));
  console.log("Bets on 15th:", bets15.docs.length);
  bets15.docs.forEach(d => {
    console.log(d.id, d.data().gameId, d.data().subject);
  });
  
  const bets14 = await getDocs(collection(db, "bets_2026-06-14"));
  console.log("Bets on 14th:", bets14.docs.length);
  bets14.docs.forEach(d => {
    console.log(d.id, d.data().gameId, d.data().subject);
  });
}
checkBets();
