import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ToolTimelineConfirmation } from '@/components/tool-renderers/ToolTimelineConfirmation';
import type { BashToolConfirmationPayload, DeleteFileToolConfirmationPayload } from '@/types/sse';

// 共享 mock 状态（vi.mock hoisting 需用 vi.hoisted 定义外部变量）
const { appState, chatState, apiMocks, ApiError, translateMock } = vi.hoisted(() => {
  const app = { currentSessionId: 's1' as string | null };
  const chat = {
    resolveToolConfirmation: vi.fn(),
    setIsSending: vi.fn(),
    handleSseEvent: vi.fn(),
  };
  const api = { confirmTool: vi.fn() };
  class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  const dict: Record<string, string> = {
    'blocker.rm': '危险命令 rm',
    'blocker.write': '写入非工作区文件',
  };
  const translate = vi.fn((key: string, params?: Record<string, string | number>) => {
    const base = dict[key];
    if (base === undefined) return key;
    if (!params) return base;
    return Object.entries(params).reduce(
      (s, [k, v]) => s.replace(`{${k}}`, String(v)),
      base,
    );
  });
  return { appState: app, chatState: chat, apiMocks: api, ApiError, translateMock: translate };
});

vi.mock('@/stores/appStore', () => ({
  useAppStore: (sel: (s: { currentSessionId: string | null }) => unknown) =>
    sel(appState),
}));
vi.mock('@/stores/chatStore', () => ({
  useChatStore: Object.assign(
    (sel: (s: typeof chatState) => unknown) => sel(chatState),
    { getState: () => chatState },
  ),
}));
vi.mock('@/api/client', () => ({
  chatApi: apiMocks,
}));
vi.mock('@/api/error', () => ({
  ApiError,
}));
vi.mock('@/i18n', () => ({
  translate: translateMock,
}));
vi.mock('@/components/FileIcon', () => ({
  FileIcon: () => <span data-testid="folder-icon" />,
}));
vi.mock('@/components/FileTypeIcon', () => ({
  FileTypeIcon: () => <span data-testid="file-icon" />,
}));

const bashPayload: BashToolConfirmationPayload = {
  confirmId: 'cb1',
  command: 'rm -rf /tmp/x',
  riskLevel: 'high',
  riskReason: 'i18n:blocker.rm:cmd=rm%20-rf',
};

const deletePayload: DeleteFileToolConfirmationPayload = {
  confirmId: 'cb2',
  toolType: 'delete_file',
  totalCount: 3,
  files: ['/a.ts', '/b.go'],
  directories: ['/dir'],
  truncated: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  appState.currentSessionId = 's1';
  apiMocks.confirmTool.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ToolTimelineConfirmation - bash 形态', () => {
  it('渲染执行命令标题、命令与对应风险徽章', () => {
    render(<ToolTimelineConfirmation confirmationData={bashPayload} />);
    expect(screen.getByText('执行命令')).toBeInTheDocument();
    expect(screen.getByText('rm -rf /tmp/x')).toBeInTheDocument();
    expect(screen.getByText('高风险')).toBeInTheDocument();
  });

  it('riskLevel low → 低风险，medium 兜底 → 中风险', () => {
    const { rerender } = render(
      <ToolTimelineConfirmation
        confirmationData={{ ...bashPayload, riskLevel: 'low' }}
      />,
    );
    expect(screen.getByText('低风险')).toBeInTheDocument();
    rerender(
      <ToolTimelineConfirmation
        confirmationData={{ ...bashPayload, riskLevel: 'medium' }}
      />,
    );
    expect(screen.getByText('中风险')).toBeInTheDocument();
  });

  it('riskReason 用 i18n 前缀翻译 key 与参数', () => {
    render(<ToolTimelineConfirmation confirmationData={bashPayload} />);
    // blocker.rm → 危险命令 rm（参数 cmd 未在文案中占位）
    expect(screen.getByText('危险命令 rm')).toBeInTheDocument();
    expect(translateMock).toHaveBeenCalledWith('blocker.rm', { cmd: 'rm -rf' });
  });

  it('riskReason 无 i18n 前缀时原样展示', () => {
    render(
      <ToolTimelineConfirmation
        confirmationData={{ ...bashPayload, riskReason: '删除 .git 目录' }}
      />,
    );
    expect(screen.getByText('删除 .git 目录')).toBeInTheDocument();
  });

  it('bash 按钮文案为 拒绝 / 执行', () => {
    render(<ToolTimelineConfirmation confirmationData={bashPayload} />);
    expect(screen.getByRole('button', { name: '拒绝' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '执行' })).toBeInTheDocument();
  });
});

