# Synesis

🌐 **[Live App](https://aciuffolini.github.io/Synesis/)** | 📱 PWA Ready | 💾 Offline-First

Agentic beef nutrition & management copilot. A Progressive Web App (PWA) for beef risk management and feedlot planning.

## 🚀 Quick Start

### Try the Live App
Visit **[https://aciuffolini.github.io/Synesis/](https://aciuffolini.github.io/Synesis/)** to use the application immediately.

### Local Development
```bash
# Clone the repository
git clone https://github.com/aciuffolini/Synesis.git
cd Synesis

# Install dependencies and start development server
cd apps/web
npm ci
npm run dev
```

## 📱 Features

- **Offline PWA**: Works without internet connection
- **Local Data Storage**: Uses Dexie/IndexedDB for data persistence
- **Risk Management**: Interactive heatmaps and sensitivity charts
- **Export/Import**: JSON scenario management
- **Mobile Ready**: Responsive design with PWA capabilities

## 🛠️ Tech Stack

- **Frontend**: React 19 + TypeScript + Vite
- **Styling**: Tailwind CSS
- **Database**: Dexie (IndexedDB wrapper)
- **PWA**: Vite PWA Plugin
- **Deployment**: GitHub Pages + GitHub Actions

## 📁 Project Structure

```
synesis/
├── apps/web/          # Main PWA application
│   ├── src/           # React components and logic
│   ├── public/        # Static assets and PWA icons
│   └── dist/          # Built application (auto-generated)
└── .github/workflows/ # GitHub Actions for deployment
```

## 🚀 Deployment

The app is automatically deployed to GitHub Pages on every push to the `main` branch.

- **Live URL**: https://aciuffolini.github.io/Synesis/
- **Build Status**: [![Deploy to GitHub Pages](https://github.com/aciuffolini/Synesis/actions/workflows/deploy.yml/badge.svg)](https://github.com/aciuffolini/Synesis/actions/workflows/deploy.yml)

## 📄 License

This project is licensed under the MIT License.
