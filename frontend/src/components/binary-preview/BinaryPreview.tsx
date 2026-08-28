/**
 * BinaryPreview — 二进制文件预览组件(主路由,React 版)
 *
 * 职责:检测文件类型,将渲染委托给对应子组件。
 *
 * 支持范围(对齐旧版主力路径):
 *   - .docx → DocxViewer(docx-preview 优先 + Silurus 降级)
 *   - .pptx → PptxViewer(Silurus PptxScrollViewer)
 *   - .xlsx → XlsxViewer(Silurus XlsxViewer)
 *   - .xls  → 明确提示"暂不支持,请另存为 xlsx"(旧版 SheetJS 为 UMD 非 ESM,
 *             动态加载成本高,留 3.8 评估)
 *
 * 与旧版差异(留 3.8):
 *   - 图片缩放交互 / PDF iframe 由 FilePreview 承担(image/pdf 分支),本组件不处理
 *   - HTML iframe 预览(showWebPreview)未迁移
 *
 * 接入:FilePreview 的 binary 分支渲染本组件。
 */
import { useMemo } from 'react';
import { fileApi } from '@/api/client';
import { useI18n } from '@/i18n';
import { isDocxFile, isPptxFile, isXlsxFile, isXlsFile } from './shared';
import { DocxViewer } from './DocxViewer';
import { PptxViewer } from './PptxViewer';
import { XlsxViewer } from './XlsxViewer';
import './OoxmlViewer.css';

interface BinaryPreviewProps {
  /** 文件绝对路径 */
  filePath: string;
}

type BinaryKind = 'docx' | 'pptx' | 'xlsx' | 'xls' | 'unknown';

function detectBinaryKind(filePath: string): BinaryKind {
  if (isDocxFile(filePath)) return 'docx';
  if (isPptxFile(filePath)) return 'pptx';
  if (isXlsxFile(filePath)) return 'xlsx';
  if (isXlsFile(filePath)) return 'xls';
  return 'unknown';
}

export function BinaryPreview({ filePath }: BinaryPreviewProps) {
  const { t } = useI18n();
  const kind = useMemo(() => detectBinaryKind(filePath), [filePath]);

  if (kind === 'docx') return <DocxViewer filePath={filePath} />;
  if (kind === 'pptx') return <PptxViewer filePath={filePath} />;
  if (kind === 'xlsx') return <XlsxViewer filePath={filePath} />;
  if (kind === 'xls') {
    return (
      <div className="ooxml-viewer">
        <div className="ooxml-viewer-state ooxml-viewer-error">
          <p className="ooxml-viewer-error-title">{t('ooxml.xlsNotSupported')}</p>
          <p className="ooxml-viewer-error-detail">{t('ooxml.xlsNotSupportedDetail')}</p>
          <a className="ooxml-viewer-download" href={fileApi.rawUrl(filePath)} target="_blank" rel="noreferrer">
            {t('ooxml.download')}
          </a>
        </div>
      </div>
    );
  }
  return (
    <div className="ooxml-viewer">
      <div className="ooxml-viewer-state ooxml-viewer-error">
        <p className="ooxml-viewer-error-title">{t('ooxml.unknownType')}</p>
        <p className="ooxml-viewer-error-detail">{t('ooxml.unknownTypeDetail')}</p>
      </div>
    </div>
  );
}
