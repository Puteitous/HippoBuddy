/**
 * MetricsPanel - 实时监控面板
 *
 * 对标旧版 components/MetricsPanel.js,展示 /api/metrics 实时指标:
 *  - LLM:请求总数 / 成功率环形图 / 平均·最大延迟 / 延迟趋势折线图
 *  - 工具:总调用 / 失败数 / 按调用次数降序的水平条形图
 *  - 更新时间(每 10 秒自动轮询)
 *
 * 阶段 3.7-2 简化:
 *  - 不引入 i18n,中文硬编码(与 3.2-3.6 一致)
 *  - SVG 全部内联 JSX(环形图 / 趋势图 / 条形图)
 *  - 延迟采样逻辑对齐旧版:通过 totalRequests 增量判断是否追加采样点
 *
 * 集成位置:ActivityBar 的 'metrics' 浮动面板(320px 宽)。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { metricsApi } from '@/api/client';
import { useI18n } from '@/i18n';
import type { MetricsResponse, ToolUsageDetail } from '@/types';
import './MetricsPanel.css';

/** 趋势图最多保留的采样点数 */
const MAX_TREND_POINTS = 30;

// 模块级持久化:面板卸载后仍保留趋势历史与计数基准(对齐旧版单例行为)
let persistentHistory: number[] = [];
let persistentLastTotal = 0;

/** 仅供测试:重置持久化状态,避免用例间相互污染 */
export function __resetMetricsPersistence(): void {
  persistentHistory = [];
  persistentLastTotal = 0;
}

/** 趋势图 SVG 尺寸(与旧版一致) */
const CHART_WIDTH = 260;
const CHART_HEIGHT = 44;
const CHART_PADDING = 2;

export function MetricsPanel() {
  const { t } = useI18n();
  const [data, setData] = useState<MetricsResponse | null>(null);
  /** 延迟采样历史(用于趋势图,初始值取自模块级持久化) */
  const [latencyHistory, setLatencyHistory] = useState<number[]>(persistentHistory);
  const [updateTime, setUpdateTime] = useState('');
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const d = await metricsApi.get();
      if (!mountedRef.current) return;
      setData(d);
      setUpdateTime(formatTime(new Date()));
      setError(null);

      // 延迟采样:首次获取或新增请求时追加,avg>0 才记录(对齐旧版)
      const llm = d.llm;
      if (llm && llm.totalRequests > 0) {
        const currentTotal = llm.totalRequests;
        const newCalls = currentTotal - persistentLastTotal;
        if (llm.avgLatencyMs > 0 && (newCalls > 0 || persistentLastTotal === 0)) {
          persistentLastTotal = currentTotal;
          persistentHistory = pushLatencySample(persistentHistory, Math.round(llm.avgLatencyMs));
          setLatencyHistory(persistentHistory);
        }
      }
    } catch (e) {
      if (!mountedRef.current) return;
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // 立即拉取 + 每 10 秒轮询;卸载时清理
  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    const timer = window.setInterval(() => void refresh(), 10_000);
    return () => {
      mountedRef.current = false;
      window.clearInterval(timer);
    };
  }, [refresh]);

  const llm = data?.llm;
  const tools = data?.tools;
  const successRate =
    llm && llm.totalRequests > 0
      ? Math.round((llm.successfulRequests / llm.totalRequests) * 100)
      : 0;

  return (
    <div className="metrics-panel">
      {llm ? (
        <div className="metrics-group">
          <div className="metrics-group-title">{t('monitor.llmTitle')}</div>
          <div className="metrics-item metrics-item-chart">
            <RingChart percent={successRate} />
            <div className="metrics-item-details">
              <div>
                <span className="metrics-label">{t('monitor.totalRequests')}</span>
                <span className="metrics-value">{llm.totalRequests}</span>
              </div>
              <div>
                <span className="metrics-label">{t('monitor.avgLatencyMs')}</span>
                <span className="metrics-value">{llm.avgLatencyMs}ms</span>
              </div>
              <div>
                <span className="metrics-label">{t('monitor.maxLatencyMs')}</span>
                <span className="metrics-value">{llm.maxLatencyMs}ms</span>
              </div>
            </div>
          </div>
          <div className="metrics-trend">
            <TrendChart history={latencyHistory} />
          </div>
          <div className="metrics-trend-count">
            {latencyHistory.length > 0
              ? t('monitor.trendCount', { count: latencyHistory.length, max: Math.max(...latencyHistory) })
              : t('monitor.waitingMore')}
          </div>
        </div>
      ) : (
        !error && <div className="metrics-empty">{t('monitor.noData')}</div>
      )}

      {tools && (
        <div className="metrics-group">
          <div className="metrics-group-title">{t('monitor.toolCalls')}</div>
          <div className="metrics-grid">
            <div className="metrics-item">
              <span className="metrics-label">{t('monitor.totalCalls')}</span>
              <span className="metrics-value">{tools.totalCalls}</span>
            </div>
            <div className="metrics-item">
              <span className="metrics-label">{t('monitor.failed')}</span>
              <span className="metrics-value">{tools.failedCalls}</span>
            </div>
          </div>
          {tools.details.length > 0 && <ToolBarChart details={tools.details} />}
        </div>
      )}

      {error && <div className="metrics-error">{t('monitor.fetchFailed', { err: error })}</div>}
      {updateTime && (
        <div className="metrics-update-time">{t('monitor.updatedAt', { time: updateTime })}</div>
      )}
    </div>
  );
}

