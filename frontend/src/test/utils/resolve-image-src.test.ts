import { describe, it, expect } from 'vitest';
import { resolveImageSrc } from '@/utils/markdown';

describe('resolveImageSrc', () => {
  it('协议 URL 原样返回', () => {
    expect(resolveImageSrc('https://x.com/a.png')).toBe('https://x.com/a.png');
    expect(resolveImageSrc('data:image/png;base64,xxx')).toBe('data:image/png;base64,xxx');
    expect(resolveImageSrc('blob:http://localhost/abc')).toBe('blob:http://localhost/abc');
  });

  it('纯锚点原样返回', () => {
    expect(resolveImageSrc('#section')).toBe('#section');
  });

  it('无 baseDir 时保持原样', () => {
    expect(resolveImageSrc('img/a.png')).toBe('img/a.png');
  });

  it('绝对路径(/)基于 baseDir 前缀拼接,保留前导斜杠', () => {
    const url = resolveImageSrc('/img/a.png', '/root/docs/');
    expect(url).toBe('/api/file/raw?path=' + encodeURIComponent('/root/docs/img/a.png'));
  });

  it('相对路径基于 baseDir 归一化,保留前导斜杠(后端要求绝对路径)', () => {
    const url = resolveImageSrc('img/a.png', '/root/docs/');
    expect(url).toBe('/api/file/raw?path=' + encodeURIComponent('/root/docs/img/a.png'));
  });

  it('./ 与 空段被归一化', () => {
    const url = resolveImageSrc('./sub/../img/a.png', '/root/docs/');
    expect(url).toBe('/api/file/raw?path=' + encodeURIComponent('/root/docs/img/a.png'));
  });

  it('../ 相对跳转回落一层,仍保留前导斜杠', () => {
    const url = resolveImageSrc('../img/a.png', '/root/docs/');
    expect(url).toBe('/api/file/raw?path=' + encodeURIComponent('/root/img/a.png'));
  });

  it('query/hash 片段被剥离(本地文件路径不含 URL 语法)', () => {
    const url = resolveImageSrc('img/a.png?v=2#top', '/root/docs/');
    expect(url).toBe('/api/file/raw?path=' + encodeURIComponent('/root/docs/img/a.png'));
  });

  it('Windows 盘符路径不补前导斜杠', () => {
    const url = resolveImageSrc('img\\a.png', 'C:/docs/');
    expect(url).toBe('/api/file/raw?path=' + encodeURIComponent('C:/docs/img/a.png'));
  });

  it('Windows 盘符 + 相对跳转归一化正确', () => {
    const url = resolveImageSrc('../img/a.png', 'C:/docs/sub/');
    expect(url).toBe('/api/file/raw?path=' + encodeURIComponent('C:/docs/img/a.png'));
  });
});