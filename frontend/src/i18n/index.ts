/**
 * i18n — 国际化引擎（React / zustand 版）
 *
 * 对齐旧版 static/js/i18n.js 的自研轻量方案：
 *  - key 查表 + {param} 插值，不引入 i18next 重依赖
 *  - 语言持久化 localStorage 'hippo-lang'（与旧版同 key，新旧前端共享语言设置）
 *  - zustand 驱动：切语言时订阅组件自动重渲染（与 themeStore 风格一致）
 *
 * 用法：
 *   useI18n()                          → 组件内 `const { t } = useI18n(); t('chat.placeholder')`
 *   t('fileChanges.summaryFiles', {count: 3})   → 插值
 *   i18nStore.getState().setLang('en')         → 非组件环境切语言
 *   translate('chat.placeholder')              → 非响应式场景（utils / 事件回调）
 */
import { useCallback } from 'react';
import { create } from 'zustand';
import { useStore } from 'zustand';
import { zh, en, type Lang } from './messages';

const LANG_KEY = 'hippo-lang';

function readStoredLang(): Lang {
  try {
    const v = localStorage.getItem(LANG_KEY);
    if (v === 'en') return 'en';
  } catch {
    /* localStorage 不可用时静默降级为中文 */
  }
  return 'zh';
}

function applyHtmlLang(lang: Lang): void {
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
}

interface I18nState {
  /** 当前语言 */
  lang: Lang;
  /** 初始化：从 localStorage 恢复语言设置 */
  initI18n: () => void;
  /** 设置语言：持久化 + 更新 <html lang> */
  setLang: (lang: Lang) => void;
}

export const i18nStore = create<I18nState>((set) => ({
  lang: readStoredLang(),
  initI18n: () => {
    const lang = readStoredLang();
    applyHtmlLang(lang);
    set({ lang });
  },
  setLang: (lang) => {
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {
      /* 忽略 */
    }
    applyHtmlLang(lang);
    set({ lang });
  },
}));

/**
 * 翻译查表（非响应式）。读取 store 当前语言：目标语言无词 → 回退中文 → 返回 key。
 * utils / 事件回调 / toast 等非组件场景使用；组件内请用 useI18n。
 */
export function translate(key: string, params?: Record<string, string | number>): string {
  const lang = i18nStore.getState().lang;
  const dict = lang === 'en' ? en : zh;
  let text = dict[key] ?? zh[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.split(`{${k}}`).join(String(v));
    }
  }
  return text;
}

/** 绑定到当前语言的 t（订阅 store，语言变化触发重渲染） */
export function useI18n() {
  const lang = useStore(i18nStore, (s) => s.lang);
  // t 必须记忆化，否则每次渲染都会生成新函数引用，导致依赖它的
  // useMemo/useCallback/useEffect 每帧重建，可能触发无限更新循环（React #185）
  const t = useCallback((key: string, params?: Record<string, string | number>) => {
    const dict = lang === 'en' ? en : zh;
    let text = dict[key] ?? zh[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.split(`{${k}}`).join(String(v));
      }
    }
    return text;
  }, [lang]);
  return { t, lang };
}

/** 页面初始化调用一次（main.tsx） */
export function initI18n(): void {
  i18nStore.getState().initI18n();
}