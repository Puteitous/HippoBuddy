import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveImageSrc, FilePreviewMdPreview } from '../../main/resources/static/js/components/file-preview-md.js';

describe('file-preview-md.js — Markdown 图片路径解析', () => {
  describe('resolveImageSrc', () => {
    const baseDir = 'E:/workspace/docs/';

    it('相对路径基于 MD 所在目录解析并映射到 /api/file/raw', () => {
      const src = 'images/foo.png';
      const result = resolveImageSrc(src, baseDir);
      expect(result).toBe(
        '/api/file/raw?path=' + encodeURIComponent('E:/workspace/docs/images/foo.png')
      );
    });

    it('./ 前缀相对路径被归一化', () => {
      const result = resolveImageSrc('./img/a.png', baseDir);
      expect(result).toBe(
        '/api/file/raw?path=' + encodeURIComponent('E:/workspace/docs/img/a.png')
      );
    });

    it('../ 跳出目录被正确归一化', () => {
      const result = resolveImageSrc('../shared/logo.png', baseDir);
      expect(result).toBe(
        '/api/file/raw?path=' + encodeURIComponent('E:/workspace/shared/logo.png')
      );
    });

    it('绝对路径（/ 开头）拼接到 MD 所在目录', () => {
      const result = resolveImageSrc('/assets/banner.png', baseDir);
      expect(result).toBe(
        '/api/file/raw?path=' + encodeURIComponent('E:/workspace/docs/assets/banner.png')
      );
    });

    it('Windows 反斜杠路径被归一化为正斜杠', () => {
      const result = resolveImageSrc('images\\foo.png', baseDir);
      expect(result).toBe(
        '/api/file/raw?path=' + encodeURIComponent('E:/workspace/docs/images/foo.png')
      );
    });

    it('URL 查询参数/锚点被剥离（本地文件路径不含 query）', () => {
      // src 含 ?v=1：只取路径部分解析，避免 ? 被编码进 path 参数
      const result = resolveImageSrc('logo.png?v=1', baseDir);
      expect(result).toBe(
        '/api/file/raw?path=' + encodeURIComponent('E:/workspace/docs/logo.png')
      );
      const result2 = resolveImageSrc('logo.png#fragment', baseDir);
      expect(result2).toBe(
        '/api/file/raw?path=' + encodeURIComponent('E:/workspace/docs/logo.png')
      );
    });

    it('http(s) 网络图片保持原样', () => {
      expect(resolveImageSrc('https://example.com/a.png', baseDir)).toBe('https://example.com/a.png');
      expect(resolveImageSrc('http://example.com/b.jpg', baseDir)).toBe('http://example.com/b.jpg');
    });

    it('data: / blob: 协议保持原样', () => {
      const dataUrl = 'data:image/png;base64,iVBORw0KGgo=';
      expect(resolveImageSrc(dataUrl, baseDir)).toBe(dataUrl);
      expect(resolveImageSrc('blob:https://example.com/uuid', baseDir)).toBe('blob:https://example.com/uuid');
    });

    it('纯锚点保持原样', () => {
      expect(resolveImageSrc('#section', baseDir)).toBe('#section');
    });

    it('无 baseDir 时保持原样（不做本地映射）', () => {
      expect(resolveImageSrc('images/foo.png')).toBe('images/foo.png');
    });

    it('空 src 保持原样', () => {
      expect(resolveImageSrc('', baseDir)).toBe('');
    });
  });

  describe('FilePreviewMdPreview 图片 src 重写（集成）', () => {
    let container;
    let preview;

    beforeEach(() => {
      container = document.createElement('div');
      preview = new FilePreviewMdPreview({
        container,
        renderMarkdown: vi.fn(async (content) => `<p>${content}</p>`),
      });
    });

    it('渲染后本地图片 src 被重写为 /api/file/raw', async () => {
      const html = `<p><img src="images/demo.png" alt="demo"></p>`;
      preview._renderMarkdown.mockResolvedValue(html);

      await preview.toggle('# demo', 'E:/workspace/docs/readme.md');

      const img = container.querySelector('img');
      expect(img).not.toBeNull();
      expect(img.getAttribute('src')).toBe(
        '/api/file/raw?path=' + encodeURIComponent('E:/workspace/docs/images/demo.png')
      );
    });

    it('网络图片 src 不被重写', async () => {
      const html = `<p><img src="https://example.com/remote.png" alt="remote"></p>`;
      preview._renderMarkdown.mockResolvedValue(html);

      await preview.toggle('# demo', 'E:/workspace/docs/readme.md');

      const img = container.querySelector('img');
      expect(img.getAttribute('src')).toBe('https://example.com/remote.png');
    });

    it('HTML 实体 src（&amp;）先解码再解析', async () => {
      const html = `<p><img src="images/foo&amp;bar.png" alt="x"></p>`;
      preview._renderMarkdown.mockResolvedValue(html);

      await preview.toggle('# demo', 'E:/workspace/docs/readme.md');

      const img = container.querySelector('img');
      expect(img.getAttribute('src')).toBe(
        '/api/file/raw?path=' + encodeURIComponent('E:/workspace/docs/images/foo&bar.png')
      );
    });

    it('无 filePath 时图片 src 保持原样', async () => {
      const html = `<p><img src="images/demo.png" alt="demo"></p>`;
      preview._renderMarkdown.mockResolvedValue(html);

      await preview.toggle('# demo');

      const img = container.querySelector('img');
      expect(img.getAttribute('src')).toBe('images/demo.png');
    });
  });
});
