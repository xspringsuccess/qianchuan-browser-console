$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$node = Get-Command node.exe -ErrorAction SilentlyContinue
if ($node) { $nodePath = $node.Source } else { $nodePath = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' }
if (-not (Test-Path -LiteralPath $nodePath)) { Write-Host '未找到 Node.js 24。' -ForegroundColor Red; Read-Host '按回车退出'; exit 1 }
Set-Location -LiteralPath $root
& $nodePath (Join-Path $PSScriptRoot 'local-executor.mjs')
if ($LASTEXITCODE -ne 0) { Read-Host '执行器异常停止，按回车退出' }
