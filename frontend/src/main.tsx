import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initI18n } from './i18n';
// 副作用导入:启动时即应用已保存的自定义背景(设置 --app-bg),避免刷新后背景丢失
import '@/stores/backgroundStore';
import './index.css';

// 启动时恢复用户语言设置（localStorage 'hippo-lang'，与旧版共享）
initI18n();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
