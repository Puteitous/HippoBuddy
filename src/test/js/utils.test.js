import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ==================== utils.js ====================
describe('utils.js', () => {
  describe('escapeHtml', () => {
    it('转义 HTML 特殊字符', async () => {
      const { escapeHtml } = await import('../../main/resources/static/js/utils.js');
      expect(escapeHtml('<script>alert("xss")</script>'))
        .toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
      expect(escapeHtml("it's a test")).toBe("it&#39;s a test");
      expect(escapeHtml('safe text')).toBe('safe text');
    });

    it('处理 null 和 undefined', async () => {
      const { escapeHtml } = await import('../../main/resources/static/js/utils.js');
      expect(escapeHtml(null)).toBe('');
      expect(escapeHtml(undefined)).toBe('');
    });

    it('forAttribute 模式额外转义单引号', async () => {
      const { escapeHtml } = await import('../../main/resources/static/js/utils.js');
      const result = escapeHtml("it's", true);
      expect(result).toBe('it&#39;s');
    });
  });

  describe('safeParseJSON', () => {
    it('解析合法 JSON', async () => {
      const { safeParseJSON } = await import('../../main/resources/static/js/utils.js');
      expect(safeParseJSON('{"a":1}')).toEqual({ a: 1 });
      expect(safeParseJSON('[1,2,3]')).toEqual([1, 2, 3]);
      expect(safeParseJSON('"string"')).toBe('string');
    });

    it('解析非法 JSON 返回 fallback', async () => {
      const { safeParseJSON } = await import('../../main/resources/static/js/utils.js');
      expect(safeParseJSON('not json', null)).toBeNull();
      expect(safeParseJSON('{invalid}', [])).toEqual([]);
    });

    it('解析非法 JSON 默认返回 null', async () => {
      const { safeParseJSON } = await import('../../main/resources/static/js/utils.js');
      expect(safeParseJSON('not json')).toBeNull();
    });
  });

  describe('formatTime', () => {
    it('格式化 Date 对象为 HH:MM 格式', async () => {
      const { formatTime } = await import('../../main/resources/static/js/utils.js');
      const date = new Date(2024, 0, 1, 14, 30, 0);
      const result = formatTime(date);
      expect(result).toMatch(/^\d{2}:\d{2}$/);
    });
  });

  describe('generateSessionId', () => {
    it('生成 web- 前缀的会话 ID', async () => {
      const { generateSessionId } = await import('../../main/resources/static/js/utils.js');
      const id = generateSessionId();
      expect(id).toMatch(/^web-\d+$/);
    });

    it('每次生成不同的 ID', async () => {
      const { generateSessionId } = await import('../../main/resources/static/js/utils.js');
      vi.useFakeTimers();
      const id1 = generateSessionId();
      vi.advanceTimersByTime(1);
      const id2 = generateSessionId();
      vi.useRealTimers();
      expect(id1).not.toBe(id2);
    });
  });

  describe('truncateText', () => {
    it('截断超过最大长度的文本', async () => {
      const { truncateText } = await import('../../main/resources/static/js/utils.js');
      expect(truncateText('这是一段很长的文本', 6)).toBe('这是一段很长...');
    });

    it('不超过最大长度时返回原文本', async () => {
      const { truncateText } = await import('../../main/resources/static/js/utils.js');
      expect(truncateText('短文本', 20)).toBe('短文本');
    });

    it('默认最大长度为 20', async () => {
      const { truncateText } = await import('../../main/resources/static/js/utils.js');
      expect(truncateText('a'.repeat(25))).toBe('a'.repeat(20) + '...');
    });
  });

  describe('debounce', () => {
    it('在等待期内多次调用只执行一次', async () => {
      const { debounce } = await import('../../main/resources/static/js/utils.js');
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      debounced();
      debounced();
      debounced();

      expect(fn).not.toHaveBeenCalled();

      await new Promise(resolve => setTimeout(resolve, 150));
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('传递正确的参数', async () => {
      const { debounce } = await import('../../main/resources/static/js/utils.js');
      const fn = vi.fn();
      const debounced = debounce(fn, 50);

      debounced('arg1', 'arg2');
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
    });
  });

  describe('createElement', () => {
    it('创建指定标签的元素', async () => {
      const { createElement } = await import('../../main/resources/static/js/utils.js');
      const el = createElement('div');
      expect(el.tagName).toBe('DIV');
    });

    it('设置 className', async () => {
      const { createElement } = await import('../../main/resources/static/js/utils.js');
      const el = createElement('span', 'my-class');
      expect(el.className).toBe('my-class');
    });

    it('设置 innerHTML', async () => {
      const { createElement } = await import('../../main/resources/static/js/utils.js');
      const el = createElement('div', '', '<p>content</p>');
      expect(el.innerHTML).toBe('<p>content</p>');
    });
  });
});