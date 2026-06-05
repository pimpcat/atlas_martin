# Copia los PNG del chat (Cursor assets) a assets/logos del atlas
$src = Join-Path $PSScriptRoot "..\..\..\..\Users\victor.jorge\.cursor\projects\c-ms4w-Apache-htdocs-atlasgro\assets"
$dst = Join-Path $PSScriptRoot "..\assets\logos"
if (-not (Test-Path $src)) {
  $src = "C:\Users\victor.jorge\.cursor\projects\c-ms4w-Apache-htdocs-atlasgro\assets"
}
New-Item -ItemType Directory -Force -Path $dst | Out-Null
Get-ChildItem $src -Filter "*Logotipo_5*" | Copy-Item -Destination (Join-Path $dst "inegi-claro.png") -Force
Get-ChildItem $src -Filter "*Logotipo_8*" | Copy-Item -Destination (Join-Path $dst "inegi-oscuro.png") -Force
Get-ChildItem $src -Filter "*snieg*" | Copy-Item -Destination (Join-Path $dst "snieg.png") -Force
Write-Host "Logos en $dst :"
Get-ChildItem $dst
