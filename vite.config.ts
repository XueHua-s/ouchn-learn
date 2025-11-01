import { defineConfig } from 'vite'
import Vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import { resolve } from 'path'
import hotReloadBackground from './scripts/hot-reload/background'
import { __DEV__, outputDir } from './const'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import {
  ElementPlusResolver,
  NaiveUiResolver
} from 'unplugin-vue-components/resolvers'

export const r = (...args: string[]) => resolve(__dirname, '.', ...args)

export const commonConfig = {
  root: r('src'),
  define: {
    __DEV__
  },
  resolve: {
    alias: {
      '~/': `${r('src')}/`
    }
  },
  plugins: [
    Vue(),
    UnoCSS(),
    AutoImport({
      resolvers: [ElementPlusResolver()],
      dts: 'typings/auto-import.d.ts',
      imports: [
        'vue',
        {
          'naive-ui': [
            'useDialog',
            'useMessage',
            'useNotification',
            'useLoadingBar'
          ]
        }
      ]
    }),
    Components({
      resolvers: [ElementPlusResolver(), NaiveUiResolver()],
      dts: 'typings/components.d.ts',
    })
  ]
}

export default defineConfig({
  ...commonConfig,
  build: {
    watch: __DEV__ ? {} : null,
    cssCodeSplit: false,
    emptyOutDir: false,
    sourcemap: false,
    outDir: r(outputDir),
    rollupOptions: {
      input: {
        background: r('src/background/index.ts'),
        popup: r('src/popup/index.ts')
      },
      output: {
        assetFileNames: '[name].[ext]',
        entryFileNames: '[name]/index.js',
        extend: true,
        format: 'es'
      }
    }
  },
  plugins: [...commonConfig.plugins, hotReloadBackground()]
})
