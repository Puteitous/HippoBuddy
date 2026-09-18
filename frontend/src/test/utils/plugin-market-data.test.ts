import { describe, it, expect } from 'vitest';
import {
  PLUGIN_SOURCES,
  MARKET_PLUGINS,
  PLUGIN_CATEGORIES,
  DEFAULT_CATEGORY_LABEL,
} from '@/components/plugin-market/PluginMarketData';

const VALID_TAGS = ['official', 'community', 'vendor', 'featured'];
const VALID_TYPES = ['skill', 'mcp', 'package'];

describe('PLUGIN_SOURCES', () => {
  it('非空', () => {
    expect(PLUGIN_SOURCES.length).toBeGreaterThan(0);
  });

  it('id 全局唯一', () => {
    const ids = PLUGIN_SOURCES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('每条来源的 name/desc/url 非空', () => {
    for (const s of PLUGIN_SOURCES) {
      expect(s.name?.trim()).toBeTruthy();
      expect(s.desc?.trim()).toBeTruthy();
      expect(s.url).toMatch(/^https?:\/\//);
    }
  });

  it('tag 属于合法集合', () => {
    for (const s of PLUGIN_SOURCES) {
      expect(VALID_TAGS).toContain(s.tag);
    }
  });
});

describe('MARKET_PLUGINS', () => {
  it('id 全局唯一', () => {
    const ids = MARKET_PLUGINS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('每条插件 name/desc 非空', () => {
    for (const p of MARKET_PLUGINS) {
      expect(p.name?.trim()).toBeTruthy();
      expect(p.desc?.trim()).toBeTruthy();
    }
  });

  it('type 属于合法集合', () => {
    for (const p of MARKET_PLUGINS) {
      expect(VALID_TYPES).toContain(p.type);
    }
  });

  it('source 引用存在的 PLUGIN_SOURCES id', () => {
    const sourceIds = new Set(PLUGIN_SOURCES.map((s) => s.id));
    for (const p of MARKET_PLUGINS) {
      expect(sourceIds.has(p.source)).toBe(true);
    }
  });

  it('category 匹配 PLUGIN_CATEGORIES 的某个 label', () => {
    const categoryLabels = new Set(PLUGIN_CATEGORIES.map((c) => c.label));
    for (const p of MARKET_PLUGINS) {
      expect(categoryLabels.has(p.category)).toBe(true);
    }
  });

  it('skill 带 skillUrl;mcp 带完整 mcp 配置;package 带 downloadUrl', () => {
    for (const p of MARKET_PLUGINS) {
      if (p.type === 'skill') {
        expect(p.skillUrl?.trim()).toBeTruthy();
        expect([undefined, null]).toContain(p.mcp);
      } else if (p.type === 'package') {
        expect(p.downloadUrl).toMatch(/^https:\/\//);
        expect([undefined, null]).toContain(p.mcp);
      } else {
        expect(p.mcp).toBeTruthy();
        expect(p.mcp!.id?.trim()).toBeTruthy();
        expect(p.mcp!.name?.trim()).toBeTruthy();
        expect(['stdio', 'sse']).toContain(p.mcp!.type);
        // stdio 必须有 command;sse 必须有 url
        if (p.mcp!.type === 'stdio') {
          expect(p.mcp!.command?.trim()).toBeTruthy();
        } else {
          expect(p.mcp!.url?.trim()).toBeTruthy();
        }
      }
    }
  });

  it('params 声明合法(target 为 args|env，key/label 非空且 key 不重复)', () => {
    for (const p of MARKET_PLUGINS) {
      const params = p.params ?? [];
      const keys = params.map((f) => f.key);
      expect(new Set(keys).size).toBe(keys.length);
      for (const f of params) {
        expect(['args', 'env']).toContain(f.target);
        expect(f.label?.trim()).toBeTruthy();
        expect(f.key?.trim()).toBeTruthy();
        // target='env' 时 key 即环境变量名，需符合常规命名
        if (f.target === 'env') {
          expect(f.key).toMatch(/^[A-Z][A-Z0-9_]*$/);
        }
      }
    }
  });

  it('必填参数只能声明在 mcp 条目上', () => {
    for (const p of MARKET_PLUGINS) {
      if (p.type !== 'mcp') {
        expect(p.params ?? []).toHaveLength(0);
      }
    }
  });
});

describe('PLUGIN_CATEGORIES / DEFAULT', () => {
  it('key 全局唯一且含 all(默认全部)', () => {
    const keys = PLUGIN_CATEGORIES.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain('all');
  });

  it('每个分类 key/label 非空', () => {
    for (const c of PLUGIN_CATEGORIES) {
      expect(c.key?.trim()).toBeTruthy();
      expect(c.label?.trim()).toBeTruthy();
    }
  });

  it('all 分类是第一个,默认 label 与之一致', () => {
    expect(PLUGIN_CATEGORIES[0].key).toBe('all');
    expect(DEFAULT_CATEGORY_LABEL).toBe(PLUGIN_CATEGORIES[0].label);
  });
});