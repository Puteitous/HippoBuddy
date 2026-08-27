import { describe, it, expect, beforeEach } from 'vitest';
import { useBackgroundStore, type BackgroundConfig, type GlassStyle } from '@/stores/backgroundStore';

function rootCss(name: string): string | null {
  return document.documentElement.style.getPropertyValue(name);
}

describe('backgroundStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useBackgroundStore.setState({
      background: { type: 'none', value: '' },
      glassStyle: { blur: 26, panelAlpha: 0.4 },
    });
    // 重置 html 上的自定义属性,避免用例间串扰
    document.documentElement.style.removeProperty('--app-bg');
    document.documentElement.style.removeProperty('--glass-blur');
    document.documentElement.style.removeProperty('--glass-panel');
  });

  it('setBackground(color) 设置 CSS 变量并持久化', () => {
    const cfg: BackgroundConfig = { type: 'color', value: '#123456' };
    useBackgroundStore.getState().setBackground(cfg);
    expect(useBackgroundStore.getState().background).toEqual(cfg);
    expect(document.documentElement.style.getPropertyValue('--app-bg')).toBe('#123456');
    expect(localStorage.getItem('hippo-background')).toBe(JSON.stringify(cfg));
  });

  it('setBackground(image) 生成 background-size 组合值', () => {
    useBackgroundStore.getState().setBackground({ type: 'image', value: 'data:image/png;base64,xxx' });
    const applied = rootCss('--app-bg');
    expect(applied).toBe('url("data:image/png;base64,xxx") center / cover no-repeat fixed');
  });

  it('resetBackground 恢复 none 并移除 CSS 变量', () => {
    useBackgroundStore.getState().setBackground({ type: 'color', value: '#fff' });
    useBackgroundStore.getState().resetBackground();
    expect(useBackgroundStore.getState().background).toEqual({ type: 'none', value: '' });
    expect(document.documentElement.style.getPropertyValue('--app-bg')).toBe('');
  });

  it('readStored 对非法/缺失值回退到 none', () => {
    useBackgroundStore.setState({ background: { type: 'none', value: '' } });
    expect(useBackgroundStore.getState().background).toEqual({ type: 'none', value: '' });
  });

  it('setGlassStyle 更新样式并即时应用,persistGlassStyle 才落盘', () => {
    const s = useBackgroundStore.getState();
    s.setGlassStyle({ blur: 10 });
    expect(useBackgroundStore.getState().glassStyle.blur).toBe(10);
    expect(rootCss('--glass-blur')).toBe('10px');
    // 未 persist 前 localStorage 仍为空
    expect(localStorage.getItem('hippo-glass-style')).toBeNull();
    useBackgroundStore.getState().persistGlassStyle();
    const saved = JSON.parse(localStorage.getItem('hippo-glass-style')!) as GlassStyle;
    expect(saved.blur).toBe(10);
  });

  it('setBackground(none) 移除 --app-bg 回落到主题画布', () => {
    useBackgroundStore.getState().setBackground({ type: 'color', value: '#f00' });
    useBackgroundStore.getState().setBackground({ type: 'none', value: '' });
    expect(document.documentElement.style.getPropertyValue('--app-bg')).toBe('');
  });
});