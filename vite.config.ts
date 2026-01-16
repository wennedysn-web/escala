import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    // Permite que o código use process.env sem quebrar no navegador.
    // Não definimos explicitamente API_KEY aqui para permitir a injeção dinâmica da plataforma.
    'process.env': {}
  }
});