// ============================================================================
// 子组件:成功率环形图
// ============================================================================

/** 环形图颜色:≥90% 绿 / ≥70% 黄 / 其余红(对齐旧版 _getRingColor) */
function ringColor(percent: number): string {
  if (percent >= 90) return '#4caf50';
  if (percent >= 70) return '#ff9800';
  return '#f44336';
}

function RingChart({ percent }: { percent: number }) {
  const { t } = useI18n();
  const pct = Math.min(Math.max(percent, 0), 100);
  // 周长 = 2 * PI * 15.9155 ≈ 100,strokeDasharray 直接按百分比
  return (
    <svg className="metrics-ring" viewBox="0 0 36 36" aria-label={`${t('monitor.successRate')} ${pct}%`}>
      <circle className="metrics-ring-bg" cx="18" cy="18" r="15.9155" />
      <circle
        className="metrics-ring-fg"
        cx="18"
        cy="18"
        r="15.9155"
        style={{ strokeDasharray: `${pct} ${100 - pct}`, stroke: ringColor(pct) }}
      />
      <text
        className="metrics-ring-text"
        x="18"
        y="18"
        textAnchor="middle"
        dominantBaseline="central"
        style={{ fill: ringColor(pct) }}
      >
        {pct}%
      </text>
    </svg>
  );
}

// ============================================================================
// 子组件:延迟趋势折线图(SVG 面积图)
// ============================================================================

function TrendChart({ history }: { history: number[] }) {
  const { t } = useI18n();
  if (history.length < 2) {
    return <div className="metrics-trend-empty">{t('monitor.waitingMore')}</div>;
  }

  const values = history.slice(-MAX_TREND_POINTS);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const chartW = CHART_WIDTH - CHART_PADDING * 2;
  const chartH = CHART_HEIGHT - CHART_PADDING * 2;

  // 折线点
  const points = values.map((v, i) => {
    const x = CHART_PADDING + (i / (values.length - 1)) * chartW;
    const y = CHART_PADDING + chartH - ((v - min) / range) * chartH;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  // 面积图:折线 + 底部(右→左) + 闭合
  const areaPoints = [
    ...points,
    `${CHART_WIDTH - CHART_PADDING},${CHART_HEIGHT - CHART_PADDING}`,
    `${CHART_PADDING},${CHART_HEIGHT - CHART_PADDING}`,
    points[0],
  ];
  const last = points[points.length - 1].split(',');

  return (
    <svg
      className="metrics-trend-svg"
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      preserveAspectRatio="none"
    >
      <polyline className="metrics-trend-area" points={areaPoints.join(' ')} />
      <polyline className="metrics-trend-line" points={points.join(' ')} />
      <circle cx={last[0]} cy={last[1]} r="2.5" className="metrics-trend-dot" />
    </svg>
  );
}

// ============================================================================
// 子组件:工具调用水平条形图
// ============================================================================

function ToolBarChart({ details }: { details: ToolUsageDetail[] }) {
  const maxCount = Math.max(...details.map((t) => t.count), 1);
  return (
    <div className="metrics-bar-list">
      {details.map((t) => {
        const pct = (t.count / maxCount) * 100;
        return (
          <div className="metrics-bar-row" key={t.name}>
            <span className="metrics-bar-label" title={t.name}>
              {t.name}
            </span>
            <div className="metrics-bar-track">
              <div
                className="metrics-bar-fill"
                style={{ width: `${Math.max(pct, 6)}%` }}
              >
                <span className="metrics-bar-count">{t.count}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// 工具函数
// ============================================================================

/** 追加延迟采样点(保留最近 MAX_TREND_POINTS 个),返回新数组 */
function pushLatencySample(prev: number[], value: number): number[] {
  return [...prev.slice(-(MAX_TREND_POINTS - 1)), value];
}

/** 格式化为 HH:mm:ss */
function formatTime(d: Date): string {
  const pad = (x: number) => x.toString().padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
