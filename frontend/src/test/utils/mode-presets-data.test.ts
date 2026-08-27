import { describe, it, expect } from 'vitest';
import { MODE_PRESETS, SLOGAN_MAP, MODE_ORDER } from '@/components/chat-panel/modePresetsData';
import type { SessionMode } from '@/types';

const ALL_MODES: SessionMode[] = ['chat', 'coding', 'office'];

describe('MODE_PRESETS', () => {
  it('覆盖所有 SessionMode,且每个模式都有预设', () => {
    for (const mode of ALL_MODES) {
      expect(MODE_PRESETS[mode]).toBeDefined();
      expect(MODE_PRESETS[mode].length).toBeGreaterThan(0);
    }
    // 无多余模式键
    expect(Object.keys(MODE_PRESETS).sort()).toEqual([...ALL_MODES].sort());
  });

  it('每条预设都含非空 label / icon / prompt', () => {
    for (const mode of ALL_MODES) {
      for (const p of MODE_PRESETS[mode]) {
        expect(p.label?.trim()).toBeTruthy();
        expect(p.icon?.trim()).toBeTruthy();
        expect(p.prompt?.trim()).toBeTruthy();
      }
    }
  });

  it('同一模式内 label 不重复', () => {
    for (const mode of ALL_MODES) {
      const labels = MODE_PRESETS[mode].map((p) => p.label);
      expect(new Set(labels).size).toBe(labels.length);
    }
  });

  it('每个模式预设置 4 项(对齐旧版)', () => {
    for (const mode of ALL_MODES) {
      expect(MODE_PRESETS[mode].length).toBe(4);
    }
  });
});

describe('SLOGAN_MAP', () => {
  it('覆盖所有 SessionMode 且值非空', () => {
    for (const mode of ALL_MODES) {
      expect(SLOGAN_MAP[mode]?.trim()).toBeTruthy();
    }
    expect(Object.keys(SLOGAN_MAP).sort()).toEqual([...ALL_MODES].sort());
  });
});

describe('MODE_ORDER', () => {
  it('包含全部模式且无重复、无遗漏', () => {
    expect(MODE_ORDER).toHaveLength(3);
    expect(new Set(MODE_ORDER).size).toBe(3);
    for (const mode of ALL_MODES) expect(MODE_ORDER).toContain(mode);
  });

  it('与 SLOGAN_MAP / MODE_PRESETS 键保持一致', () => {
    expect([...MODE_ORDER].sort()).toEqual(Object.keys(SLOGAN_MAP).sort());
    expect([...MODE_ORDER].sort()).toEqual(Object.keys(MODE_PRESETS).sort());
  });
});