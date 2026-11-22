/**
 * BackgroundProcessPanel - 后台进程总览
 *
 * 挂在 ActivityBar 的浮动面板中(panel id = 'process'),跨会话展示当前所有
 * bash 后台进程(含最近已结束的记录),支持:
 *  - 面板打开期间每 2.5s 刷新列表,运行中时长每秒走动
 *  - 单条停止 / 全部停止(调用后端 /api/tool/background/stop[-all])
 *  - 展开查看日志快照(每 2s 刷新,前端截尾避免大段 DOM)
 *  - 点击行跳转到所属会话,并定位高亮对应的工具调用行
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { chatApi } from '@/api/client';
import { useAppStore } from '@/stores/appStore';
import { useI18n } from '@/i18n';
import { sessionTitle } from '@/utils/session-title';
import type { BackgroundProcessInfo } from '@/types';
import './BackgroundProcessPanel.css';

/** 列表轮询间隔(面板打开期间) */
const LIST_POLL_MS = 2500;
/** 日志轮询间隔(存在展开的日志时) */
const LOG_POLL_MS = 2000;
/** 前端展示日志的最大字符数(后端缓冲上限 100k,避免一次性渲染过大) */
const LOG_MAX_CHARS = 20000;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** 毫秒 → 12:37 / 1:02:03 */
function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
}

type Translate = (key: string, params?: Record<string, string | number>) => string;

/** 结束时间的相对描述(刚刚 / N 分钟前 / N 小时前) */
function relativeTime(ts: number, now: number, t: Translate): string {
  const diff = Math.max(0, now - ts);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return t('background.justNow');
  if (minutes < 60) return t('background.minutesAgo', { n: minutes });
  return t('background.hoursAgo', { n: Math.floor(minutes / 60) });
}

