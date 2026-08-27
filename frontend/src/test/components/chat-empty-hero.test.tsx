import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ChatEmptyHero } from '@/components/chat-panel/ChatEmptyHero';
import { useAppStore } from '@/stores/appStore';

/** 当前激活模式按钮 */
function activeModeBtns() {
  return document.querySelectorAll('.mode-btn.active');
}

beforeEach(() => {
  useAppStore.setState({ mode: 'chat' });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ChatEmptyHero', () => {
  it('chat 模式:渲染标题+标语+激活胶囊与 4 个预设提示词', () => {
    render(<ChatEmptyHero onPresetSelect={vi.fn()} />);
    expect(screen.getByText('HippoBuddy,')).toBeInTheDocument();
    expect(screen.getByText("Let's Chat!")).toBeInTheDocument();

    // 三个模式胶囊按钮
    expect(screen.getByRole('button', { name: 'Chat' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Code' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Office' })).toBeInTheDocument();

    // 仅 chat 激活
    expect(activeModeBtns()).toHaveLength(1);
    expect(document.querySelector('.mode-btn[data-mode="chat"]')).toHaveClass('active');

    // 4 个 chat 预设
    expect(screen.getByRole('button', { name: '头脑风暴' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '润色' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '解读' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '翻译' })).toBeInTheDocument();
  });

  it('office 模式:标语与预设随模式联动', () => {
    useAppStore.setState({ mode: 'office' });
    render(<ChatEmptyHero onPresetSelect={vi.fn()} />);
    expect(screen.getByText("Let's Work!")).toBeInTheDocument();
    expect(document.querySelector('.mode-btn[data-mode="office"]')).toHaveClass('active');
    expect(screen.getByRole('button', { name: '周报' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '数据分析' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'PPT 大纲' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '会议纪要' })).toBeInTheDocument();
  });

  it('coding 模式:标语与预设随模式联动', () => {
    useAppStore.setState({ mode: 'coding' });
    render(<ChatEmptyHero onPresetSelect={vi.fn()} />);
    expect(screen.getByText("Let's Code!")).toBeInTheDocument();
    expect(document.querySelector('.mode-btn[data-mode="coding"]')).toHaveClass('active');
    expect(screen.getByRole('button', { name: '代码审查' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '生成测试' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '解读代码' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重构' })).toBeInTheDocument();
  });

  it('点击预设提示词按钮,回调其 prompt', () => {
    const onPresetSelect = vi.fn();
    render(<ChatEmptyHero onPresetSelect={onPresetSelect} />);
    fireEvent.click(screen.getByRole('button', { name: '头脑风暴' }));
    expect(onPresetSelect).toHaveBeenCalledWith(
      '请帮我做一些头脑风暴,围绕以下主题展开多个视角的思考:',
    );
    fireEvent.click(screen.getByRole('button', { name: '翻译' }));
    expect(onPresetSelect).toHaveBeenLastCalledWith(
      '请将下面的内容在中文与英文之间互相翻译,保持专业术语与上下文一致:',
    );
  });

  it('切换模式:更新 appStore.mode、激活胶囊与标语', () => {
    render(<ChatEmptyHero onPresetSelect={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Code' }));
    expect(useAppStore.getState().mode).toBe('coding');
    expect(screen.getByText("Let's Code!")).toBeInTheDocument();
    expect(document.querySelector('.mode-btn[data-mode="coding"]')).toHaveClass('active');
    expect(document.querySelector('.mode-btn[data-mode="chat"]')).not.toHaveClass('active');

    fireEvent.click(screen.getByRole('button', { name: 'Office' }));
    expect(useAppStore.getState().mode).toBe('office');
    expect(screen.getByText("Let's Work!")).toBeInTheDocument();
  });

  it('点击当前已激活的模式按钮不重复 setMode', () => {
    render(<ChatEmptyHero onPresetSelect={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Chat' }));
    expect(useAppStore.getState().mode).toBe('chat');
  });

  it('点击河马 logo:触发弹跳动画并吐出对话气泡,动画结束后恢复', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    render(<ChatEmptyHero onPresetSelect={vi.fn()} />);
    const logo = screen.getByRole('button', { name: 'HippoBuddy' });
    fireEvent.click(logo);

    // 弹跳态 + 对话气泡出现
    expect(logo.className).toContain('bouncing');
    expect(logo.querySelector('.hippo-speech')).not.toBeNull();

    // 520ms 后弹跳态解除
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(logo.className).not.toContain('bouncing');
    // 气泡携带非空文案
    expect(logo.querySelector('.hippo-speech')?.textContent?.length).toBeGreaterThan(0);
  });
});