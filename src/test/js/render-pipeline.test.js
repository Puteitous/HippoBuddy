import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../main/resources/static/js/markdown-renderer.js', () => ({
  renderMarkdown: vi.fn(async (content) => `<p>${content}</p>`)
}));

describe('RenderPipeline.js', () => {
  let RenderPipeline;
  let mockChatUI;
  let pipeline;
  let container;

  beforeEach(async () => {
    mockChatUI = {
      renderToolCard: vi.fn((seg) => `<div class="tool-card">${seg.name}</div>`),
      renderToolTimelineRow: vi.fn((seg) => `<div class="tool-timeline-row">${seg.name}</div>`),
      bindToolCardEvents: vi.fn()
    };
    container = document.createElement('div');
    const mod = await import('../../main/resources/static/js/components/RenderPipeline.js');
    RenderPipeline = mod.RenderPipeline;
    pipeline = new RenderPipeline(mockChatUI, {});
    pipeline.setContainer(container);
  });

  describe('renderThinkingBubble', () => {
    it('已完成的思考返回 completed class', () => {
      const html = RenderPipeline.renderThinkingBubble({ type: 'thinking', content: '思考完毕', done: true });
      expect(html).toContain('thinking-row completed');
      expect(html).toContain('思考完毕');
      expect(html).toContain('已思考');
    });

    it('正在思考的返回 streaming class', () => {
      const html = RenderPipeline.renderThinkingBubble({ type: 'thinking', content: '思考中...', done: false });
      expect(html).toContain('thinking-row streaming');
      expect(html).toContain('思考中');
    });

    it('内容中的 HTML 被转义', () => {
      const html = RenderPipeline.renderThinkingBubble({ type: 'thinking', content: '<script>alert(1)</script>', done: true });
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });

    it('连续换行被合并', () => {
      const html = RenderPipeline.renderThinkingBubble({ type: 'thinking', content: 'a\n\n\n\nb', done: true });
      expect(html).not.toContain('a\n\nb');
    });
  });

  describe('scheduleRender / flush', () => {
    it('scheduleRender 触发 doRender（初始 _lastRenderTime=0，未到节流窗口）', () => {
      pipeline.scheduleRender([{ type: 'text', content: 'hi' }], '');
      expect(pipeline._pendingRender).toBeNull();
    });

    it('flush 执行挂起的渲染', async () => {
      pipeline.scheduleRender([{ type: 'text', content: 'hi' }], '');
      pipeline.flush();
      expect(pipeline._pendingRender).toBeNull();
    });

    it('flush 带参数直接设置 pending 并渲染', async () => {
      pipeline.flush([{ type: 'text', content: 'flush test' }], '');
      expect(pipeline._pendingRender).toBeNull();
    });
  });

  describe('setContainer', () => {
    it('设置 container', () => {
      const div = document.createElement('div');
      pipeline.setContainer(div);
      expect(pipeline.container).toBe(div);
    });
  });

  describe('markTextOnly', () => {
    it('设置 _pendingIsTextOnly', () => {
      pipeline.markTextOnly();
      expect(pipeline._pendingIsTextOnly).toBe(true);
    });
  });

  describe('destroy', () => {
    it('清理定时器和引用', () => {
      pipeline.scheduleRender([], 'test');
      pipeline.destroy();
      expect(pipeline._destroyed).toBe(true);
      expect(pipeline.container).toBeNull();
    });
  });

  describe('renderFinal', () => {
    it('清空定时器后执行最终渲染', async () => {
      const segs = [{ type: 'text', content: 'final' }];
      await pipeline.renderFinal(segs, '');
      expect(container.innerHTML).toContain('final');
    });

    it('空 segments 和 currentText 渲染空 streaming-region', async () => {
      await pipeline.renderFinal([], '');
      const sr = container.querySelector('.streaming-region');
      expect(sr).toBeDefined();
      expect(sr.innerHTML).toBe('');
    });
  });
});
