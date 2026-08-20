import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initI18n } from './i18n';
import './index.css';

// 启动时恢复用户语言设置（localStorage 'hippo-lang'，与旧版共享）
initI18n();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
