import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// 后端 API 地址(本地开发时由 Java DashboardServer 提供, 默认端口 9090)
const API_TARGET = process.env.HIPPO_API_TARGET ?? 'http://localhost:9090';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      // 后端 REST/SSE 接口走 /api 前缀
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
        ws: true,
      },
      // 旧前端的会话流接口(若后续阶段需要兼容)
      '/sse': {
        target: API_TARGET,
        changeOrigin: true,
        ws: true,
      },
      // 后端静态 vendor 资源(3.7-2 BinaryPreview 运行时加载 /js/vendor/ooxml/*)
      '/js': {
        target: API_TARGET,
        changeOrigin: true,
      },
    },
  },
  // 相对 base: 生产部署在 /app 子路径下, 绝对路径 /assets 会落到根 context 404;
  // 项目无 History 路由(视图切换为状态切换), 相对路径无副作用。
  base: './',
  build: {
    // 产物直接输出到 Java 后端 static-v2 目录(3.8-1 部署链路),
    // Java 侧新增 /app context 映射该目录, 与旧 cockpit(/static)并存。
    outDir: '../src/main/resources/static-v2',
    emptyOutDir: true,
    // 生产不输出 sourcemap:map 文件 7~9MB/份且极易跨构建累积, 显著压大安装包
    sourcemap: false,
  },
});
