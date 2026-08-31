# Auditoría experimental de reconstrucción histórica K-Lab

## Alcance

Auditoría local, sin entrenamiento, sin Firestore, sin matching por nombre y sin modificación del dataset oficial. Toda historia aceptada satisface `history_date < target_date`, `history_game_id != target_game_id` y, cuando existe timestamp del registro final, `history_record_timestamp < target_start`.

## Fórmula actual

- `last3Ks1/2/3`, `last3Ip1/2/3`, `last3Bf1/2/3`: valores individuales de las tres aperturas previas más recientes, orden descendente. No son suma ni promedio.
- `last5KsAvg`: media de K de hasta cinco aperturas previas, redondeada a 2 decimales.
- `last5KsStd`: desviación poblacional de K, redondeada a 2 decimales.
- `last5IpAvg`: media de IP convertida desde outs, redondeada a 1 decimal.
- `last5BfAvg`: media de BF positivos, cap de cordura <=40.
- `last5PitchCountAvg`: media de pitcheos positivos, redondeada, cap <=130.
- `pitchesLast3Starts`: suma de pitcheos de hasta tres apariciones anteriores.

## Fuentes locales

`mlb_database.json` contiene 2,182 juegos finalizados en el rango y 4,159 filas pitcher-juego con `playerId`, K, IP, BF y pitcheos completos.

## Cobertura estructural

- Pitcher-juego: 4,159
- Juegos: 2,079
- Pitchers únicos: 445
- HOME/AWAY: 2,080/2,079
- Con 3 anteriores: 53 (1.27%)
- Con 5 anteriores: 1 (0.02%)
- Con 10 anteriores: 0 (0.0%)
- Profundidad media: 9.35 juegos por pitcher

Usando solamente `Final + history_date < target_date`, sin afirmar que el timestamp local sea `game_end`: last3 3,101 (74.56%), last5 2,614 (62.85%), last10 1,655 (39.79%). Esta segunda cifra tiene evidencia temporal más débil.

## Comparación destacada

Para `last3Ks1`: 530 comparables; 110 coincidencias exactas (20.75%); diferencia absoluta media 2.3132; máxima 11.0; correlación 0.2055.

Las diferencias pueden proceder de que el código actual consulta MLB gameLog, filtra aperturas mediante `gamesStarted` y cae a cualquier aparición sólo cuando no hay aperturas, mientras el archivo local conserva únicamente el abridor resumido de cada lado. También puede haber diferencias de corte temporal, backfills o actualización del snapshot.

## Riesgo metodológico principal

La cobertura de 4,159 usa el `playerId` del boxscore final del propio juego objetivo para saber quién abrió. Eso permite auditar la reconstrucción matemática, pero constituye identidad retrospectiva y no convierte automáticamente esas filas en observaciones pregame aptas para entrenamiento. Sin una fuente independiente de identidad del target disponible antes del juego, la cobertura defendible sigue siendo 265.

## Decisión

### VIABLE

- Reconstruir last3 K/IP/BF, last5 K/IP/BF/pitches, carga reciente y descanso cuando existe identidad pregame estable.

### VIABLE CON CONDICIONES

- Reconstruir agregados season-to-date y proyecciones sólo con definiciones de ventana y cortes temporales congelados.
- Usar la cobertura estructural para estudiar fórmulas, no como dataset de entrenamiento automático.

### NO VIABLE DESDE BOXSCORES BÁSICOS

- SwStr%, CSW%, xFIP, SIERA, xERA, lineup pregame, clima, park factor exacto y xwOBA exacto.

### RECOMENDACIÓN

Conservar las 265 filas oficiales. Validar primero una fuente pregame independiente para la identidad del pitcher objetivo. Después, reconstruir rolling features desde boxscores previos por ID y volver a auditar coincidencias; no reemplazar todavía las features almacenadas.
