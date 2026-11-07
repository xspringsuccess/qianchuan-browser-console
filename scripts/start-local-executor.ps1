$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$node = Get-Command node.exe -ErrorAction SilentlyContinue
if ($node) { $nodePath = $node.Source } else { $nodePath = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' }
if (-not (Test-Path -LiteralPath $nodePath)) { throw '未找到 Node.js 24。' }
Set-Location -LiteralPath $root
& $nodePath (Join-Path $PSScriptRoot 'local-executor.mjs')
exit $LASTEXITCODE
