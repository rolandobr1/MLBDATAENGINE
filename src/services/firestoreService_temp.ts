export const getTotalGamesCountFromFirestore = async (): Promise<number> => {
  try {
    if (!db || !app) return 0;
    
    if (!authInitialized) {
      try {
        const auth = getAuth(app);
        await signInAnonymously(auth);
        authInitialized = true;
      } catch (e) {
        // Ignorar error de auth aqui, puede fallar si no esta activado.
      }
    }

    const snapshot = await getCountFromServer(collection(db, 'games'));
    return snapshot.data().count;
  } catch (error) {
    console.error("Error al contar juegos en Firestore:", error);
    return 0;
  }
};
