# mover_codigo_muerto_a_archive.ps1
#
# Fase 4, punto 3 del plan de mejora — "archivar código muerto".
#
# La sesión de Claude que armó estos cambios no tiene forma de mover ni
# eliminar archivos directamente en tu máquina (solo puede escribir/
# sobrescribir). Por eso, en vez de moverlos, se le agregó a cada uno de
# estos 10 archivos un comentario "ARCHIVADO / NO USADO EN PRODUCCIÓN" al
# principio, explicando por qué está confirmado como código muerto
# (verificado con grep contra todo lo que realmente importa server.ts,
# el entrypoint real de la app).
#
# Este script es OPCIONAL: si querés separarlos físicamente del código
# vivo, corré esto una sola vez desde la carpeta raíz del proyecto
# (C:\Users\Rolando Valdez\Desktop\MLBDATAENGINE) con PowerShell:
#
#   .\mover_codigo_muerto_a_archive.ps1
#
# Esto los mueve a una carpeta nueva _archive\ (preservando su estructura
# de subcarpetas), y NO los borra del historial de git si usás git (queda
# el "mv" registrado como cambio normal). Si no querés moverlos, no pasa
# nada — el comentario en cada archivo ya deja bien claro que no se usan,
# y esbuild/tsc los siguen ignorando igual porque nada los importa.

$ErrorActionPreference = "Stop"

$archivos = @(
    "src\index.ts",
    "src\workflow.ts",
    "src\jobs\scheduler.ts",
    "src\etl\extractors\mlbApi.ts",
    "src\etl\extractors\oddsScraper.ts",
    "src\etl\extractors\fangraphsScraper.ts",
    "src\etl\extractors\mlbGameLogExtractor.ts",
    "src\etl\transformers\gameValidator.ts",
    "src\etl\transformers\mlFormatter.ts",
    "src\services\firestoreService_temp.ts"
)

$movidos = 0
$saltados = 0

foreach ($rel in $archivos) {
    $origen = Join-Path $PSScriptRoot $rel
    if (-not (Test-Path $origen)) {
        Write-Host "SALTADO (no existe): $rel" -ForegroundColor Yellow
        $saltados++
        continue
    }

    $destino = Join-Path (Join-Path $PSScriptRoot "_archive") $rel
    $destinoDir = Split-Path $destino -Parent
    if (-not (Test-Path $destinoDir)) {
        New-Item -ItemType Directory -Path $destinoDir -Force | Out-Null
    }

    Move-Item -Path $origen -Destination $destino -Force
    Write-Host "MOVIDO: $rel  ->  _archive\$rel" -ForegroundColor Green
    $movidos++
}

Write-Host ""
Write-Host "Listo. Movidos: $movidos, saltados: $saltados." -ForegroundColor Cyan
Write-Host "Recordatorio: ninguno de estos archivos lo importa server.ts (el entrypoint real)," -ForegroundColor Cyan
Write-Host "así que moverlos NO debería afectar 'npm run dev' ni 'npm run build'. Si algo se" -ForegroundColor Cyan
Write-Host "rompe, corré 'npx tsc --noEmit' para ver qué lo sigue importando." -ForegroundColor Cyan
