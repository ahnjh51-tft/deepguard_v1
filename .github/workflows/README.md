# GitHub Deployment Files

This directory contains GitHub Actions workflows for automatic deployment.

## Workflows

- **deploy-backend.yml**: Deploys backend to Google Cloud Run when `backend/` changes
- **deploy-frontend.yml**: Deploys frontend to Firebase Hosting when `frontend/` changes

## Setup Required

Before these workflows work, you need to:

1. Create a GitHub repository and push your code
2. Set up Google Cloud service account
3. Add GitHub secrets (see [github_deployment_guide.md](../../../.gemini/antigravity/brain/da49974f-994f-4729-bbb0-c7c69acaac5c/github_deployment_guide.md))

## Required GitHub Secrets

- `GCP_SA_KEY`: Google Cloud service account JSON key
- `GCP_PROJECT_ID`: Your Google Cloud project ID (e.g., deepguard-app)
- `VITE_API_URL`: Your backend API URL
- `FIREBASE_SERVICE_ACCOUNT`: Firebase service account for hosting

## How It Works

1. Push code to `main` branch
2. GitHub Actions detects changes in `backend/` or `frontend/`
3. Automatically builds and deploys to Google Cloud
4. Check deployment status in the "Actions" tab on GitHub
