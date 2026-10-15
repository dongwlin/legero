import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

const sourceFiles = [
  'src/services/orderBenchmark.ts', 'src/services/orderBenchmarkScenes.ts',
  'src/services/orderBenchmarkFixtures.ts', 'src/services/orderBenchmarkTypes.ts',
  'src/services/orderWorkspaceView.ts', 'src/services/orderSoak.ts',
  'src/services/orderSorting.ts', 'src/services/orderStatus.ts', 'src/store/order.ts',
  'src/services/orderOptimistic.ts', 'src/services/orderRealtime.ts',
  'src/services/orderRepository.ts', 'src/hooks/useOrderWorkspaceSync.ts',
  'src/services/performanceRecorder.ts', 'src/services/apiClient.ts',
  'src/components/PerformanceProfiler.tsx', 'src/views/Order/components/list/useOrderItemActions.ts',
  'src/services/buildMetadata.ts', 'pnpm-lock.yaml',
]

const readSource = () => {
  try {
    return {
      commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      dirty: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim() !== '',
      sourceSha256: Object.fromEntries(sourceFiles.map((file) => [file,
        createHash('sha256').update(readFileSync(file)).digest('hex'),
      ])),
      unavailableReason: null,
    }
  } catch {
    return { commit: null, dirty: null, sourceSha256: {}, unavailableReason: 'source metadata unavailable at build time' }
  }
}

export default defineConfig(({ mode }) => ({
  define: {
    __LEGERO_BUILD__: JSON.stringify({
      appVersion: JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version,
      mode,
      profiling: mode === 'profiling',
      ...readSource(),
    }),
  },
  // base: './',
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      ...(mode === 'profiling' ? { 'react-dom/client': 'react-dom/profiling' } : {})
    }
  }
}))
