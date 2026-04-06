import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  clearScreen: false,
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: {
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('html2canvas')) return 'vendor-html2canvas';
            if (id.includes('jspdf')) return 'vendor-jspdf';
            if (id.includes('sql.js')) return 'vendor-sqljs';
            if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) return 'vendor-react';
            if (id.includes('@dnd-kit')) return 'vendor-dnd';
            if (id.includes('chart.js') || id.includes('react-chartjs-2')) return 'vendor-chart';
            if (id.includes('react-datepicker') || id.includes('date-fns')) return 'vendor-date';
            if (id.includes('jszip') || id.includes('qrcode') || id.includes('lodash-es')) return 'vendor-utils';
            return 'vendor';
          }
          if (id.includes('/src/services/pdfExportService')) return 'pdf-service';
          if (id.includes('/src/components/Inbox')) return 'inbox';
          if (
            id.includes('/src/components/InvoiceEditor') ||
            id.includes('/src/components/InvoiceList') ||
            id.includes('/src/components/RentalRequestDetail')
          ) {
            return 'belege-workflow';
          }
          if (id.includes('/src/components/CalendarPanel')) return 'calendar';
          if (id.includes('/src/components/MessageBox')) return 'messages';
        },
      },
    },
  },
});
