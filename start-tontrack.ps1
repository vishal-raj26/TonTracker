$ErrorActionPreference = "Stop"

$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$nodePath = "C:\Program Files\nodejs\node.exe"
$port = 5177

$listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($listener) {
  exit 0
}

if (-not (Test-Path -LiteralPath $nodePath)) {
  throw "Node.js was not found at $nodePath"
}

Start-Process `
  -FilePath $nodePath `
  -ArgumentList "server.js" `
  -WorkingDirectory $projectDir `
  -WindowStyle Hidden `
  -RedirectStandardOutput (Join-Path $projectDir "server.out.log") `
  -RedirectStandardError (Join-Path $projectDir "server.err.log")