export function BackgroundProcessPanel() {
  const { t } = useI18n();
  const sessions = useAppStore((s) => s.sessions);
  const sessionDisplayNames = useAppStore((s) => s.sessionDisplayNames);
  const setCurrentSession = useAppStore((s) => s.setCurrentSession);
  const focusToolCall = useAppStore((s) => s.focusToolCall);

  const [processes, setProcesses] = useState<BackgroundProcessInfo[]>([]);
  const [openLogs, setOpenLogs] = useState<string[]>([]);
  const [logs, setLogs] = useState<Record<string, { output: string; error: string }>>({});
  const [now, setNow] = useState(() => Date.now());
  const [stoppingAll, setStoppingAll] = useState(false);

  // 列表轮询(组件随面板关闭卸载,轮询自动停止)
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void chatApi
        .listBackgroundProcesses()
        .then((res) => {
          if (!cancelled) setProcesses(res.processes);
        })
        .catch(() => {});
    };
    load();
    const timer = window.setInterval(load, LIST_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const hasRunning = processes.some((p) => p.running);

  // 运行中进程每秒刷新"已运行时长"
  useEffect(() => {
    if (!hasRunning) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [hasRunning]);

  // 展开的日志快照轮询
  useEffect(() => {
    if (openLogs.length === 0) return;
    let cancelled = false;
    const load = () => {
      openLogs.forEach((id) => {
        void chatApi
          .getBackgroundLog(id)
          .then((res) => {
            if (cancelled) return;
            setLogs((prev) => ({ ...prev, [id]: { output: res.output, error: res.error } }));
          })
          .catch(() => {});
      });
    };
    load();
    const timer = window.setInterval(load, LOG_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [openLogs]);

  const sessionMap = useMemo(() => new Map(sessions.map((s) => [s.id, s])), [sessions]);
  const running = processes.filter((p) => p.running);
  const finished = processes.filter((p) => !p.running);

  const sessionLabel = (p: BackgroundProcessInfo): string => {
    const session = p.sessionId ? sessionMap.get(p.sessionId) : undefined;
    return session ? sessionTitle(session, sessionDisplayNames, t) : t('background.unknownSession');
  };

  /** 点击行:切到所属会话并请求定位对应工具行 */
  const jumpTo = (p: BackgroundProcessInfo) => {
    if (!p.sessionId) return;
    setCurrentSession(p.sessionId);
    focusToolCall(p.toolCallId);
  };

  const toggleLog = useCallback((id: string) => {
    setOpenLogs((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  /** 单条停止:先本地置为已停止,再请求后端(下一轮轮询会校正) */
  const stopOne = (p: BackgroundProcessInfo) => {
    const endedAt = Date.now();
    setProcesses((prev) =>
      prev.map((item) =>
        item.toolCallId === p.toolCallId
          ? { ...item, running: false, stopped: true, endedAt }
          : item,
      ),
    );
    void chatApi.stopBackgroundProcess(p.toolCallId).catch(() => {});
  };

  /** 全部停止:同样先本地更新,避免等待后端/进程退出造成界面延迟 */
  const stopAll = () => {
    if (running.length === 0 || stoppingAll) return;
    setStoppingAll(true);
    const endedAt = Date.now();
    setProcesses((prev) =>
      prev.map((item) =>
        item.running ? { ...item, running: false, stopped: true, endedAt } : item,
      ),
    );
    void chatApi
      .stopAllBackgroundProcesses()
      .catch(() => {})
      .finally(() => setStoppingAll(false));
  };

  const logText = (id: string): string => {
    const entry = logs[id];
    const text = entry ? [entry.output, entry.error].filter((x) => x && x.trim()).join('\n') : '';
    if (!text) return t('background.noOutput');
    return text.length > LOG_MAX_CHARS ? `…\n${text.slice(-LOG_MAX_CHARS)}` : text;
  };

  const renderRow = (p: BackgroundProcessInfo) => {
    const status = p.running ? 'running' : p.stopped ? 'stopped' : 'ended';
    const stateText = p.running
      ? t('background.runningFor', { time: formatElapsed(now - p.startedAt) })
      : p.stopped
        ? t('background.stopped')
        : t('background.ended');
    const endText = !p.running && p.endedAt > 0 ? relativeTime(p.endedAt, now, t) : '';
    const logOpen = openLogs.includes(p.toolCallId);
    const wordDir = p.workingDir || '';
    const rowTitle = [
      p.command,
      `PID ${p.pid}`,
      wordDir,
      logOpen ? t('background.collapseLog') : t('background.expandLog'),
    ]
      .filter(Boolean)
      .join('\n');

    return (
      <div
        key={p.toolCallId}
        className="bg-proc-row"
        role="button"
        tabIndex={0}
        title={rowTitle}
        onClick={() => toggleLog(p.toolCallId)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleLog(p.toolCallId);
          }
        }}
      >
        <div className="bg-proc-main">
          <span className={`bg-proc-dot ${status}`} />
          <code className="bg-proc-cmd">{p.command}</code>
          <svg
            className={`bg-proc-chevron${logOpen ? ' open' : ''}`}
            viewBox="0 0 10 10"
            width="10"
            height="10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="3.5 2.5 6.5 5 3.5 7.5" />
          </svg>
          <span className="bg-proc-actions">
            {p.sessionId && (
              <button
                type="button"
                className="bg-proc-act jump"
                onClick={(e) => {
                  e.stopPropagation();
                  jumpTo(p);
                }}
              >
                {t('background.locate')}
              </button>
            )}
            {p.running && (
              <button
                type="button"
                className="bg-proc-act stop"
                onClick={(e) => {
                  e.stopPropagation();
                  stopOne(p);
                }}
              >
                {t('background.stop')}
              </button>
            )}
          </span>
        </div>
        <div className="bg-proc-meta">
          <span>PID {p.pid}</span>
          <span className="bg-proc-sep">·</span>
          <span>
            {stateText}
            {endText ? ` ${endText}` : ''}
          </span>
          {/* 会话名默认隐藏,悬浮行时淡入,避免常态下信息过密 */}
          <span className="bg-proc-session" title={sessionLabel(p)}>
            {sessionLabel(p)}
          </span>
        </div>
        {logOpen && (
          <div className="bg-proc-log-wrap">
            {wordDir && <div className="bg-proc-log-meta">{wordDir}</div>}
            <pre className="bg-proc-log" onClick={(e) => e.stopPropagation()}>
              {logText(p.toolCallId)}
            </pre>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-proc-panel">
      <div className="bg-proc-toolbar">
        <span className="bg-proc-count">
          {t('background.count', { running: running.length, done: finished.length })}
        </span>
        <button
          type="button"
          className="bg-proc-stop-all"
          disabled={running.length === 0 || stoppingAll}
          onClick={stopAll}
        >
          {t('background.stopAll')}
        </button>
      </div>

      {processes.length === 0 ? (
        <div className="activity-panel-empty">
          <span>{t('background.empty')}</span>
        </div>
      ) : (
        <div className="bg-proc-list">
          {running.length > 0 && (
            <>
              <div className="bg-proc-group">{t('background.runningGroup')}</div>
              {running.map(renderRow)}
            </>
          )}
          {finished.length > 0 && (
            <>
              <div className="bg-proc-group">{t('background.doneGroup')}</div>
              {finished.map(renderRow)}
            </>
          )}
        </div>
      )}
    </div>
  );
}
