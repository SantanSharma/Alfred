# Undo integrations; preserve source skills and all personal/workspace memory.
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

node bin/remove-memory-hooks.js
if ($LASTEXITCODE -ne 0) { throw 'Hook cleanup failed; stopping before removing generated files.' }

$pluginRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'plugin'))
$skillRoot = Join-Path $env:USERPROFILE '.agents/skills'
$links = @(
  (Join-Path $env:USERPROFILE '.claude/skills/alfred'),
  (Join-Path $env:USERPROFILE '.copilot/installed-plugins/alfred/alfred')
)
if (Test-Path -LiteralPath $skillRoot) {
  $links += @(Get-ChildItem -LiteralPath $skillRoot -Filter 'alfred-*' -Force | ForEach-Object { $_.FullName })
}
foreach ($linkPath in $links) {
  $item = Get-Item -LiteralPath $linkPath -Force -ErrorAction SilentlyContinue
  if (!$item) { continue }
  if (!($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    Write-Output "Left alone: $linkPath (not a link)"
    continue
  }
  $targetValue = [string]@($item.Target)[0]
  if (![IO.Path]::IsPathRooted($targetValue)) { $targetValue = Join-Path $item.Parent.FullName $targetValue }
  $targetPath = [IO.Path]::GetFullPath($targetValue)
  if ($targetPath -eq $pluginRoot -or $targetPath.StartsWith($pluginRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    [IO.Directory]::Delete($item.FullName, $false)
    Write-Output "Removed link: $linkPath"
  } else { Write-Output "Left alone: $linkPath (points outside this installation)" }
}

if (Get-Command copilot -ErrorAction SilentlyContinue) { copilot plugin marketplace remove alfred }
npm uninstall -g alfred-cli

foreach ($relative in @('plugin', 'logs', 'config/skills-index.json')) {
  $generatedPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot $relative))
  $workspacePrefix = [IO.Path]::GetFullPath($PSScriptRoot) + [IO.Path]::DirectorySeparatorChar
  if (!$generatedPath.StartsWith($workspacePrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe generated path' }
  if (Test-Path -LiteralPath $generatedPath) {
    if ((Get-Item -LiteralPath $generatedPath -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Refusing linked generated path: $generatedPath" }
    Remove-Item -LiteralPath $generatedPath -Recurse -Force
  }
}
