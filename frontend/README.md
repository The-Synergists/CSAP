# CSAP Frontend — Central Statutory Authentication Platform

React 19 + TypeScript + Vite + Tailwind CSS procurement officer portal for AI-assisted procurement bid verification, statutory compliance evaluation, and audit logging.

## Tech Stack

- **Framework**: React 19, TypeScript
- **Bundler & Tooling**: Vite, Oxlint
- **Routing**: React Router DOM v7
- **Styling**: Tailwind CSS v4, Lucide React icons
- **State & Backend Integration**: React Context, `@supabase/supabase-js`

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```
Fill in your `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

### 3. Run Development Server
```bash
npm run dev
```

### 4. Build for Production
```bash
npm run build
```

### 5. Lint
```bash
npm run lint
```
