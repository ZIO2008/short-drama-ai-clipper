$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$localOcrRoot = Join-Path $projectRoot 'tools\local-ocr'
$pyInstaller = if ($env:SHORTDRAMA_LOCAL_OCR_PYINSTALLER) { $env:SHORTDRAMA_LOCAL_OCR_PYINSTALLER } else { Join-Path $localOcrRoot '.venv\Scripts\pyinstaller.exe' }
$runnerSource = Join-Path $localOcrRoot 'temporal_ocr_runner.py'
$modelCache = Join-Path $localOcrRoot 'model-cache'
$buildRoot = Join-Path $localOcrRoot '.runner-build'
$outputRoot = Join-Path $localOcrRoot 'runtime'
$distRoot = Join-Path $buildRoot 'dist'
$builtRunner = Join-Path $distRoot 'temporal_ocr_runner'
$builtExecutable = Join-Path $builtRunner 'temporal_ocr_runner.exe'
$builtModel = Join-Path $builtRunner '_internal\model-cache\official_models\PP-OCRv5_server_det\inference.pdiparams'
$buildId = [Guid]::NewGuid().ToString('N')
$stagingRoot = Join-Path $localOcrRoot ".runtime-staging-$buildId"
$backupRoot = Join-Path $localOcrRoot ".runtime-backup-$buildId"

if (!(Test-Path -LiteralPath $pyInstaller -PathType Leaf)) { throw "PyInstaller is required: $pyInstaller" }
if (!(Test-Path -LiteralPath $runnerSource -PathType Leaf)) { throw "OCR runner source does not exist: $runnerSource" }
if (!(Test-Path -LiteralPath $modelCache -PathType Container)) { throw "OCR model cache does not exist: $modelCache" }

Remove-Item -LiteralPath $buildRoot -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $buildRoot -Force | Out-Null
$env:PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK = 'True'

& $pyInstaller --noconfirm --clean --onedir --name temporal_ocr_runner --distpath $distRoot --workpath (Join-Path $buildRoot 'work') --specpath (Join-Path $buildRoot 'spec') --add-data "$modelCache;model-cache" --collect-binaries paddle --collect-data paddle --collect-binaries paddleocr --collect-data paddleocr --collect-binaries paddlex --collect-data paddlex --copy-metadata pypdfium2 --copy-metadata opencv-contrib-python --copy-metadata pyclipper --copy-metadata python-bidi $runnerSource
$pyInstallerExitCode = $LASTEXITCODE

if (!(Test-Path -LiteralPath $builtExecutable -PathType Leaf) -or !(Test-Path -LiteralPath $builtModel -PathType Leaf)) {
  throw "Self-contained OCR runner is incomplete after PyInstaller build (exit $pyInstallerExitCode)."
}
if ($pyInstallerExitCode -ne 0 -and $pyInstallerExitCode -ne 3221226505) { throw "PyInstaller failed with exit code $pyInstallerExitCode." }

Copy-Item -LiteralPath $builtRunner -Destination $stagingRoot -Recurse -Force
& (Join-Path $stagingRoot 'temporal_ocr_runner.exe') --self-test
if ($LASTEXITCODE -ne 0) { throw 'Self-contained OCR runner Paddle self-test failed.' }
if ($pyInstallerExitCode -eq 3221226505) { Write-Warning 'PyInstaller emitted the known Paddle teardown code after a verified runner build.' }

try {
  if (Test-Path -LiteralPath $outputRoot) { Move-Item -LiteralPath $outputRoot -Destination $backupRoot -ErrorAction Stop }
  Move-Item -LiteralPath $stagingRoot -Destination $outputRoot -ErrorAction Stop
} catch {
  if (!(Test-Path -LiteralPath $outputRoot) -and (Test-Path -LiteralPath $backupRoot)) { Move-Item -LiteralPath $backupRoot -Destination $outputRoot -ErrorAction Stop }
  throw
} finally {
  Remove-Item -LiteralPath $buildRoot -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $stagingRoot -Recurse -Force -ErrorAction SilentlyContinue
}
Remove-Item -LiteralPath $backupRoot -Recurse -Force -ErrorAction SilentlyContinue
Write-Output "LOCAL_OCR_RUNNER=$outputRoot"
