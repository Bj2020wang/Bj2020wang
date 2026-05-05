import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { VitePWA } from "vite-plugin-pwa"
import { inspectAttr } from 'kimi-plugin-inspect-react'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    inspectAttr(),
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false,
      includeAssets: ["apple-touch-icon.png", "pwa-192.png", "pwa-512.png"],
      manifest: {
        name: "Todo日历",
        short_name: "Todo日历",
        description: "待办与日历，支持 CloudBase 账号同步",
        theme_color: "#111827",
        background_color: "#111827",
        display: "standalone",
        orientation: "any",
        scope: "./",
        start_url: "./",
        lang: "zh-CN",
        icons: [
          {
            src: "pwa-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "pwa-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        navigateFallback: "index.html",
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  server: {
    port: 3000,
    /** 手机等同 Wi‑Fi 设备用 http://<本机局域网IP>:3000 访问 */
    host: true,
  },
  /** PWA 预览：npm run build 后再 npm run preview（默认端口见终端输出） */
  preview: {
    port: 4173,
    host: true,
    strictPort: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
