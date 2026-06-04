import { db } from '../config/firebase';
import { doc, collection, setDoc } from 'firebase/firestore';

export const saveGameData = async (gameId: string, gameData: any) => {
  try {
    if (!db) {
      console.warn("Firestore db is not initialized. Skipping Firestore save.");
      return;
    }

    const now = new Date().toISOString();
    const dataWithTimestamp = { ...gameData, timestamp: now };

    // Set with merge: true to avoid overwriting fields not provided in this update
    const gameRef = doc(collection(db, 'games'), gameId);
    await setDoc(gameRef, dataWithTimestamp, { merge: true });

    // Save subcollections
    if (gameData.weather) {
      const weatherRef = doc(collection(gameRef, 'weather'), 'current');
      await setDoc(weatherRef, gameData.weather);
    }
    if (gameData.line_movements && gameData.line_movements.length > 0) {
      const lastLine = gameData.line_movements[gameData.line_movements.length - 1];
      if (lastLine) {
        const lineId = lastLine.timestamp ? String(lastLine.timestamp).replace(/[:.]/g, '-') : String(Date.now());
        const lineRef = doc(collection(gameRef, 'line_movements'), lineId);
        await setDoc(lineRef, lastLine);
      }
    }
    if (gameData.offensive_splits) {
      const splitsRef = doc(collection(gameRef, 'offensive_splits'), 'current');
      await setDoc(splitsRef, gameData.offensive_splits);
    }
    if (gameData.fatigue_metrics) {
      const fatigueRef = doc(collection(gameRef, 'fatigue_metrics'), 'current');
      await setDoc(fatigueRef, gameData.fatigue_metrics);
    }
    if (gameData.advanced_pitching) {
      const advPitchingRef = doc(collection(gameRef, 'advanced_pitching'), 'current');
      await setDoc(advPitchingRef, gameData.advanced_pitching);
    }
    if (gameData.advanced_offense) {
      const advOffenseRef = doc(collection(gameRef, 'advanced_offense'), 'current');
      await setDoc(advOffenseRef, gameData.advanced_offense);
    }
    if (gameData.model_features) {
      const featuresRef = doc(collection(gameRef, 'model_features'), 'current');
      await setDoc(featuresRef, gameData.model_features);
    }
    if (gameData.game_result) {
      const resultRef = doc(collection(gameRef, 'game_result'), 'current');
      await setDoc(resultRef, gameData.game_result);
    }

    // Save historical snapshot
    const snapshotRef = doc(collection(gameRef, 'snapshots'), now);
    await setDoc(snapshotRef, dataWithTimestamp);

    console.log(`Successfully saved game ${gameId} and snapshot to Firestore.`);
  } catch (error) {
    console.error(`Error saving game ${gameId} to Firestore:`, error);
    throw error;
  }
};

