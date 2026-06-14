import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
  },
  // SPA fallback: Vite dev server serves index.html for all routes
  // so /documents works without a 404.  Production hosting (Firebase Hosting,
  // Cloud Run + nginx) must also configure a rewrite rule for /* → /index.html.
  server: {
    historyApiFallback: true,
  },
});
