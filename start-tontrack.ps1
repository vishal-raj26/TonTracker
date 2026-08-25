$ErrorActionPreference = "Stop"

$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$nodePath = "C:\Program Files\nodejs\node.exe"
$launcher = Join-Path $projectDir "scripts\start-active-local.js"

if (-not (Test-Path -LiteralPath $nodePath)) {
  throw "Node.js was not found at $nodePath"
}

# The active launcher owns port 5177 and replaces any stale TonTrack listener.
& $nodePath $launcher
if ($LASTEXITCODE -ne 0) {
  throw "The active TonTrack server launcher failed with exit code $LASTEXITCODE"
}
