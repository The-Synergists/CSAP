import path from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@shared': path.resolve(import.meta.dirname, '../shared') },
  },
  server: {
    // The backend gateway (Express, port 5000) serves /api during local development.
    proxy: { '/api': 'http://localhost:5000' },
  },
})
