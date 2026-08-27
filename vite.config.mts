import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    plugins: [
      react(), 
      tailwindcss()
    ],
    server: {

      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {
        ignored: [
          '**/mlb_*.json', '**/datastreak_*.json', '**/odds_*.json', '**/savant_*.json',
          '**/games_db*.json', '**/boxscore_*.json', '**/pitcher_stats_*.json', '**/offense_stats_*.json',
          '**/cache/**', '**/datasets/**', '**/*.csv', '**/server.mjs', '**/dev-server.log',
        ],
      },
    },
  };
});
