import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkspaceUI } from '../../main/resources/static/js/components/WorkspaceUI.js';

describe('WorkspaceUI.js', () => {
  describe('truncatePath', () => {
    it('短路径不做截断', () => {
      expect(WorkspaceUI.truncatePath('/home/user/project')).toBe('/home/user/project');
    });

    it('超长路径截断中间部分', () => {
      const long = '/home/user/very/long/path/to/some/project/frontend/src';
      const result = WorkspaceUI.truncatePath(long, 30);
      expect(result.length).toBeLessThanOrEqual(long.length);
      expect(result).toContain('...');
    });

    it('路径恰好等于 maxLen 时不截断', () => {
      const path = '/1234567890123456789012345678901234567890123';
      const result = WorkspaceUI.truncatePath(path, 45);
      expect(result).toBe(path);
    });

    it('空字符串返回空字符串', () => {
      expect(WorkspaceUI.truncatePath('')).toBe('');
    });

    it('仅两层的路径即使超长也不截断', () => {
      const long = '/a' + 'x'.repeat(100);
      expect(WorkspaceUI.truncatePath(long, 45)).toBe(long);
    });
  });

  describe('show / hide', () => {
    let ui;

    beforeEach(() => {
      document.body.innerHTML = `
        <div id="workspaceIndicator" style="display:none">
          <span id="workspacePath"></span>
          <button id="workspaceClear"></button>
        </div>
        <button id="desktopOpenFolderBtn" style="display:none"></button>
      `;
      ui = new WorkspaceUI({});
    });

    it('show 设置路径并显示 indicator', () => {
      ui.show('/home/user/project');
      const indicator = document.getElementById('workspaceIndicator');
      const pathEl = document.getElementById('workspacePath');
      expect(indicator.style.display).toBe('');
      expect(pathEl.textContent).toBe('/home/user/project');
      expect(pathEl.title).toBe('/home/user/project');
    });

    it('hide 隐藏 indicator', () => {
      const indicator = document.getElementById('workspaceIndicator');
      ui.show('/test');
      ui.hide();
      expect(indicator.style.display).toBe('none');
    });

    it('show 对超长路径做截断', () => {
      const long = '/home/user/very/long/path/to/some/project/frontend/src';
      ui.show(long);
      const pathEl = document.getElementById('workspacePath');
      expect(pathEl.textContent).toContain('...');
      expect(pathEl.title).toBe(long);
    });
  });

  describe('事件绑定', () => {
    it('onClear 在点击清除按钮时触发', () => {
      document.body.innerHTML = `
        <div id="workspaceIndicator" style="display:block">
          <span id="workspacePath"></span>
          <button id="workspaceClear"></button>
        </div>
        <button id="desktopOpenFolderBtn" style="display:none"></button>
      `;
      const onClear = vi.fn();
      new WorkspaceUI({ onClear });
      document.getElementById('workspaceClear').click();
      expect(onClear).toHaveBeenCalledTimes(1);
    });
  });
});
