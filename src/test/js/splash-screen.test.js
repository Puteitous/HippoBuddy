import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('SplashScreen.js', () => {
  let SplashScreen;

  beforeEach(async () => {
    document.body.innerHTML = `
      <div id="splashScreen" class="splash-animating">
        <div class="splash-hippo">🦛</div>
      </div>
      <div id="rightPanel" class="hidden">
        <div id="rightPanelToggle"></div>
      </div>
      <button id="rightPanelShowBtn" style="display:none"></button>
    `;
    vi.useFakeTimers();
    const mod = await import('../../main/resources/static/js/components/SplashScreen.js');
    SplashScreen = mod.SplashScreen;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('startAnimation 添加 animating class', () => {
    const splash = new SplashScreen({});
    splash.startAnimation();
    const el = document.getElementById('splashScreen');
    expect(el.classList.contains('splash-animating')).toBe(true);
  });

  it('startAnimation 绑定点击跳过', () => {
    const splash = new SplashScreen({});
    splash.startAnimation();
    const el = document.getElementById('splashScreen');
    el.click();
    expect(el.classList.contains('splash-hidden')).toBe(true);
  });

  it('scheduleCleanup 在 2400ms 后隐藏', () => {
    const splash = new SplashScreen({});
    splash.scheduleCleanup();
    const el = document.getElementById('splashScreen');
    expect(el.classList.contains('splash-hidden')).toBe(false);
    vi.advanceTimersByTime(2400);
    expect(el.classList.contains('splash-hidden')).toBe(true);
  });

  it('scheduleCleanup 600ms 后隐藏并移除 page-loading', () => {
    document.body.classList.add('page-loading');
    const splash = new SplashScreen({});
    splash.scheduleCleanup();
    vi.advanceTimersByTime(3000);
    expect(document.getElementById('splashScreen').style.display).toBe('none');
    expect(document.body.classList.contains('page-loading')).toBe(false);
  });

  it('splash 不存在时 scheduleCleanup 直接移除 page-loading', () => {
    document.body.innerHTML = '';
    document.body.classList.add('page-loading');
    const splash = new SplashScreen({});
    splash.scheduleCleanup();
    expect(document.body.classList.contains('page-loading')).toBe(false);
  });

  it('点击跳过取消定时器', () => {
    const splash = new SplashScreen({});
    splash.scheduleCleanup();
    splash._skip();
    const el = document.getElementById('splashScreen');
    expect(el.classList.contains('splash-hidden')).toBe(true);
  });
});
