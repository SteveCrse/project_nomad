import { defineConfig, loadEnv } from 'vite';
import { createHash } from 'node:crypto';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig(({ mode }) => {
  // The access password is hashed here, at build time, so only its SHA-256
  // reaches the bundle. Not VITE_-prefixed, so the plain value never leaks.
  const password = (
    process.env.ACCESS_PASSWORD ??
    loadEnv(mode, process.cwd(), '').ACCESS_PASSWORD
  )?.trim();
  const accessHash = password
    ? createHash('sha256').update(password).digest('hex')
    : '';

  return {
    define: { __ACCESS_HASH__: JSON.stringify(accessHash) },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        '@engine': fileURLToPath(new URL('./src/engine', import.meta.url)),
        '@data': fileURLToPath(new URL('./src/data', import.meta.url)),
      },
    },
    // 5173 by default; PORT lets a second dev server run alongside the first.
    server: { port: Number(process.env.PORT) || 5173 },
  };
});
