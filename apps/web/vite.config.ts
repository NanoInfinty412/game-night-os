import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Listen on the LAN so phones on the same Wi-Fi can join.
    host: true,
    port: 5173,
    proxy: {
      '/health': 'http://localhost:3000',
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
        // Phones dropping off Wi-Fi reset their sockets; that's normal, not worth a stack trace.
        configure: (proxy) => {
          proxy.on('error', (error: NodeJS.ErrnoException) => {
            if (error.code !== 'ECONNRESET' && error.code !== 'EPIPE') console.error(error);
          });
        },
      },
    },
  },
});
