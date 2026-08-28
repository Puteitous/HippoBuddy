/**
 * XlsxViewer — @silurus/ooxml XLSX 预览(React 容器)
 *
 * XlsxViewer 自管理容器 DOM(tab 栏 + canvas),React 只负责:
 *   - 提供挂载容器(ref)
 *   - 生命周期(挂载时创建,卸载/文件切换时 destroy)
 *   - 加载/错误状态展示
 *
 * 竞态防护:mountedRef 标记 + cancelled 标志,异步完成后容器已被卸载/切换
 * 则丢弃 viewer(与旧版 sessionGen 路径守卫等价)。
 */
import { useEffect, useRef, useState } from 'react';
import { fileApi } from '@/api/client';
import { useI18n } from '@/i18n';
import { createXlsxViewer } from './ooxml-bridge';
import type { XlsxViewerLike } from './ooxml-bridge';
import './OoxmlViewer.css';

interface XlsxViewerProps {
  /** 文件绝对路径 */
  filePath: string;
}

type ViewerStatus = 'loading' | 'ready' | 'error';

export function XlsxViewer({ filePath }: XlsxViewerProps) {
  const { t } = useI18n();
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<ViewerStatus>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let viewer: XlsxViewerLike | null = null;
    let cancelled = false;

    setStatus('loading');
    setError('');
    const url = fileApi.rawUrl(filePath);

    void (async () => {
      try {
        viewer = await createXlsxViewer(host, url, {
          onReady: () => {
            if (!cancelled) setStatus('ready');
          },
          onError: (err) => {
            if (cancelled) return;
            setError(err?.message ?? String(err));
            setStatus('error');
          },
        });
        if (cancelled) {
          viewer.destroy();
          viewer = null;
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
      viewer?.destroy();
    };
  }, [filePath]);

  return (
    <div className="ooxml-viewer">
      {status === 'loading' && (
        <div className="ooxml-viewer-state">{t('ooxml.loadingXlsx')}</div>
      )}
      {status === 'error' && (
        <div className="ooxml-viewer-state ooxml-viewer-error">
          <p className="ooxml-viewer-error-title">{t('ooxml.failedXlsx')}</p>
          <p className="ooxml-viewer-error-detail">{error}</p>
          <a className="ooxml-viewer-download" href={fileApi.rawUrl(filePath)} target="_blank" rel="noreferrer">
            {t('ooxml.download')}
          </a>
        </div>
      )}
      <div ref={hostRef} className="ooxml-viewer-host" />
    </div>
  );
}
