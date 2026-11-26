# PlayPal-Arcade 🎮

**Hanan & Rehan's Arcade** - A personal 2-player neon-glass arcade hub featuring Chess, Carrom, Headball, Top-Down Football, Air Hockey, and a Turn-Based RPG Arena.

![PlayPal Arcade](https://img.shields.io/badge/PlayPal-Arcade-neon?style=for-the-badge&logo=gamepad)
![React](https://img.shields.io/badge/React-19-blue?style=flat-square&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-7-blue?style=flat-square&logo=typescript)
![Vite](https://img.shields.io/badge/Vite-8-purple?style=flat-square&logo=vite)
![Firebase](https://img.shields.io/badge/Firebase-13-orange?style=flat-square&logo=firebase)
![TailwindCSS](https://img.shields.io/badge/TailwindCSS-4-38bdf8?style=flat-square&logo=tailwindcss)

## 🎮 Games Included

| Game | Description | Players |
|------|-------------|---------|
| ♟️ **Chess** | Classic chess with full rules, AI opponent, and local multiplayer | 2 |
| ♟️ **Carrom** | Physics-based carrom with realistic striker physics | 2 |
| ⚽ **Headball** | Fast-paced head-to-head soccer | 2 |
| ⚽ **Football** | Top-down football with physics | 2 |
| 🏒 **Air Hockey** | Fast-paced air hockey with realistic physics | 2 |
| 🏎️ **Racing** | Top-down racing game | 2 |

## ✨ Features

- 🎨 **Neon-Glass UI** - Beautiful glassmorphism design with neon accents
- 🔥 **Real-time Multiplayer** - Powered by Firebase Realtime Database
- 🤖 **AI Opponents** - Play against smart AI when solo
- 💾 **Game History** - Track your matches and statistics
- 👥 **Friends System** - Add friends and challenge them
- 📱 **Responsive Design** - Works on desktop and mobile
- 🎵 **Sound Effects** - Immersive audio for each game
- 🔒 **Secure** - Firebase authentication and security rules

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Bun (recommended) or npm
- Firebase project

### Installation

```bash
# Clone the repository
git clone https://github.com/Hanan-Ali-Haider/PlayPal-Arcade.git
cd PlayPal-Arcade

# Install dependencies
bun install
# or: npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your Firebase config

# Start development server
bun run dev
# or: npm run dev
```

### Firebase Setup

1. Create a Firebase project at [Firebase Console](https://console.firebase.google.com)
2. Enable Authentication (Anonymous)
3. Enable Realtime Database
4. Enable Firestore Database
5. Copy config to `.env`:

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_DATABASE_URL=https://your-project.firebaseio.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

## 🏗️ Project Structure

```
src/
├── components/           # Reusable UI components
├── firebase/             # Firebase configuration & RTC sync
├── games/                # Game implementations
│   ├── airhockey/
│   ├── carrom/
│   ├── chess/
│   ├── football/
│   ├── headball/
│   └── racing/
├── state/                # Zustand store for global state
├── types/                # TypeScript types
├── utils/                # Utility functions
└── views/                # Page views
```

## 🛠️ Development

```bash
# Development server
bun run dev

# Build for production
bun run build

# Preview production build
bun run preview

# Lint
bun run lint
```

## 🎨 Tech Stack

- **Frontend**: React 19 + TypeScript
- **Build Tool**: Vite 8
- **Styling**: TailwindCSS 4
- **Animation**: Motion (Framer Motion)
- **State Management**: Zustand
- **Backend**: Firebase (Auth, Realtime DB, Firestore)
- **Deployment**: Vercel/Netlify ready

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

---

## 👤 Author

**Made By Hanan Ali Haider**

- GitHub: [@Hanan-Ali-Haider](https://github.com/Hanan-Ali-Haider)
- Repository: [PlayPal-Arcade](https://github.com/Hanan-Ali-Haider/PlayPal-Arcade)

---

*Built with ❤️ for Hanan & Rehan's gaming sessions*
