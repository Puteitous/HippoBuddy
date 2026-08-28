/**
 * SearchPanel - 查找/替换浮层(阶段 3.8 升级:CM6 驱动)
 *
 * 对标旧版 components/search-panel.js:独立浮层叠加在编辑器上方,
 * 搜索核心逻辑(高亮、导航)通过 CM6 @codemirror/search API 驱动。
 *
 * 阶段 3.7-1 简化版(正则计数,无真实高亮)→ 阶段 3.8 升级:
 *  - 接收 CM6 EditorView 实例,用 SearchQuery / setSearchQuery / findNext /
 *    findPrevious 驱动真实高亮与滚动定位
 *  - 匹配数与当前索引从 view.state.field(searchState) 读取(与高亮同源,无漂移)
 *
 * 替换说明(对齐旧版,编辑能力接入后激活):
 *  - 替换 / 全部替换通过 CM6 replaceNext / replaceAll 真实回写编辑器
 *  - 替换会产生 docChanged → updateListener → 父组件置 dirty,可再经 Mod-s 保存
 *
 * 快捷键:Enter / Shift+Enter 导航,Esc 关闭(由父组件统一绑定)。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { EditorView } from '@codemirror/view';
import {
  SearchQuery,
  setSearchQuery,
  findNext,
  findPrevious,
  replaceNext,
  replaceAll,
} from '@codemirror/search';
import './SearchPanel.css';
import { useI18n } from '../i18n';

interface SearchPanelProps {
  /** CM6 编辑器实例(由 FilePreview 传入) */
  view: EditorView;
  /** 初始模式:'find' 只查找;'replace' 查找+替换 */
  initialMode?: 'find' | 'replace';
  /** 关闭回调 */
  onClose: () => void;
}

interface SearchOptions {
  caseSensitive: boolean;
  regexp: boolean;
  wholeWord: boolean;
}

interface SearchStats {
  total: number;
  current: number;
}

