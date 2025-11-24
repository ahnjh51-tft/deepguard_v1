# DeepGuard Frontend Deployment Script for Firebase Hosting
# Usage: .\deploy-frontend.ps1

param(
    [string]$ProjectId = "deepguard-app"
)

Write-Host "🚀 Deploying DeepGuard Frontend to Firebase Hosting..." -ForegroundColor Cyan

# Navigate to frontend directory
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$FrontendDir = Join-Path $ProjectRoot "frontend"
Set-Location $FrontendDir

# Check if .env.production exists
if (-not (Test-Path ".env.production")) {
    Write-Host "⚠️  Warning: .env.production not found!" -ForegroundColor Yellow
    Write-Host "Please create .env.production with your backend URL:" -ForegroundColor Yellow
    Write-Host "VITE_API_URL=https://your-backend-url.run.app" -ForegroundColor White
    $continue = Read-Host "Continue anyway? (y/n)"
    if ($continue -ne "y") {
        exit 1
    }
}

# Build production bundle
Write-Host "Building production bundle..." -ForegroundColor Yellow
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed!" -ForegroundColor Red
    exit 1
}

# Deploy to Firebase
Write-Host "Deploying to Firebase Hosting..." -ForegroundColor Yellow
firebase deploy --only hosting --project $ProjectId

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Frontend deployed successfully!" -ForegroundColor Green
    Write-Host "`n📍 Your app should be live at: https://$ProjectId.web.app" -ForegroundColor Cyan
} else {
    Write-Host "❌ Deployment failed!" -ForegroundColor Red
    exit 1
}
