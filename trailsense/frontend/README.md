# TrailSense Frontend

React frontend for TrailSense, a hiking decision support system.

## Quick Start

### Install Dependencies

```bash
npm install
```

### Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and set:

```
VITE_API_BASE_URL=http://localhost:8000
```

### Start Development Server

```bash
npm run dev
```

App runs at [http://localhost:3000](http://localhost:3000)

### Build for Production

```bash
npm run build
```

## Tech Stack

- React 18 + TypeScript
- Vite
- Tailwind CSS
- React Router v6
- TanStack Query
- Zustand
- React Hook Form + Zod
- Axios

## Project Structure

```
src/
├── components/     # Reusable UI components
├── pages/          # Page components
├── hooks/          # Custom React hooks
├── services/       # API clients
├── stores/         # State management
├── types/          # TypeScript types
└── styles/         # Global styles
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

## Design System

Matches the journal/hand-drawn aesthetic of the main portfolio:

- **Colors**: paper, ink, highlight, line, fade
- **Fonts**: Caveat (handwritten), Lora (body), Patrick Hand (notes)
- **Styling**: Irregular borders, hand-drawn shadows

See [PHASE3_COMPLETE.md](../PHASE3_COMPLETE.md) for full documentation.
