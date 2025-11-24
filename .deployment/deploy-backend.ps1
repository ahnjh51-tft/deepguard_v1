# DeepGuard Backend Deployment Script for Google Cloud Run
# Usage: .\deploy-backend.ps1

param(
    [string]$ProjectId = "deepguard-app",
    [string]$Region = "us-central1",
    [string]$ServiceName = "deepguard-backend"
)

Write-Host "🚀 Deploying DeepGuard Backend to Google Cloud Run..." -ForegroundColor Cyan

# Set project
Write-Host "Setting project to $ProjectId..." -ForegroundColor Yellow
gcloud config set project $ProjectId

# Navigate to project root
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

# Deploy to Cloud Run
Write-Host "Deploying to Cloud Run..." -ForegroundColor Yellow
gcloud run deploy $ServiceName `
    --source ./backend `
    --platform managed `
    --region $Region `
    --allow-unauthenticated `
    --memory 2Gi `
    --cpu 2 `
    --timeout 300 `
    --max-instances 10 `
    --min-instances 0

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Backend deployed successfully!" -ForegroundColor Green
    
    # Get service URL
    $ServiceUrl = gcloud run services describe $ServiceName --region $Region --format 'value(status.url)'
    Write-Host "`n📍 Backend URL: $ServiceUrl" -ForegroundColor Cyan
    Write-Host "`n💡 Update your frontend .env.production with:" -ForegroundColor Yellow
    Write-Host "VITE_API_URL=$ServiceUrl" -ForegroundColor White
} else {
    Write-Host "❌ Deployment failed!" -ForegroundColor Red
    exit 1
}
