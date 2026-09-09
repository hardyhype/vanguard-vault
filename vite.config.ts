import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served from /VV/ in production (hardyh.com/VV/), root in dev. HMN pattern.

// The preview harness assigns a free port and passes it as PORT. Vite does
// not read that on its own — left alone it just walks 5173 → 5174 when the
// port is busy, and the caller ends up pointed at nothing. strictPort makes
// it fail loudly instead of drifting again.
const assignedPort = process.env.PORT ? Number(process.env.PORT) : undefined;

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/VV/' : '/',
  server: assignedPort ? { port: assignedPort, strictPort: true } : undefined,
}));
