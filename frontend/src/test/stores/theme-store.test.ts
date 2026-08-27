import { describe, it, expect, beforeEach, vi } from 'vitest';
import { desktopBridge } from '@/utils/desktop-bridge';
import { useThemeStore } from '@/stores/themeStore';

vi.mock('@/utils/desktop-bridge', () => ({
  desktopBridge: {
    getTheme: vi.fn(async () => null),
    setTheme: vi.fn(async () => {}),
  },
}));

function reset() {
  localStorage.removeItem('hippo-theme');
  useThemeStore.setState({ theme: 'system', preferredDark: 'dark' });
}

describe('themeStore', () => {
  beforeEach(() => {
    localStorage.clear();
    document.cookie = 'hippo-theme=; path=/; max-age=0';
    vi.mocked(desktopBridge.getTheme).mockClear();
    vi.mocked(desktopBridge.setTheme).mockClear();
  });

  it('applyTheme 持久化到 localStorage 并应用 data-theme', () => {
    reset();
    useThemeStore.getState().applyTheme('dark');
    expect(useThemeStore.getState().theme).toBe('dark');
    expect(useThemeStore.getState().preferredDark).toBe('dark');
    expect(localStorage.getItem('hippo-theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(desktopBridge.setTheme).toHaveBeenCalledWith('dark');
  });

  it('toggleTheme: 暗色 → light → 偏好暗色(dark)', () => {
    reset();
    useThemeStore.getState().applyTheme('dark');
    expect(useThemeStore.getState().toggleTheme()).toBe('light');
    expect(useThemeStore.getState().theme).toBe('light');
    // light 再 toggle 回到偏好暗色
    expect(useThemeStore.getState().toggleTheme()).toBe('dark');
  });

  it('toggleTheme: 预设窗口模式(glass/midnight)同样视为暗色分支', () => {
    reset();
    useThemeStore.getState().applyTheme('glass');
    expect(useThemeStore.getState().toggleTheme()).toBe('light');
    useThemeStore.getState().applyTheme('midnight');
    expect(useThemeStore.getState().toggleTheme()).toBe('light');
  });

  it('initTheme: 本地有主题时使用之', async () => {
    reset();
    localStorage.setItem('hippo-theme', 'dark');
    await useThemeStore.getState().initTheme();
    expect(useThemeStore.getState().theme).toBe('dark');
  });

  it('system 主题不调用 setTheme', () => {
    reset();
    useThemeStore.getState().applyTheme('system');
    expect(useThemeStore.getState().theme).toBe('system');
    expect(desktopBridge.setTheme).not.toHaveBeenCalled();
  });
});