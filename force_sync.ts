import { loadAllGamesFromFirestore } from "./src/services/firestoreService";
import fs from "fs";

async function doSync() {
  const firestoreGames = await loadAllGamesFromFirestore();
  const mergedDB = JSON.parse(fs.readFileSync("mlb_database.json", "utf-8"));
  let added = 0;
  for (const game of firestoreGames) {
    const date = game?.metadata?.date;
    const id = String(game?.id || game?.metadata?.id || "");
    if (!date || !id) continue;

    const dateGames = Array.isArray(mergedDB[date]) ? [...mergedDB[date]] : [];
    const existingIndex = dateGames.findIndex((g: any) => String(g?.id || g?.metadata?.id || "") === id);

    if (existingIndex === -1) {
      dateGames.push(game);
      added++;
    } else {
      dateGames[existingIndex] = game; // Force overwrite
    }

    mergedDB[date] = dateGames;
  }
  fs.writeFileSync("mlb_database.json", JSON.stringify(mergedDB, null, 2));
  console.log("Done! Added", added);
}

doSync();
