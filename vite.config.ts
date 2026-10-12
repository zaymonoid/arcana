import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [tailwindcss()],
  build: {
    rollupOptions: {
      // The sigil lab ships too, so a preview deploy can show it on a phone.
      input: { main: 'index.html', lab: 'sigil-lab.html' },
    },
  },
})
