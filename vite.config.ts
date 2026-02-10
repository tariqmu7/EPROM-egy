import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // generic base path to handle user.github.io/repo-name/
  base: './', 
  build: {
    outDir: 'dist',
    sourcemap: false
  }
});