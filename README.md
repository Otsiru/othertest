# TopNod Emailnator Integration

A high-performance temporary email web app designed specifically for TopNod account registration slots. Features 10-slot and 40-slot configurations, routing all requests to Gmail and custom domains via **Emailnator** to bypass temporary email detection filters.

## Features

- **Emailnator Backend Proxy**: Safe proxy serverless function bypasses anti-bot/CORS issues and extracts verification codes directly.
- **40 slots & 10 slots UI**: Multi-inbox grid supporting real-time inbox checks.
- **Copy Actions**: Instant copy all emails / copy all verification codes with one click.
- **Git Ready**: Pre-initialized repository with local commit history.

---

## Deployment Guide

### 1. Push to GitHub

To push this codebase to a new repository on your GitHub:

1. Create a new, blank repository on [GitHub](https://github.com/new). Do not initialize it with a README, license, or gitignore.
2. Open your terminal (PowerShell/CMD) and navigate to the project directory:
   ```powershell
   cd "f:\Windows Terminal\TopNod-Emailnator"
   ```
3. Link and push the code:
   ```powershell
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
   git branch -M main
   git push -u origin main
   ```

---

### 2. Deploy to Vercel

To deploy this project to Vercel:

1. Go to your [Vercel Dashboard](https://vercel.com/dashboard) and click **Add New** -> **Project**.
2. Import your newly created GitHub repository.
3. In the project configure settings:
   - **Framework Preset**: Other (or Vite)
   - **Root Directory**: `./` (leave it as root)
   - **Build Command**: `pnpm --filter tempmail-40 run build` (if deploying the 40-slot app) or `pnpm --filter tempmail run build` (if deploying the 10-slot app).
   - **Output Directory**: `artifacts/tempmail-40/dist` (for 40 slots) or `artifacts/tempmail/dist` (for 10 slots).
4. Click **Deploy**. Vercel will automatically compile the frontend and deploy the `api/emailnator.js` serverless function!
