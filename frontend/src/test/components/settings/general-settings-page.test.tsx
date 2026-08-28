import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { GeneralSettingsPage } from '@/components/settings/GeneralSettingsPage';

const k = (s: string) => s; // i18n t 恒等,用 key 断言,避免绑定具体文案

const { configApi, workspaceApi, dataDirApi, desktopBridge, toast, i18n, themeStore, appStore, bgStore } =
  vi.hoisted(() => {
    const themeStore = { theme: 'light', applyTheme: vi.fn() };
    const appStore = { panelLayout: 'preview-left', setPanelLayout: vi.fn() };
    const bgStore = {
      background: { type: 'none', value: '', size: 'cover' },
      setBackground: vi.fn(),
      resetBackground: vi.fn(),
      glassStyle: { blur: 12, panelAlpha: 0.7 },
      setGlassStyle: vi.fn(),
      persistGlassStyle: vi.fn(),
    };
    const i18n = {
      lang: 'zh',
      setLang: vi.fn(),
      t: vi.fn((s: string) => s),
    };
    return {
      configApi: { getFull: vi.fn(), updateFull: vi.fn() },
      workspaceApi: { getDefault: vi.fn(), setDefault: vi.fn() },
      dataDirApi: { get: vi.fn(), update: vi.fn() },
      desktopBridge: { openFileDialog: vi.fn(), openImageDialog: vi.fn(), readImageAsDataUrl: vi.fn() },
      toast: { showToast: vi.fn() },
      i18n,
      themeStore,
      appStore,
      bgStore,
    };
  });

vi.mock('@/api/client', () => ({ configApi, workspaceApi, dataDirApi }));
vi.mock('@/utils/desktop-bridge', () => ({ desktopBridge }));
vi.mock('@/utils/toastStore', () => ({ showToast: toast.showToast }));
vi.mock('@/stores/themeStore', () => ({ useThemeStore: (sel: (s: unknown) => unknown) => sel(themeStore) }));
vi.mock('@/stores/appStore', () => ({ useAppStore: (sel: (s: unknown) => unknown) => sel(appStore) }));
vi.mock('@/stores/backgroundStore', () => ({
  useBackgroundStore: (sel: (s: unknown) => unknown) => sel(bgStore),
}));
vi.mock('@/i18n', () => ({
  useI18n: () => ({ t: i18n.t, lang: i18n.lang }),
  i18nStore: { getState: () => ({ setLang: i18n.setLang }) },
  translate: (s: string) => s,
}));

/** 渲染出的两个文本输入:0=工作区,1=数据目录 */
function textInputs(container: HTMLElement): HTMLInputElement[] {
  return [...container.querySelectorAll<HTMLInputElement>('input[type="text"]')];
}

