import { describe, it, expect, vi } from 'vitest';

vi.mock('@/i18n', () => ({
  translate: (s: string) => s,
}));

import {
  parseToolArgs,
  statusLabel,
  computeUnifiedDiff,
  countDiffStats,
  parseTodoArgs,
  deepMergeTodoList,
  timelineSummary,
  timelineFilePath,
} from '@/components/tool-renderers/shared-utils';

describe('parseToolArgs', () => {
  it('空值返回空对象', () => {
    expect(parseToolArgs(undefined)).toEqual({});
    expect(parseToolArgs(null)).toEqual({});
  });

  it('JSON 字符串解析为对象', () => {
    expect(parseToolArgs('{"a":1}')).toEqual({ a: 1 });
  });

  it('非法 JSON 字符串返回空对象', () => {
    expect(parseToolArgs('not-json{{{')).toEqual({});
  });

  it('对象原样返回', () => {
    expect(parseToolArgs({ command: 'ls' })).toEqual({ command: 'ls' });
  });
});

describe('statusLabel', () => {
  it('映射常见状态到 i18n key', () => {
    expect(statusLabel('success')).toBe('tool.default.success');
    expect(statusLabel('failed')).toBe('tool.default.failed');
    expect(statusLabel('running')).toBe('tool.default.running');
  });

  it('未知状态原样返回', () => {
    expect(statusLabel('pending_confirmation' as never)).toBe('pending_confirmation');
  });
});

describe('computeUnifiedDiff', () => {
  it('空文本因 split 产出单空行判为 same', () => {
    // '' .split('\n') = ['']，两空串相等 → 单行 same
    expect(computeUnifiedDiff('', '')).toEqual([{ type: 'same', content: '' }]);
  });

  it('完全一致时全为 same', () => {
    expect(computeUnifiedDiff('a\nb', 'a\nb')).toEqual([
      { type: 'same', content: 'a' },
      { type: 'same', content: 'b' },
    ]);
  });

  it('新增行标记为 added', () => {
    expect(computeUnifiedDiff('a', 'a\nb')).toEqual([
      { type: 'same', content: 'a' },
      { type: 'added', content: 'b' },
    ]);
  });

  it('删除行标记为 removed', () => {
    expect(computeUnifiedDiff('a\nb', 'a')).toEqual([
      { type: 'same', content: 'a' },
      { type: 'removed', content: 'b' },
    ]);
  });

  it('改写行输出 removed + added', () => {
    const diff = computeUnifiedDiff('a\nX\nd', 'a\nY\nd');
    const types = diff.map((l) => l.type);
    expect(types).toContain('removed');
    expect(types).toContain('added');
  });
});

describe('countDiffStats', () => {
  it('统计新增与删除行数', () => {
    // '' → ['']，'a\nb' → ['','a','b']：空旧行计入去一行，新增 a、b 两行
    expect(countDiffStats('', 'a\nb')).toEqual({ insertions: 2, deletions: 1 });
    // 'a\nb' → ['a','b']，'' → ['']：去 a、b 两行，新增空行
    expect(countDiffStats('a\nb', '')).toEqual({ insertions: 1, deletions: 2 });
  });
});

describe('parseTodoArgs', () => {
  it('解析 mode 与 todos', () => {
    const res = parseTodoArgs('{"mode":"merge","todos":[{"id":"1","content":"x"}]}');
    expect(res.mode).toBe('merge');
    expect(res.todos).toHaveLength(1);
  });

  it('对象输入直接返回', () => {
    const res = parseTodoArgs({ mode: 'replace', todos: [{ id: '1' }] });
    expect(res.mode).toBe('replace');
    expect(res.todos).toHaveLength(1);
  });

  it('非法 JSON 返回兜底 { merge, [] }', () => {
    expect(parseTodoArgs('{{{bad')).toEqual({ mode: 'merge', todos: [] });
  });

  it('todos 非数组时归空', () => {
    expect(parseTodoArgs({ mode: 'merge', todos: 'x' })).toEqual({ mode: 'merge', todos: [] });
  });
});

describe('deepMergeTodoList', () => {
  it('新 id 追加，默认 status 为 pending', () => {
    const res = deepMergeTodoList([], [{ id: '1', content: 'c' }]);
    expect(res).toEqual([
      { id: '1', content: 'c', status: 'pending', parentId: null, sessionId: null },
    ]);
  });

  it('已存在 id 仅更新被提及字段', () => {
    const oldList = [{ id: '1', content: 'old', status: 'in_progress', parentId: null, sessionId: null }];
    const res = deepMergeTodoList(oldList, [{ id: '1', status: 'completed' }]);
    expect(res[0]).toEqual({ id: '1', content: 'old', status: 'completed', parentId: null, sessionId: null });
  });

  it('未提及的旧项保持不变（保留累计状态）', () => {
    const oldList = [{ id: '1', content: 'a', status: 'in_progress', parentId: null, sessionId: null }];
    const res = deepMergeTodoList(oldList, [{ id: '2', content: 'b' }]);
    expect(res).toHaveLength(2);
    expect(res[0]).toEqual(oldList[0]);
  });
});

describe('timelineSummary', () => {
  it('bash 取命令文本', () => {
    expect(timelineSummary('bash', { command: 'ls -la' })).toBe('ls -la');
  });

  it('文件类工具取路径', () => {
    expect(timelineSummary('write_file', { path: '/x/a.ts' })).toBe('/x/a.ts');
    expect(timelineSummary('read_file', { path: '/x/b.ts' })).toBe('/x/b.ts');
  });

  it('grep/glob 取 pattern', () => {
    expect(timelineSummary('grep', { pattern: 'foo' })).toBe('foo');
  });

  it('SearchCodebase 取 information_request', () => {
    expect(timelineSummary('SearchCodebase', { information_request: 'how auth?' })).toBe('how auth?');
  });

  it('web_search 给查询词加引号', () => {
    expect(timelineSummary('web_search', { query: '天气' })).toBe('"天气"');
  });

  it('web_fetch 取 url', () => {
    expect(timelineSummary('web_fetch', { url: 'https://x.com' })).toBe('https://x.com');
  });

  it('lint_diagnostics/delete_file 取 paths 列表', () => {
    expect(timelineSummary('delete_file', { paths: ['/a', '/b'] })).toBe('/a, /b');
  });

  it('list_directory 无 path 时用占位', () => {
    expect(timelineSummary('list_directory', {})).toBe('tool.common.projectRoot');
  });

  it('skill 用 name 前缀', () => {
    expect(timelineSummary('skill', { name: 'pdf' })).toBe('skill: pdf');
  });

  it('未知工具名直接返回工具名', () => {
    expect(timelineSummary('bash', { command: '' })).toBe('');
    expect(timelineSummary('unknown_tool', {})).toBe('unknown_tool');
  });
});

describe('timelineFilePath', () => {
  it('文件类工具取 path', () => {
    expect(timelineFilePath('edit_file', { path: '/x/a.ts' })).toBe('/x/a.ts');
    expect(timelineFilePath('list_directory', { path: '/x/dir' })).toBe('/x/dir');
  });

  it('delete_file 取首个 paths', () => {
    expect(timelineFilePath('delete_file', { paths: ['/a', '/b'] })).toBe('/a');
  });

  it('无路径返回空串', () => {
    expect(timelineFilePath('bash', { command: 'ls' })).toBe('');
    expect(timelineFilePath('edit_file', {})).toBe('');
  });
});