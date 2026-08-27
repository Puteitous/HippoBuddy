import { describe, it, expect } from 'vitest';
import { getFileIconName } from '@/utils/file-icons';

describe('getFileIconName', () => {
  it('空文件名回退通用文件', () => {
    expect(getFileIconName('')).toBe('file.svg');
  });

  it('扩展名命中时返回对应图标(Dockerfile/无扩展名全名匹配优先)', () => {
    expect(getFileIconName('app.js')).toBe('javascript.svg');
    expect(getFileIconName('index.ts')).toBe('typescript.svg');
    expect(getFileIconName('styles.scss')).toBe('css.svg');
    expect(getFileIconName('config.yaml')).toBe('yaml.svg');
    expect(getFileIconName('README.md')).toBe('markdown.svg');
    expect(getFileIconName('main.go')).toBe('go.svg');
    expect(getFileIconName('Dockerfile')).toBe('docker.svg'); // 全名匹配
  });

  it('扩展名大小写不敏感', () => {
    expect(getFileIconName('App.TS')).toBe('typescript.svg');
    expect(getFileIconName('app.Js')).toBe('javascript.svg');
  });

  it('.gitignore / .env 特殊文件匹配', () => {
    expect(getFileIconName('.gitignore')).toBe('git.svg');
    expect(getFileIconName('sub/env/.gitignore')).toBe('git.svg');
    expect(getFileIconName('.env')).toBe('settings.svg');
  });

  it('锁文件匹配 lock.svg', () => {
    expect(getFileIconName('yarn.lock')).toBe('lock.svg');
    expect(getFileIconName('pnpm-lock.yaml')).toBe('lock.svg');
  });

  it('有扩展名但未映射 → document.svg', () => {
    expect(getFileIconName('notes.abc')).toBe('document.svg');
  });

  it('无扩展名 → 通用 file.svg', () => {
    expect(getFileIconName('Makefile')).toBe('settings.svg'); // 全名映射
    expect(getFileIconName('LICENSE')).toBe('document.svg'); // 全名映射(大小写归一化)
    expect(getFileIconName('unknownfile')).toBe('file.svg');
  });
});