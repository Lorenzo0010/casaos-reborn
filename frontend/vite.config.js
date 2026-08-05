import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.VITE_BACKEND_URL || 'http://localhost:80';

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': target,
        '/socket.io': {
          target: target,
          ws: true
        }
      }
    }
  }
})
