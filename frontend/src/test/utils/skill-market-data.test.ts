import { describe, it, expect } from 'vitest';
import {
  SKILL_SOURCES,
  FEATURED_SKILLS,
  SKILL_CATEGORIES,
  DEFAULT_CATEGORY_LABEL,
} from '@/components/SkillMarketData';

const VALID_TAGS = ['official', 'community', 'vendor', 'featured'];

describe('SKILL_SOURCES', () => {
  it('非空', () => {
    expect(SKILL_SOURCES.length).toBeGreaterThan(0);
  });

  it('id 全局唯一', () => {
    const ids = SKILL_SOURCES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('每条来源的 name/desc/url 非空', () => {
    for (const s of SKILL_SOURCES) {
      expect(s.name?.trim()).toBeTruthy();
      expect(s.desc?.trim()).toBeTruthy();
      expect(s.url).toMatch(/^https?:\/\//);
    }
  });

  it('tag 属于合法集合', () => {
    for (const s of SKILL_SOURCES) {
      expect(VALID_TAGS).toContain(s.tag);
    }
  });
});

describe('FEATURED_SKILLS', () => {
  it('技能名全局唯一', () => {
    const names = FEATURED_SKILLS.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('每条技能 desc/name/skillUrl 非空', () => {
    for (const s of FEATURED_SKILLS) {
      expect(s.name?.trim()).toBeTruthy();
      expect(s.desc?.trim()).toBeTruthy();
      expect(s.skillUrl?.trim()).toBeTruthy();
    }
  });

  it('source 引用存在的 SKILL_SOURCES id', () => {
    const sourceIds = new Set(SKILL_SOURCES.map((s) => s.id));
    for (const s of FEATURED_SKILLS) {
      expect(sourceIds.has(s.source)).toBe(true);
    }
  });

  it('category 匹配 SKILL_CATEGORIES 的某个 label', () => {
    const categoryLabels = new Set(SKILL_CATEGORIES.map((c) => c.label));
    for (const s of FEATURED_SKILLS) {
      expect(categoryLabels.has(s.category)).toBe(true);
    }
  });
});

describe('SKILL_CATEGORIES / DEFAULT', () => {
  it('key 全局唯一且含 all(默认全部)', () => {
    const keys = SKILL_CATEGORIES.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain('all');
  });

  it('每个分类 key/label 非空', () => {
    for (const c of SKILL_CATEGORIES) {
      expect(c.key?.trim()).toBeTruthy();
      expect(c.label?.trim()).toBeTruthy();
    }
  });

  it('all 分类是第一个,默认 label 与之一致', () => {
    expect(SKILL_CATEGORIES[0].key).toBe('all');
    expect(DEFAULT_CATEGORY_LABEL).toBe(SKILL_CATEGORIES[0].label);
  });
});