describe('ToolTimelineConfirmation - delete_file 形态', () => {
  it('渲染文件数与文件/目录列表（目录带 /）', () => {
    render(<ToolTimelineConfirmation confirmationData={deletePayload} />);
    // 「删除 N 个文件」中的数字由 <strong> 承载，断言其值
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('/a.ts')).toBeInTheDocument();
    expect(screen.getByText('/b.go')).toBeInTheDocument();
    expect(screen.getByText('/dir/')).toBeInTheDocument();
  });

  it('文件用按类型图标、目录用文件夹图标', () => {
    render(<ToolTimelineConfirmation confirmationData={deletePayload} />);
    expect(screen.getAllByTestId('file-icon').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('folder-icon').length).toBeGreaterThan(0);
  });

  it('delete_file 按钮文案为 保留 / 删除', () => {
    render(<ToolTimelineConfirmation confirmationData={deletePayload} />);
    expect(screen.getByRole('button', { name: '保留' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '删除' })).toBeInTheDocument();
  });
});

describe('ToolTimelineConfirmation - 交互', () => {
  it('点击 执行 → 清确认数据 + 恢复 isSending + confirmTool allow', async () => {
    render(<ToolTimelineConfirmation confirmationData={bashPayload} />);
    fireEvent.click(screen.getByRole('button', { name: '执行' }));
    expect(chatState.resolveToolConfirmation).toHaveBeenCalledWith('cb1');
    expect(chatState.setIsSending).toHaveBeenCalledWith(true);
    expect(apiMocks.confirmTool).toHaveBeenCalledWith(
      { sessionId: 's1', confirmId: 'cb1', decision: 'allow' },
      expect.any(Function),
    );
    await screen.findByRole('button', { name: '执行' }); // 等待异步完成恢复文案
    expect(chatState.setIsSending).toHaveBeenCalledWith(false);
  });

  it('点击 拒绝 → confirmTool deny', async () => {
    render(<ToolTimelineConfirmation confirmationData={bashPayload} />);
    fireEvent.click(screen.getByRole('button', { name: '拒绝' }));
    expect(apiMocks.confirmTool).toHaveBeenCalledWith(
      { sessionId: 's1', confirmId: 'cb1', decision: 'deny' },
      expect.any(Function),
    );
    await screen.findByRole('button', { name: '拒绝' });
  });

  it('delete_file 点击 删除 → confirmTool allow', async () => {
    render(<ToolTimelineConfirmation confirmationData={deletePayload} />);
    fireEvent.click(screen.getByRole('button', { name: '删除' }));
    expect(apiMocks.confirmTool).toHaveBeenCalledWith(
      { sessionId: 's1', confirmId: 'cb2', decision: 'allow' },
      expect.any(Function),
    );
    await screen.findByRole('button', { name: '删除' }); // 等待异步状态回写，避免 act 告警
  });

  it('currentSessionId 为 null 时不调用 confirmTool', () => {
    appState.currentSessionId = null;
    render(<ToolTimelineConfirmation confirmationData={bashPayload} />);
    fireEvent.click(screen.getByRole('button', { name: '执行' }));
    expect(apiMocks.confirmTool).not.toHaveBeenCalled();
  });

  it('提交期间按钮禁用并显示处理中', () => {
    // confirmTool 挂起不 resolve → submitting 保持 true
    apiMocks.confirmTool.mockReturnValue(new Promise(() => {}));
    render(<ToolTimelineConfirmation confirmationData={bashPayload} />);
    fireEvent.click(screen.getByRole('button', { name: '执行' }));
    expect(screen.getByRole('button', { name: '处理中…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '拒绝' })).toBeDisabled();
  });

  it('confirmTool 失败渲染错误并可重试', async () => {
    apiMocks.confirmTool.mockRejectedValue(new ApiError(400, 'bad request'));
    render(<ToolTimelineConfirmation confirmationData={bashPayload} />);
    fireEvent.click(screen.getByRole('button', { name: '执行' }));
    expect(await screen.findByText('[400] bad request')).toBeInTheDocument();
    // finally 恢复：按钮回到 执行 且可再次点击
    expect(screen.getByRole('button', { name: '执行' })).not.toBeDisabled();
  });

  it('重复点击：submitting 期间 action 保护', () => {
    apiMocks.confirmTool.mockReturnValue(new Promise(() => {}));
    render(<ToolTimelineConfirmation confirmationData={bashPayload} />);
    fireEvent.click(screen.getByRole('button', { name: '执行' }));
    // 已禁用，无法再触发；assert 仅调用一次
    // （此处二次 fireEvent 在禁用态不会触发，因为 disabled 阻止点击）
    const btn = screen.getByRole('button', { name: '处理中…' });
    fireEvent.click(btn);
    expect(apiMocks.confirmTool).toHaveBeenCalledTimes(1);
  });
});