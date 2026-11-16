# Script PowerShell de déploiement Web Windows — GESTION ÉQUIPE GAZ – SIDI ALI
$ErrorActionPreference = "Stop"

Write-Host "=== Déploiement Windows : GESTION ÉQUIPE GAZ – SIDI ALI ===" -ForegroundColor Cyan

if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "[!] Fichier .env créé depuis .env.example. Renseignez SESSION_SECRET avant mise en production !" -ForegroundColor Yellow
}

$env:TZ = "Africa/Algiers"
$env:NODE_ENV = "production"

Write-Host "1. Installation des dépendances..." -ForegroundColor Green
npm ci

Write-Host "2. Compilation de l'interface Web + PWA..." -ForegroundColor Green
npm run build

Write-Host "3. Vérification TypeScript..." -ForegroundColor Green
npm run lint

Write-Host "4. Démarrage du serveur production sur le port 3000..." -ForegroundColor Green
npx tsx server.ts
