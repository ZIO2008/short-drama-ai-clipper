[CmdletBinding()]
param(
  [string]$ProjectDir,
  [string]$ShareRoot,
  [switch]$SkipPack
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($ProjectDir)) {
  $ProjectDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
}
$project = (Resolve-Path -LiteralPath $ProjectDir).Path
if ([string]::IsNullOrWhiteSpace($ShareRoot)) {
  $ShareRoot = (Resolve-Path (Join-Path $project '..\..\..\vm-share')).Path
}
$releaseId = Get-Date -Format 'yyyyMMdd-HHmmss'
$packageDir = Join-Path $project 'release\win-unpacked'
$exeName = $null
$sourceExe = Join-Path $packageDir $exeName
$sourceFfmpeg = Join-Path $packageDir 'resources\models\ffmpeg.exe'
$sourceFfprobe = Join-Path $packageDir 'resources\models\ffprobe.exe'
$stagedDir = Join-Path $ShareRoot "releases\$releaseId"
$evidenceDir = Join-Path $ShareRoot 'evidence'
$manifestPath = Join-Path $evidenceDir "$releaseId.json"

New-Item -ItemType Directory -Path $ShareRoot -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $ShareRoot 'releases') -Force | Out-Null
New-Item -ItemType Directory -Path $evidenceDir -Force | Out-Null

if (-not $SkipPack) {
  Push-Location $project
  try {
    pnpm run pack:dir
    if ($LASTEXITCODE -ne 0) { throw "pnpm run pack:dir failed with exit code $LASTEXITCODE" }
  } finally {
    Pop-Location
  }
}

$exeItem = Get-ChildItem -LiteralPath $packageDir -File -Filter '*.exe' | Select-Object -First 1
if (-not $exeItem) { throw "Packaged executable is missing in $packageDir" }
$exeName = $exeItem.Name
$sourceExe = Join-Path $packageDir $exeName

foreach ($required in @($sourceExe, $sourceFfmpeg, $sourceFfprobe)) {
  if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
    throw "Required package file is missing: $required"
  }
}

New-Item -ItemType Directory -Path $stagedDir -Force | Out-Null
Copy-Item -Path (Join-Path $packageDir '*') -Destination $stagedDir -Recurse -Force

$stagedExe = Join-Path $stagedDir $exeName
$stagedFfmpeg = Join-Path $stagedDir 'resources\models\ffmpeg.exe'
$stagedFfprobe = Join-Path $stagedDir 'resources\models\ffprobe.exe'
$diagnosticLauncher = Join-Path $stagedDir 'launch-diagnostic.cmd'
$diagnosticContent = @'
@echo off
setlocal EnableExtensions EnableDelayedExpansion
set "ERRORLEVEL="
set "ROOT=%~dp0"
set "RELEASE_ID=__RELEASE_ID__"
set "TARGET=%LOCALAPPDATA%\ShortDramaMaterialStudio\vm-releases\%RELEASE_ID%"
for %%F in (copy.log copy-exit-code.txt stdout.log electron.log exit-code.txt local-package.txt) do del /q "%ROOT%%%F" >nul 2>&1
mkdir "%TARGET%" >nul 2>&1
robocopy "%ROOT%." "%TARGET%" /E /R:1 /W:1 /NFL /NDL /NJH /NJS /NP > "%ROOT%copy.log"
if errorlevel 8 (
  echo Copy to local NTFS failed. See copy.log.
  echo CopyExitCode=!ERRORLEVEL!> "%ROOT%copy-exit-code.txt"
  pause
  exit /b 3
)
set "SHORTDRAMA_MATERIAL_E2E=1"
set "SHORTDRAMA_MATERIAL_CHANNEL=vm-diagnostic-%RELEASE_ID%"
set "SHORTDRAMA_MATERIAL_USER_DATA=%LOCALAPPDATA%\ShortDramaMaterialStudio\vm-userdata\%RELEASE_ID%"
set "ELECTRON_ENABLE_LOGGING=1"
set "ELECTRON_ENABLE_STACK_DUMPING=1"
set "APP="
for /f "delims=" %%E in ('dir /b /a-d "%TARGET%\*.exe" 2^>nul') do if not defined APP set "APP=%TARGET%\%%E"
if not defined APP (
  echo No packaged executable found.
  pause
  exit /b 2
)
"%APP%" --no-sandbox --disable-gpu --disable-gpu-compositing --in-process-gpu --use-gl=swiftshader --use-angle=swiftshader --enable-logging=stderr --log-file="%ROOT%electron.log" > "%ROOT%stdout.log" 2>&1
echo ExitCode=!ERRORLEVEL!> "%ROOT%exit-code.txt"
echo LocalPackage=%TARGET%> "%ROOT%local-package.txt"
echo Diagnostic files: electron.log, stdout.log, exit-code.txt, vm-userdata
pause
'@
[IO.File]::WriteAllText($diagnosticLauncher, $diagnosticContent.TrimStart(), [Text.Encoding]::ASCII)
$manifest = [ordered]@{
  releaseId = $releaseId
  generatedAt = (Get-Date).ToString('o')
  sourcePackage = $packageDir
  stagedPackage = $stagedDir
  guestPackage = "Z:\releases\$releaseId"
  executable = $stagedExe
  executableSha256 = (Get-FileHash -LiteralPath $stagedExe -Algorithm SHA256).Hash
  ffmpegSha256 = (Get-FileHash -LiteralPath $stagedFfmpeg -Algorithm SHA256).Hash
  ffprobeSha256 = (Get-FileHash -LiteralPath $stagedFfprobe -Algorithm SHA256).Hash
  ffmpegPresent = (Test-Path -LiteralPath $stagedFfmpeg -PathType Leaf)
  ffprobePresent = (Test-Path -LiteralPath $stagedFfprobe -PathType Leaf)
  diagnosticLauncher = $diagnosticLauncher
  nextStep = 'Run launch-diagnostic.cmd from Z:\releases\<releaseId>; it copies the package to local NTFS before launch and writes copy.log, electron.log, stdout.log, exit-code.txt, and local-package.txt beside the staged package.'
}
$json = $manifest | ConvertTo-Json -Depth 4
[IO.File]::WriteAllText($manifestPath, $json, [Text.UTF8Encoding]::new($false))

$diagnosticContent = $diagnosticContent.Replace('__RELEASE_ID__', $releaseId)
[IO.File]::WriteAllText($diagnosticLauncher, $diagnosticContent.TrimStart(), [Text.Encoding]::ASCII)

[pscustomobject]$manifest | Format-List
Write-Host "Evidence manifest: $manifestPath"