export function SearchPanel({ view, initialMode = 'find', onClose }: SearchPanelProps) {
  const { t } = useI18n();
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [opts, setOpts] = useState<SearchOptions>({
    caseSensitive: false,
    regexp: false,
    wholeWord: false,
  });
  const [showReplace, setShowReplace] = useState(initialMode === 'replace');
  const [stats, setStats] = useState<SearchStats>({ total: 0, current: 0 });

  const findInputRef = useRef<HTMLInputElement | null>(null);

  // 从编辑器文档统计匹配(正则参数与 CM6 SearchQuery 一致;高亮/滚动由 CM6 驱动)
  const readStats = useCallback(() => {
    if (!findText) {
      setStats({ total: 0, current: 0 });
      return;
    }
    const re = buildRegex(findText, opts);
    if (!re) {
      setStats({ total: 0, current: 0 });
      return;
    }
    const doc = view.state.doc.toString();
    const positions = findMatches(doc, re);
    if (positions.length === 0) {
      setStats({ total: 0, current: 0 });
      return;
    }
    // 当前索引:selection 起点之前最近的匹配(与 CM6 findNext 落点一致)
    const selFrom = view.state.selection.main.from;
    let current = 0;
    for (let i = 0; i < positions.length; i++) {
      if (positions[i] <= selFrom) current = i;
      else break;
    }
    setStats({ total: positions.length, current });
  }, [view, findText, opts]);

  // 挂载时聚焦
  useEffect(() => {
    findInputRef.current?.focus();
    findInputRef.current?.select();
  }, []);

  // Esc 关闭
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // 查询变化 → 更新 CM6 搜索状态(自动高亮所有匹配),并读取统计
  useEffect(() => {
    if (!findText) {
      view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: '' })) });
      setStats({ total: 0, current: 0 });
      return;
    }
    let query: SearchQuery;
    try {
      query = new SearchQuery({
        search: findText,
        caseSensitive: opts.caseSensitive,
        regexp: opts.regexp,
        wholeWord: opts.wholeWord,
        replace: replaceText,
      });
    } catch {
      // 非法正则:清空统计,高亮保持
      setStats({ total: 0, current: 0 });
      return;
    }
    view.dispatch({ effects: setSearchQuery.of(query) });
    readStats();
  }, [view, findText, replaceText, opts, readStats]);

  /** 导航到上一个/下一个匹配(CM6 自动滚动到匹配位置) */
  const navTo = useCallback(
    (dir: 'next' | 'prev') => {
      if (stats.total === 0) return;
      if (dir === 'next') findNext(view);
      else findPrevious(view);
      readStats();
    },
    [view, stats.total, readStats],
  );

  /** 替换当前 / 全部替换(CM6 replaceNextCommand / replaceAllCommand,替换文本在 SearchQuery.replace 中) */
  const doReplace = useCallback(() => {
    if (!findText || stats.total === 0) return;
    view.focus();
    const hit = replaceNext(view);
    // 命中后重读计数与高亮(文档已变,query 保持)
    readStats();
    if (!hit) navTo('next');
  }, [view, findText, stats.total, readStats, navTo]);

  const doReplaceAll = useCallback(() => {
    if (!findText || stats.total === 0) return;
    view.focus();
    replaceAll(view);
    readStats();
  }, [view, findText, stats.total, readStats]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) navTo('prev');
      else navTo('next');
    }
  };

  const matchCountText = findText
    ? stats.total > 0
      ? `${Math.min(stats.current + 1, stats.total)}/${stats.total}`
      : '0/0'
    : '';

  return (
    <div className="search-panel" role="dialog" aria-label={t('search.dialogLabel')}>
      {/* 查找行 */}
      <div className="search-row">
        <div className="search-input-wrap">
          <input
            ref={findInputRef}
            className="search-input"
            type="text"
            placeholder={t('search.find')}
            value={findText}
            spellCheck={false}
            onChange={(e) => setFindText(e.target.value)}
            onKeyDown={onKeyDown}
            aria-label={t('search.find')}
          />
          <div className="search-opt-group">
            <OptionToggle
              title={t('search.caseSensitive')}
              active={opts.caseSensitive}
              onClick={() => setOpts((o) => ({ ...o, caseSensitive: !o.caseSensitive }))}
              icon="Aa"
            />
            <OptionToggle
              title={t('search.regex')}
              active={opts.regexp}
              onClick={() => setOpts((o) => ({ ...o, regexp: !o.regexp }))}
              icon=".*"
            />
            <OptionToggle
              title={t('search.wholeWord')}
              active={opts.wholeWord}
              onClick={() => setOpts((o) => ({ ...o, wholeWord: !o.wholeWord }))}
              icon="W"
            />
          </div>
        </div>

        <span className={`search-match-count${stats.total === 0 && findText ? ' no-match' : ''}`}>
          {matchCountText}
        </span>

        <button
          type="button"
          className="search-nav-btn"
          title={t('search.prev')}
          onClick={() => navTo('prev')}
          disabled={stats.total === 0}
        >
          <svg viewBox="0 0 10 10" width="10" height="10">
            <path
              d="M2 7L5 3L8 7"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button
          type="button"
          className="search-nav-btn"
          title={t('search.next')}
          onClick={() => navTo('next')}
          disabled={stats.total === 0}
        >
          <svg viewBox="0 0 10 10" width="10" height="10">
            <path
              d="M2 3L5 7L8 3"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <button
          type="button"
          className="search-expand"
          title={showReplace ? t('search.collapseReplace') : t('search.expandReplace')}
          onClick={() => setShowReplace((v) => !v)}
        >
          {showReplace ? (
            <svg viewBox="0 0 12 12" width="12" height="12">
              <path d="M2 6h8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          ) : (
            <svg viewBox="0 0 12 12" width="12" height="12">
              <path d="M2 3h8M2 9h8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          )}
        </button>

        <button type="button" className="search-close" title={t('search.close')} onClick={onClose}>
          ×
        </button>
      </div>

      {/* 替换行(只读预览下按钮禁用,提示见文件头) */}
      {showReplace && (
        <div className="search-row search-replace-row">
          <input
            className="search-input"
            type="text"
            placeholder={t('search.replaceTo')}
            value={replaceText}
            spellCheck={false}
            onChange={(e) => setReplaceText(e.target.value)}
            onKeyDown={onKeyDown}
            aria-label={t('search.replaceTo')}
          />
          <button
            type="button"
            className="search-action"
            onClick={doReplace}
            disabled={stats.total === 0}
            title={t('search.replaceTip')}
          >
            {t('search.replace')}
          </button>
          <button
            type="button"
            className="search-action"
            onClick={doReplaceAll}
            disabled={stats.total === 0}
            title={t('search.replaceAllTip')}
          >
            {t('search.replaceAll')}
          </button>
        </div>
      )}
    </div>
  );
}

/** 选项切换按钮(case/regex/word) */
interface OptionToggleProps {
  title: string;
  active: boolean;
  onClick: () => void;
  icon: string;
}

function OptionToggle({ title, active, onClick, icon }: OptionToggleProps) {
  return (
    <button
      type="button"
      className={`search-opt${active ? ' active' : ''}`}
      title={title}
      onClick={onClick}
      aria-pressed={active}
    >
      {icon}
    </button>
  );
}

// ============================================================================
// 工具函数
// ============================================================================

/** 构建正则(参数与 CM6 SearchQuery 对齐;失败返回 null) */
function buildRegex(text: string, opts: SearchOptions): RegExp | null {
  if (!text) return null;
  try {
    let source: string;
    if (opts.regexp) {
      source = text;
    } else {
      source = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    if (opts.wholeWord) {
      source = `\\b${source}\\b`;
    }
    const flags = opts.caseSensitive ? 'g' : 'gi';
    return new RegExp(source, flags);
  } catch {
    return null;
  }
}

/** 计算所有匹配位置(对齐旧版 findMatches) */
function findMatches(text: string, re: RegExp): number[] {
  const positions: number[] = [];
  if (!re) return positions;
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    positions.push(m.index);
    // 防止零宽匹配死循环
    if (m[0].length === 0) {
      re.lastIndex++;
    }
  }
  return positions;
}
