import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Static deploy: relative asset URLs so the bundle works from any base path
// (sidecar serves dist/ at /).
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
})
