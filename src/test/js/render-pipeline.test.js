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
      renderToolTimelineRow: vi.fn((seg) => `<div class="tool-timeline-item" data-tool-name="${seg.name}"><div class="tool-timeline-row">${seg.name}</div></div>`),
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

  // ==================== 指纹 ====================

  describe('_segFingerprint', () => {
    it('thinking 指纹包含 done 状态和内容长度', () => {
      const fp1 = pipeline._segFingerprint(0, { type: 'thinking', content: 'abc', done: false });
      const fp2 = pipeline._segFingerprint(0, { type: 'thinking', content: 'abc', done: true });
      expect(fp1).not.toBe(fp2);
      const fp3 = pipeline._segFingerprint(0, { type: 'thinking', content: 'abcd', done: false });
      expect(fp1).not.toBe(fp3);
    });

    it('tool 指纹包含 name, result, confirmationData, progressLines', () => {
      const fp1 = pipeline._segFingerprint(0, { type: 'tool', name: 'bash', result: 'running' });
      const fp2 = pipeline._segFingerprint(0, { type: 'tool', name: 'bash', result: 'success' });
      expect(fp1).not.toBe(fp2);

      const fp3 = pipeline._segFingerprint(0, { type: 'tool', name: 'bash', result: 'running', confirmationData: { confirmId: 'x' } });
      expect(fp1).not.toBe(fp3);

      const fp4 = pipeline._segFingerprint(0, { type: 'tool', name: 'bash', result: 'running', progressLines: ['a'] });
      expect(fp1).not.toBe(fp4);
    });

    it('text 指纹包含内容长度', () => {
      const fp1 = pipeline._segFingerprint(0, { type: 'text', content: 'hello' });
      const fp2 = pipeline._segFingerprint(0, { type: 'text', content: 'hello!' });
      expect(fp1).not.toBe(fp2);
    });
  });

  // ==================== 渲染计划 ====================

  describe('_buildPlan', () => {
    it('单个 text segment 生成单条 plan', () => {
      const plan = pipeline._buildPlan([{ type: 'text', content: 'hi' }]);
      expect(plan).toHaveLength(1);
      expect(plan[0].type).toBe('text');
      expect(plan[0].key).toBe('seg-0');
    });

    it('连续 tool segment 合并为 timeline 组', () => {
      const segs = [
        { type: 'tool', name: 'bash', result: 'running' },
        { type: 'tool', name: 'read_file', result: 'success' }
      ];
      const plan = pipeline._buildPlan(segs);
      expect(plan).toHaveLength(1);
      expect(plan[0].type).toBe('timeline');
      expect(plan[0].items).toHaveLength(2);
      expect(plan[0].items[0].segIdx).toBe(0);
      expect(plan[0].items[1].segIdx).toBe(1);
    });

    it('特殊 tool（todo_write/ask_user）独立为 tool-card', () => {
      const segs = [
        { type: 'tool', name: 'todo_write', args: '{}' },
        { type: 'tool', name: 'ask_user', args: '{}' }
      ];
      const plan = pipeline._buildPlan(segs);
      expect(plan).toHaveLength(2);
      expect(plan[0].type).toBe('tool-card');
      expect(plan[1].type).toBe('tool-card');
    });

    it('thinking + tool + text 混合排列正确', () => {
      const segs = [
        { type: 'thinking', content: '思考', done: true },
        { type: 'tool', name: 'bash', result: 'running' },
        { type: 'text', content: '结果' }
      ];
      const plan = pipeline._buildPlan(segs);
      expect(plan).toHaveLength(3);
      expect(plan[0].type).toBe('thinking');
      expect(plan[1].type).toBe('timeline');
      expect(plan[2].type).toBe('text');
    });

    it('tool 夹在 text 之间分为两组 timeline', () => {
      const segs = [
        { type: 'text', content: 'a' },
        { type: 'tool', name: 'bash', result: 'running' },
        { type: 'text', content: 'b' },
        { type: 'tool', name: 'read_file', result: 'running' }
      ];
      const plan = pipeline._buildPlan(segs);
      expect(plan).toHaveLength(4);
      expect(plan[0].type).toBe('text');
      expect(plan[1].type).toBe('timeline');
      expect(plan[1].items).toHaveLength(1);
      expect(plan[2].type).toBe('text');
      expect(plan[3].type).toBe('timeline');
      expect(plan[3].items).toHaveLength(1);
    });
  });

  // ==================== 增量 DOM 同步 ====================

  describe('增量更新', () => {
    it('新增 segment 追加 render-unit', async () => {
      await pipeline.renderFinal([{ type: 'text', content: 'hello' }], '');
      const units = container.querySelectorAll('.render-unit');
      expect(units).toHaveLength(1);
      expect(units[0].dataset.unit).toBe('seg-0');
      expect(container.textContent).toContain('hello');
    });

    it('新增第二个 segment 时保留第一个的 DOM 节点', async () => {
      // 第一次渲染
      await pipeline.renderFinal([{ type: 'text', content: 'first' }], '');
      const firstUnit = container.querySelector('.render-unit');
      const firstRef = firstUnit; // 保存引用

      // 第二次渲染（追加一个 segment）
      await pipeline.renderFinal([
        { type: 'text', content: 'first' },
        { type: 'text', content: 'second' }
      ], '');

      const units = container.querySelectorAll('.render-unit');
      expect(units).toHaveLength(2);
      // 第一个节点应是同一个 DOM 引用（未重建）
      expect(units[0]).toBe(firstRef);
      expect(container.textContent).toContain('first');
      expect(container.textContent).toContain('second');
    });

    it('未变化的 segment 保留交互状态（class 不被清除）', async () => {
      // 渲染一个 thinking（completed 状态支持展开）
      await pipeline.renderFinal([
        { type: 'thinking', content: '思考', done: true },
        { type: 'text', content: '结果' }
      ], '');

      // 模拟用户展开 thinking row
      const thinkingRow = container.querySelector('.thinking-row.completed');
      thinkingRow.classList.add('expanded');

      // 再渲染一次，thinking 不变，text 变
      await pipeline.renderFinal([
        { type: 'thinking', content: '思考', done: true },
        { type: 'text', content: '结果更新' }
      ], '');

      // thinking 的 expanded 状态应保留
      const updatedRow = container.querySelector('.thinking-row.completed');
      expect(updatedRow.classList.contains('expanded')).toBe(true);
    });

    it('timeline 组内单个 tool 更新时其他 tool 保留状态', async () => {
      // 渲染两个 tool
      await pipeline.renderFinal([
        { type: 'tool', name: 'bash', result: 'running' },
        { type: 'tool', name: 'read_file', result: 'running' }
      ], '');

      const timelineItems = container.querySelectorAll('.tool-timeline-row');
      expect(timelineItems).toHaveLength(2);

      // 模拟用户展开第二个 tool
      const secondItem = container.querySelector('[data-timeline-seg="1"]');
      secondItem.classList.add('expanded');

      // 更新第一个 tool（从 running → success），第二个不变
      await pipeline.renderFinal([
        { type: 'tool', name: 'bash', result: 'success' },
        { type: 'tool', name: 'read_file', result: 'running' }
      ], '');

      // 第二个 tool 的 expanded 状态应保留
      const updatedSecond = container.querySelector('[data-timeline-seg="1"]');
      expect(updatedSecond).not.toBeNull();
      expect(updatedSecond.classList.contains('expanded')).toBe(true);
    });

    it('streaming-region 始终存在且内容正确', async () => {
      await pipeline.renderFinal([], 'streaming text');
      const sr = container.querySelector('.streaming-region');
      expect(sr).not.toBeNull();
      expect(sr.textContent).toContain('streaming text');
    });
  });

  // ==================== 基础接口 ====================

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
      expect(container.textContent).toContain('final');
    });

    it('空 segments 和 currentText 渲染空 streaming-region', async () => {
      await pipeline.renderFinal([], '');
      const sr = container.querySelector('.streaming-region');
      expect(sr).toBeDefined();
      expect(sr.innerHTML).toBe('');
    });

    it('空 segments 带 currentText 填充 streaming-region', async () => {
      await pipeline.renderFinal([], 'stream content');
      const sr = container.querySelector('.streaming-region');
      expect(sr).toBeDefined();
      expect(sr.textContent).toContain('stream content');
    });
  });
});
