import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MetricsPanel, __resetMetricsPersistence } from '@/components/MetricsPanel';
import type { LlmMetrics, MetricsResponse, ToolUsageDetail } from '@/types';

const { metricsApiProps } = vi.hoisted(() => ({
  metricsApiProps: { get: vi.fn() },
}));

vi.mock('@/api/client', () => ({
  metricsApi: metricsApiProps,
}));

/** 构造 LLM 指标 */
function mkLlm(total: number, succ: number, avg: number, max: number): LlmMetrics {
  return {
    totalRequests: total,
    successfulRequests: succ,
    failedRequests: total - succ,
    avgLatencyMs: avg,
    minLatencyMs: avg,
    maxLatencyMs: max,
  };
}

/** 构造工具指标(内层对象,调用处 tools: mkTools(...)) */
function mkTools(total: number, failed: number, details: ToolUsageDetail[]): NonNullable<MetricsResponse['tools']> {
  return { totalCalls: total, successfulCalls: total - failed, failedCalls: failed, jsonParseErrors: 0, jsonParseErrorTools: 0, repeatedParseErrors: 0, rePromptRecovery: 0, details };
}

const noMetrics: MetricsResponse = {};

beforeEach(() => {
  __resetMetricsPersistence();
  metricsApiProps.get.mockResolvedValue({ llm: mkLlm(10, 10, 100, 150) });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('MetricsPanel', () => {
  it('首屏拉取并渲染 LLM 指标(总请求/平均/最大延迟/更新于)', async () => {
    render(<MetricsPanel />);
    expect(await screen.findByText('LLM 指标')).toBeInTheDocument();
    expect(screen.getByText('总请求')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('平均延迟')).toBeInTheDocument();
    expect(screen.getByText('100ms')).toBeInTheDocument();
    expect(screen.getByText('最大延迟')).toBeInTheDocument();
    expect(screen.getByText('150ms')).toBeInTheDocument();
    // 环形图 successRate = 100%
    expect(screen.getByLabelText('成功率 100%')).toBeInTheDocument();
    expect(screen.getByText(/更新于/)).toBeInTheDocument();
  });

  it('成功率按四舍五入百分比渲染(7/10 → 70%)', async () => {
    metricsApiProps.get.mockResolvedValue({ llm: mkLlm(10, 7, 80, 200) });
    render(<MetricsPanel />);
    await screen.findByText('LLM 指标');
    expect(screen.getByLabelText('成功率 70%')).toBeInTheDocument();
    expect(screen.getByText('70%')).toBeInTheDocument();
  });

  it('totalRequests 为 0 时成功率为 0 且不报错', async () => {
    metricsApiProps.get.mockResolvedValue({ llm: mkLlm(0, 0, 0, 0) });
    render(<MetricsPanel />);
    await screen.findByLabelText('成功率 0%');
    // 首次有数据已 push 0 均值样本? avg=0 不满足 >0,因此仅一次 Length=0 → trend 等待更多数据
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('llm 缺失时显示「暂无 LLM 指标」', async () => {
    metricsApiProps.get.mockResolvedValue({ tools: mkTools(3, 0, []) });
    render(<MetricsPanel />);
    expect(await screen.findByText('暂无 LLM 指标')).toBeInTheDocument();
  });

  it('数据为空且无错误时只显示空态与更新时间', async () => {
    metricsApiProps.get.mockResolvedValue(noMetrics);
    render(<MetricsPanel />);
    expect(await screen.findByText('暂无 LLM 指标')).toBeInTheDocument();
    expect(screen.getByText(/更新于/)).toBeInTheDocument();
    expect(screen.queryByText(/获取指标失败/)).not.toBeInTheDocument();
  });

  it('tools 存在时渲染工具调用分组与条形图', async () => {
    metricsApiProps.get.mockResolvedValue({
      llm: mkLlm(10, 10, 50, 80),
      tools: mkTools(15, 2, [
        { name: 'bash', count: 9, jsonParseErrors: 0, lastParseError: '' },
        { name: 'edit', count: 6, jsonParseErrors: 0, lastParseError: '' },
      ]),
    });
    render(<MetricsPanel />);
    expect(await screen.findByText('工具调用')).toBeInTheDocument();
    expect(screen.getByText('总调用')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText('失败')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    // 条形图:工具名 + 各自计数
    expect(screen.getByText('bash')).toBeInTheDocument();
    expect(screen.getByText('edit')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
    // 最大 9 的条满宽(100%),edit 为 66.67%
    const fills = document.querySelectorAll<HTMLElement>('.metrics-bar-fill');
    expect(fills).toHaveLength(2);
    expect(fills[0].style.width).toBe('100%');
    expect(fills[1].style.width).toBe('66.66666666666666%');
  });

  it('tools.details 为空时不渲染条形图', async () => {
    metricsApiProps.get.mockResolvedValue({ llm: mkLlm(5, 5, 40, 60), tools: mkTools(3, 0, []) });
    render(<MetricsPanel />);
    await screen.findByText('工具调用');
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(document.querySelector('.metrics-bar-list')).not.toBeInTheDocument();
  });

  it('拉取失败渲染错误文本', async () => {
    metricsApiProps.get.mockRejectedValue(new Error('boom'));
    render(<MetricsPanel />);
    expect(await screen.findByText('获取指标失败:boom')).toBeInTheDocument();
  });

  it('首次获取到数据后追加 1 个延迟采样点', async () => {
    metricsApiProps.get.mockResolvedValue({ llm: mkLlm(100, 100, 250, 300) });
    render(<MetricsPanel />);
    // 采样点 >0,但仅 1 点 <2,趋势图仍等待更多
    expect(await screen.findByText('1 次记录 · 最近 250ms')).toBeInTheDocument();
    expect(screen.getByText('等待更多数据…')).toBeInTheDocument();
  });
});

describe('MetricsPanel 自动轮询与延迟采样', () => {
  it('每 10 秒轮询;仅在新请求时追加采样点', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'clearTimeout', 'clearInterval'] });
    const base = mkLlm(100, 100, 250, 300);
    metricsApiProps.get
      .mockResolvedValueOnce({ llm: base }) // 首次:lastKnown=0 → 追加 250
      .mockResolvedValueOnce({ llm: base }) // total 不变 → 不追加
      .mockResolvedValueOnce({ llm: mkLlm(102, 102, 300, 320) }); // +2 → 追加 300

    render(<MetricsPanel />);
    // flush 首次 refresh 的异步 setData(多用几次微任务)
    await act(async () => {
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
    expect(metricsApiProps.get).toHaveBeenCalledTimes(1);
    expect(screen.getByText('1 次记录 · 最近 250ms')).toBeInTheDocument();

    // 轮询一次:total 未变,不追加
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(metricsApiProps.get).toHaveBeenCalledTimes(2);
    expect(screen.getByText('1 次记录 · 最近 250ms')).toBeInTheDocument();

    // 再轮询:total +2,追加 300 → 2 次
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
    expect(metricsApiProps.get).toHaveBeenCalledTimes(3);
    expect(screen.getByText('2 次记录 · 最近 300ms')).toBeInTheDocument();
  });
});