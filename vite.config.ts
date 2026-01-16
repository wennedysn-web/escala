import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Removido o bloco 'define' que sobrescrevia o process.env, 
  // permitindo a detecção dinâmica da API_KEY.
});