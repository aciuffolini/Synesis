# Synesis — Beef Risk PWA

Agentic beef nutrition & management copilot. First module: **Feedlot Risk Planner** (React + Vite + PWA), offline-first with **Dexie** and scenario export/import.

🌐 **[Live App](https://aciuffolini.github.io/Synesis/)** | 📱 PWA Ready | 💾 Offline-First

## Features
- Offline PWA (vite-plugin-pwa)
- Local data (Dexie/IndexedDB)
- Risk heatmap + sensitivity chart
- Export/Import JSON scenarios
- GitHub Pages deployment

## Quick Start

### Live Demo
Visit the **[live application](https://aciuffolini.github.io/Synesis/)** to try it immediately.

### Local Development
```bash
cd apps/web
npm ci
npm run dev
```

### Build for Production
```bash
cd apps/web
npm run build
npm run preview
```

## Deployment
This app is automatically deployed to GitHub Pages on every push to `main` branch.
- **Live URL**: https://aciuffolini.github.io/Synesis/
- **Source**: This repository
- **Build**: GitHub Actions workflow