function lastUpdate() {
  const calls = configApi.updateFull.mock.calls;
  return calls[calls.length - 1] as [{ ui?: Record<string, unknown>; tools?: Record<string, unknown> }];
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  configApi.getFull.mockResolvedValue({});
  configApi.updateFull.mockResolvedValue({ success: true });
  workspaceApi.getDefault.mockResolvedValue({ path: '/ws' });
  workspaceApi.setDefault.mockResolvedValue({ path: '/ws2' });
  dataDirApi.get.mockResolvedValue({ path: '/dd' });
  dataDirApi.update.mockResolvedValue({ success: true, path: '/dd2' });
  desktopBridge.openFileDialog.mockResolvedValue('');
  desktopBridge.openImageDialog.mockResolvedValue('');
  themeStore.theme = 'light';
  themeStore.applyTheme.mockClear();
  appStore.panelLayout = 'preview-left';
  appStore.setPanelLayout.mockClear();
  bgStore.background = { type: 'none', value: '', size: 'cover' };
  bgStore.setBackground.mockClear();
  bgStore.resetBackground.mockClear();
  i18n.lang = 'zh';
  i18n.setLang.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('GeneralSettingsPage 加载', () => {
  it('加载中显示 modelLoading 文案', async () => {
    render(<GeneralSettingsPage />);
    expect(screen.getByText(k('settingsPage.modelLoading'))).toBeInTheDocument();
    await act(async () => {});
  });

  it('加载成功渲染标题并回填工作区/数据目录,默认展示模式与权限范围', async () => {
    configApi.getFull.mockResolvedValue({
      ui: { default_process_view: 'result' },
      tools: { mode: 'relaxed' },
    });
    const { container } = render(<GeneralSettingsPage />);
    await screen.findByText(k('settingsPage.generalTitle'));
    const [ws, dd] = textInputs(container);
    expect(ws.value).toBe('/ws');
    expect(dd.value).toBe('/dd');
    // 后端 result/relaxed 覆盖默认值
    expect((container.querySelector('select') as HTMLSelectElement).value).toBe('relaxed');
  });

  it('未回填失败的结果不影响其余字段(allSettled 容错)', async () => {
    workspaceApi.getDefault.mockRejectedValue(new Error('boom'));
    const { container } = render(<GeneralSettingsPage />);
    await screen.findByText(k('settingsPage.generalTitle'));
    const [ws, dd] = textInputs(container);
    expect(ws.value).toBe('');
    expect(dd.value).toBe('/dd');
  });
});

describe('GeneralSettingsPage 主题/背景/语言/布局', () => {
  it('点击主题按钮 → applyTheme 调用对应主题', async () => {
    render(<GeneralSettingsPage />);
    await screen.findByText(k('settingsPage.generalTitle'));
    fireEvent.click(screen.getByRole('button', { name: k('settingsPage.generalDark') }));
    expect(themeStore.applyTheme).toHaveBeenCalledWith('dark');
  });

  it('切语言按钮 → i18nStore.setLang', async () => {
    render(<GeneralSettingsPage />);
    await screen.findByText(k('settingsPage.generalTitle'));
    fireEvent.click(screen.getByRole('button', { name: k('settingsPage.generalLangEn') }));
    expect(i18n.setLang).toHaveBeenCalledWith('en');
  });

  it('布局按钮 → setPanelLayout(chat-left)', async () => {
    render(<GeneralSettingsPage />);
    await screen.findByText(k('settingsPage.generalTitle'));
    fireEvent.click(screen.getByRole('button', { name: k('settingsPage.generalChatLeft') }));
    expect(appStore.setPanelLayout).toHaveBeenCalledWith('chat-left');
  });

  it.each([
    // 各用例从非目标类型出发,确保能触发切换
    ['color', () => bgStore.setBackground, { type: 'gradient', value: 'linear' }],
    ['gradient', () => bgStore.setBackground, { type: 'color', value: '#fff' }],
    ['none', () => bgStore.resetBackground, { type: 'color', value: '#fff' }],
  ] as const)('背景切换到 %s → 调用对应 store', async (type, resolve, initial) => {
    Object.assign(bgStore, { background: { ...initial, size: 'cover' } });
    render(<GeneralSettingsPage />);
    await screen.findByText(k('settingsPage.generalTitle'));
    const name = `settingsPage.generalBg${type === 'none' ? 'None' : type === 'color' ? 'Color' : 'Gradient'}`;
    fireEvent.click(screen.getByRole('button', { name: k(name) }));
    expect(resolve()).toHaveBeenCalled();
  });

  it('切换到纯色背景:非法/空值回退默认色', async () => {
    render(<GeneralSettingsPage />);
    await screen.findByText(k('settingsPage.generalTitle'));
    fireEvent.click(screen.getByRole('button', { name: k('settingsPage.generalBgColor') }));
    expect(bgStore.setBackground).toHaveBeenCalledWith({ type: 'color', value: '#5b6bbf' });
  });

  it('背景为图片且有值时渲染预览/显示模式/移除按钮', async () => {
    Object.assign(bgStore, { background: { type: 'image', value: 'data:image/png;base64,AAA', size: 'cover' } });
    render(<GeneralSettingsPage />);
    await screen.findByText(k('settingsPage.generalTitle'));
    expect(screen.getByText(k('settingsPage.generalBgRemove'))).toBeInTheDocument();
    expect(screen.getByText(k('settingsPage.generalBgCover'))).toBeInTheDocument();
  });

  it('背景为图片且为空值时点选图片按钮,对话框取消(null)不改动背景', async () => {
    Object.assign(bgStore, { background: { type: 'image', value: '', size: 'cover' } });
    render(<GeneralSettingsPage />);
    await screen.findByText(k('settingsPage.generalTitle'));
    fireEvent.click(screen.getByRole('button', { name: k('settingsPage.generalBgPickImage') }));
    expect(desktopBridge.openImageDialog).toHaveBeenCalled();
    expect(bgStore.setBackground).not.toHaveBeenCalled();
  });
});

describe('GeneralSettingsPage 默认展示模式 / 权限范围', () => {
  it('切换展示模式 result → updateFull 携带 ui.default_process_view=result 并 toast 成功', async () => {
    render(<GeneralSettingsPage />);
    await screen.findByText(k('settingsPage.generalTitle'));
    fireEvent.click(screen.getByRole('button', { name: k('settingsPage.generalProcessViewResult') }));
    await waitFor(() => expect(configApi.updateFull).toHaveBeenCalled());
    expect(lastUpdate()[0].ui).toMatchObject({ default_process_view: 'result' });
    expect(toast.showToast).toHaveBeenCalledWith('settingsPage.generalProcessViewSavedResult', {
      type: 'success',
      duration: 2000,
    });
  });

  it('重复点击当前展示模式 → 不触发保存与 toast', async () => {
    render(<GeneralSettingsPage />);
    await screen.findByText(k('settingsPage.generalTitle'));
    fireEvent.click(screen.getByRole('button', { name: k('settingsPage.generalProcessViewFull') }));
    await act(async () => {});
    expect(configApi.updateFull).not.toHaveBeenCalled();
    expect(toast.showToast).not.toHaveBeenCalled();
  });

  it('切换权限范围 relaxed → updateFull 携带 tools.mode=relaxed', async () => {
    const { container } = render(<GeneralSettingsPage />);
    await screen.findByText(k('settingsPage.generalTitle'));
    fireEvent.change(container.querySelector('select') as HTMLSelectElement, {
      target: { value: 'relaxed' },
    });
    await waitFor(() => expect(configApi.updateFull).toHaveBeenCalled());
    expect(lastUpdate()[0].tools).toMatchObject({ mode: 'relaxed' });
    expect(toast.showToast).toHaveBeenCalledWith('settingsPage.generalScopeRelaxedToast', {
      type: 'success',
      duration: 2000,
    });
  });

  it('保存展示模式失败 → toast 错误', async () => {
    configApi.updateFull.mockRejectedValue(new Error('boom'));
    render(<GeneralSettingsPage />);
    await screen.findByText(k('settingsPage.generalTitle'));
    fireEvent.click(screen.getByRole('button', { name: k('settingsPage.generalProcessViewResult') }));
    await waitFor(() => expect(toast.showToast).toHaveBeenCalled());
    expect(String(toast.showToast.mock.calls[0][0])).toMatch(/^settingsPage.generalProcessViewSaveFailedError: boom/);
  });
});

describe('GeneralSettingsPage 工作区 / 数据目录', () => {
  it('工作区输入失焦 → setDefault 并回填结果', async () => {
    const { container } = render(<GeneralSettingsPage />);
    await screen.findByText(k('settingsPage.generalTitle'));
    const ws = textInputs(container)[0];
    fireEvent.change(ws, { target: { value: '/new-ws' } });
    fireEvent.blur(ws);
    await waitFor(() => expect(workspaceApi.setDefault).toHaveBeenCalledWith('/new-ws'));
    expect(ws.value).toBe('/ws2');
    expect(toast.showToast).toHaveBeenCalledWith('settingsPage.generalWorkspaceSaved', { type: 'success', duration: 2000 });
  });

  it('工作区输入为空时保存静默跳过', async () => {
    const { container } = render(<GeneralSettingsPage />);
    await screen.findByText(k('settingsPage.generalTitle'));
    const ws = textInputs(container)[0];
    fireEvent.change(ws, { target: { value: '   ' } });
    fireEvent.blur(ws);
    await act(async () => {});
    expect(workspaceApi.setDefault).not.toHaveBeenCalled();
  });

  it('浏览工作区:对话框返回路径 → setDefault', async () => {
    desktopBridge.openFileDialog.mockResolvedValue('/picked');
    render(<GeneralSettingsPage />);
    await screen.findByText(k('settingsPage.generalTitle'));
    fireEvent.click(screen.getAllByTitle(k('settingsPage.generalBrowseFolder'))[0]);
    await waitFor(() => expect(workspaceApi.setDefault).toHaveBeenCalledWith('/picked'));
  });

  it('数据目录确认后 → update 成功显示重启提示', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { container } = render(<GeneralSettingsPage />);
    await screen.findByText(k('settingsPage.generalTitle'));
    const dd = textInputs(container)[1];
    fireEvent.change(dd, { target: { value: '/new-dd' } });
    fireEvent.blur(dd);
    await waitFor(() => expect(dataDirApi.update).toHaveBeenCalledWith('/new-dd'));
    expect(screen.getByText(k('settingsPage.generalDataDirRestart'))).toBeInTheDocument();
    expect(toast.showToast).toHaveBeenCalledWith('settingsPage.generalDataDirUpdated', { type: 'success', duration: 2500 });
  });

  it('数据目录确认框被取消 → 不调用 update', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { container } = render(<GeneralSettingsPage />);
    await screen.findByText(k('settingsPage.generalTitle'));
    const dd = textInputs(container)[1];
    fireEvent.change(dd, { target: { value: '/new-dd' } });
    fireEvent.blur(dd);
    await act(async () => {});
    expect(dataDirApi.update).not.toHaveBeenCalled();
  });
});