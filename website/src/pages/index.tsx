import {type ReactNode, useRef, useState, useEffect} from 'react';
import Link from '@docusaurus/Link';
import Translate, {translate} from '@docusaurus/Translate';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import HomepageFeatures from '@site/src/components/HomepageFeatures';
import HomepageMetrics from '@site/src/components/HomepageMetrics';
import Heading from '@theme/Heading';

import styles from './index.module.css';

function ScrollReveal({children, className = ''}: {children: ReactNode; className?: string}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      {threshold: 0.15},
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`${styles.reveal} ${visible ? styles.revealVisible : ''} ${className}`}>
      {children}
    </div>
  );
}

/* ============== Lightbox 截图放大 · 页内查看原图 ==============
   点击截图打开遮罩放大; Esc / 点击遮罩 / 关闭按钮 均可关闭.
   打开时锁定 body 滚动, 关闭时恢复.                                 */
type LightboxItem = {
  src: string;
  alt: string;
  no: string;
  desc: ReactNode;
};

function Lightbox({item, onClose}: {item: LightboxItem; onClose: () => void}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div
      className={styles.lightbox}
      role="dialog"
      aria-modal="true"
      aria-label={item.alt}
      onClick={onClose}>
      <figure className={styles.lightboxInner} onClick={(e) => e.stopPropagation()}>
        <img src={item.src} alt={item.alt} />
        <figcaption className={styles.shotCaption}>
          <span className={styles.shotNo}>{item.no}</span>
          {item.desc}
        </figcaption>
      </figure>
      <button
        type="button"
        className={styles.lightboxClose}
        aria-label={translate({message: '关闭'})}
        onClick={onClose}>
        ✕
      </button>
      <span className={styles.lightboxHint}><Translate>ESC 关闭</Translate></span>
    </div>
  );
}

/* ============== Community Modal · 交流群悬浮卡片 ==============
   点击导航栏「交流群」触发, 显示群号和复制按钮.            */
function CommunityModal({open, onClose}: {open: boolean; onClose: () => void}) {
  const [copied, setCopied] = useState(false);
  const groupNo = '1102524202';

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(groupNo);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // fallback
    }
  };

  if (!open) return null;

  return (
    <div className={styles.communityModal} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.communityModalInner} onClick={(e) => e.stopPropagation()}>
        <div className={styles.communityModalHead}>
          <Translate>摸鱼交流群</Translate>
        </div>
        <div className={styles.communityModalDesc}>
          <Translate>问题反馈 · 功能建议 · 使用求助 · 摸鱼交流</Translate>
        </div>
        <div className={styles.communityModalNo}>QQ {groupNo}</div>
        <button
          type="button"
          className={styles.communityModalCopy}
          onClick={handleCopy}
          aria-label={translate({message: '复制群号'})}>
          {copied ? <Translate>已复制</Translate> : <Translate>复制群号</Translate>}
        </button>
        <button
          type="button"
          className={styles.communityModalClose}
          onClick={onClose}
          aria-label={translate({message: '关闭'})}>
          ✕
        </button>
      </div>
    </div>
  );
}

/* ============== ASCII 字符点阵呼吸场 · 瑞士风 Hero 专用 ==============
   从 ppt-demo/index.html 移植并 React 化:
   - sin/cos 噪声场驱动字符显隐, mix-blend-mode:screen 在深底上自然发亮
   - IntersectionObserver: Hero 离开视口即停帧, 回来自动重启(网站是滚动页)
   - prefers-reduced-motion: 直接静态, 不启动 RAF 循环                        */
function AsciiField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el: HTMLCanvasElement | null = canvasRef.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // 显式转存为不可空类型 — 函数声明体内 TS 不保留收窄
    const host: HTMLCanvasElement = el;

    const PALETTE = '   ...:::---+++***◦◦••▢▣';
    const CELL = 16;
    const FONT_SIZE = 13;
    const mono = (
      getComputedStyle(document.documentElement)
        .getPropertyValue('--ifm-font-family-monospace') || 'JetBrains Mono, monospace'
    ).trim();

    let W = 0;
    let H = 0;
    let raf = 0;
    let running = false;
    let t0 = performance.now();

    function setup(): boolean {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = host.getBoundingClientRect();
      if (rect.width < 4 || rect.height < 4) return false;
      W = rect.width;
      H = rect.height;
      host.width = Math.round(W * dpr);
      host.height = Math.round(H * dpr);
      const ctx = host.getContext('2d');
      if (!ctx) return false;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = `500 ${FONT_SIZE}px ${mono}`;
      ctx.textBaseline = 'top';
      return true;
    }

    function draw(t: number) {
      const ctx = host.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, W, H);
      const cols = Math.ceil(W / CELL);
      const rows = Math.ceil(H / CELL);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const n =
            (
              Math.sin(c * 0.18 + t) +
              Math.sin(r * 0.24 - t * 0.7) +
              Math.sin((c + r) * 0.12 + t * 0.45) +
              Math.sin(Math.hypot(c - cols * 0.5, r - rows * 0.5) * 0.16 - t * 0.55)
            ) / 4; // [-1, 1]
          const v = (n + 1) / 2; // [0, 1]
          if (v < 0.22) continue;
          const idx = Math.min(PALETTE.length - 1, Math.floor(v * PALETTE.length));
          const ch = PALETTE[idx];
          if (ch === ' ') continue;
          const alpha = 0.08 + (v - 0.22) * 0.55;
          ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
          ctx.fillText(ch, c * CELL, r * CELL);
        }
      }
    }

    function tick(now: number) {
      if (!running) {
        raf = 0;
        return;
      }
      draw((now - t0) / 1000 * 0.55);
      raf = requestAnimationFrame(tick);
    }

    function start() {
      if (running || !setup()) return;
      t0 = performance.now();
      running = true;
      raf = requestAnimationFrame(tick);
    }

    function stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      host.getContext('2d')?.clearRect(0, 0, W, H);
    }

    /* 视口内才运行动画, 滚出 Hero 即停帧 */
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) start();
        else stop();
      },
      {threshold: 0},
    );
    io.observe(host);

    let resizeTimer = 0;
    const onResize = () => {
      cancelAnimationFrame(resizeTimer);
      resizeTimer = requestAnimationFrame(() => {
        stop();
        start();
      });
    };
    window.addEventListener('resize', onResize, {passive: true});

    return () => {
      io.disconnect();
      stop();
      cancelAnimationFrame(resizeTimer);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return <canvas ref={canvasRef} className={styles.asciiField} aria-hidden="true" />;
}

/* ============== 标题 ASCII 点阵呼吸场 · 与背景 AsciiField 同构 ==============
   标题文字渲染到离屏 canvas → 按 10px 网格采样字形掩码,
   每帧只对掩码内格子用与背景相同的 4 正弦波公式绘制字符:
   - 波形/字符集/运动节奏与背景同构 → 标题与背景呼吸场融为一体
   - 完整性优先: 空间频率减半(斑块平滑) + 去掉熄灭阈值(永不缺笔画) + 慢节奏(t*0.25)
     → 字形始终完整可读, 明暗只在字形内部缓慢流动
   - 网格更密(8 vs 16px)、字符占满格子、亮度更高(alpha 0.55~1.0 vs 背景 0.08~0.55)
   - 掩码 3×3 子采样: 细字笔画不落孔 → 字形饱满不残缺
   - Hippo 字重 200→300: 笔画自然加粗, 像素密度向 Buddy(500) 靠拢, 视觉均衡
   - Hippo 白 / Buddy 亮蓝白(alpha 单独 +0.15 补偿蓝色感知亮度), 视觉均衡
   字体加载完成前保持 CSS 像素版兜底, 加载后 canvas 接管(父级 class 隐藏文字) */
function TitleAsciiField({onReady}: {onReady: () => void}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const readyRef = useRef(false);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const host: HTMLCanvasElement = el;

    // 去掉开头空格: 任何格子都画出可见字符, 字形内部无空洞
    const PALETTE = '...:::---+++***◦◦••▢▣';
    let CELL = 8;      // 网格密度: buildMask 时随字号动态缩放, 手机端自动加密
    let FONT_SIZE = 10; // 字符大小: 随 CELL 缩放, 始终占满格子
    const mono = (
      getComputedStyle(document.documentElement)
        .getPropertyValue('--ifm-font-family-monospace') || 'JetBrains Mono, monospace'
    ).trim();
    const FONT_SANS = "'Inter', 'PingFang SC', 'Noto Sans SC', system-ui, sans-serif";
    const RGB_WHITE = '255,255,255';
    // 亮蓝白: 感知亮度 ≈218 vs 白色 255 (原 150,200,255 为 ≈193),
    // 蓝色系中接近白色的高亮档, 深底上 Buddy 与 Hippo 明度几乎持平
    const RGB_BLUE = '180,225,255';

    let W = 0;
    let H = 0;
    let cols = 0;
    let rows = 0;
    let hippoCols = 0;
    let mask: Uint8Array | null = null;
    let raf = 0;
    let running = false;
    let visible = false;
    let fontsReady = false;
    let disposed = false;
    let t0 = performance.now();

    /* 离屏渲染标题文字 → 逐格采样 alpha → 字形掩码 (resize 时重建) */
    function buildMask(): boolean {
      const h1 = host.parentElement as HTMLElement | null;
      if (!h1) return false;
      const f = parseFloat(getComputedStyle(h1).fontSize);
      if (!(f > 0)) return false;
      // 网格密度随字号缩放: 手机字号小 → 自动加密格子, 避免像素点稀少难辨。
      // clamp 上限 8 = 桌面原固定值(桌面 200px 字号 / 8px ≈ 25 行格子, 保持现状不回归);
      // clamp 下限 4: 手机 41px 字号 → 4px 格子 ≈ 10 行(原 8px 只有 5 行, 翻倍加密)。
      CELL = Math.max(4, Math.min(8, Math.round(f * 0.09)));
      FONT_SIZE = Math.max(5, Math.round(CELL * 1.2)); // 字符略大于格子 → 饱满
      // line-height .94 → 文字在行框内垂直居中, 顶部在盒顶上方 (lineH - f)/2 处;
      // 掩码画字位置与实际文字对齐, 避免网格边界 ±1 格偏差
      const lineH = parseFloat(getComputedStyle(h1).lineHeight) || f;
      const yOff = (lineH - f) / 2;
      const off = document.createElement('canvas');
      off.width = W;
      off.height = H;
      const octx = off.getContext('2d');
      if (!octx) return false;
      octx.clearRect(0, 0, W, H);
      octx.textBaseline = 'top';
      octx.font = `300 ${f}px ${FONT_SANS}`; // Hippo 字重 200→300: 笔画自然加粗, 像素密度向 Buddy(500) 靠拢
      // letter-spacing -.025em 与 .heroTitle 一致; 不支持的浏览器忽略(误差 <1 格)
      (octx as CanvasRenderingContext2D & {letterSpacing?: string}).letterSpacing = '-0.025em';
      const hippoW = octx.measureText('Hippo').width;
      octx.fillText('Hippo', 0, yOff);
      octx.font = `italic 500 ${f}px ${FONT_SANS}`;
      octx.fillText('Buddy', hippoW, yOff);

      const img = octx.getImageData(0, 0, W, H);
      const data = img.data;
      cols = Math.ceil(W / CELL);
      rows = Math.ceil(H / CELL);
      hippoCols = Math.ceil(hippoW / CELL);
      mask = new Uint8Array(cols * rows);
      // 3×3 子采样: 每格取 9 个采样点, 任一命中笔画即算格内。
      // 关键: Hippo 是 font-weight 200 超细字, 单点采样易落在笔画间隙 → 掩码残缺;
      // 子采样保证细笔画只要穿过格子的任一部分就被标记, 字形饱满不空洞。
      const SS = 3;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          let hit = 0;
          for (let sy = 0; sy < SS && !hit; sy++) {
            for (let sx = 0; sx < SS; sx++) {
              const px = Math.min(W - 1, Math.round(c * CELL + (CELL * (sx + 0.5)) / SS));
              const py = Math.min(H - 1, Math.round(r * CELL + (CELL * (sy + 0.5)) / SS));
              if (data[(py * W + px) * 4 + 3] > 64) {
                hit = 1;
                break;
              }
            }
          }
          mask[r * cols + c] = hit;
        }
      }
      return true;
    }

    function setup(): boolean {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const h1 = host.parentElement as HTMLElement | null;
      if (!h1) return false;
      const rect = h1.getBoundingClientRect();
      if (rect.width < 4 || rect.height < 4) return false;
      W = Math.round(rect.width);
      H = Math.round(rect.height);
      host.width = Math.round(W * dpr);
      host.height = Math.round(H * dpr);
      const ctx = host.getContext('2d');
      if (!ctx) return false;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return buildMask(); // CELL/FONT_SIZE 在此按字号缩放, ctx.font 由 draw 每帧设置
    }

    /* 慢速大尺度波流: 与背景同构但更平缓
       - 空间频率减半 → 明暗斑块更大更平滑, 相邻格子亮度连续, 字形不破碎
       - 去掉熄灭阈值 → 掩码内所有格子永远画字符, 仅明暗起伏 → 字形始终完整 */
    function draw(t: number) {
      const ctx = host.getContext('2d');
      if (!ctx || !mask) return;
      ctx.clearRect(0, 0, W, H);
      // FONT_SIZE 由 buildMask 按当前字号缩放后确定, 每帧设置保证一致
      ctx.font = `500 ${FONT_SIZE}px ${mono}`;
      ctx.textBaseline = 'top';
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (!mask[r * cols + c]) continue;
          const n =
            (
              Math.sin(c * 0.09 + t) +
              Math.sin(r * 0.12 - t * 0.35) +
              Math.sin((c + r) * 0.06 + t * 0.22) +
              Math.sin(Math.hypot(c - cols * 0.5, r - rows * 0.5) * 0.08 - t * 0.28)
            ) / 4; // [-1, 1]
          const v = (n + 1) / 2; // [0, 1] → 永不熄灭: 所有掩码格子均画字符, 仅亮度随波流动
          const idx = Math.min(PALETTE.length - 1, Math.floor(v * PALETTE.length));
          const ch = PALETTE[idx];
          // 窄幅明暗: 波谷也保持高亮(0.78/0.82), 波峰接近满亮 → 字形始终饱满,
          // 只留小幅亮度起伏保留呼吸感, 完整性优先
          const isBuddy = c >= hippoCols;
          const alpha = isBuddy
            ? 0.82 + v * 0.16   // Buddy: 0.82~0.98
            : 0.78 + v * 0.18;  // Hippo: 0.78~0.96
          ctx.fillStyle = `rgba(${isBuddy ? RGB_BLUE : RGB_WHITE},${alpha.toFixed(3)})`;
          ctx.fillText(ch, c * CELL, r * CELL);
        }
      }
    }

    function tick(now: number) {
      if (!running) {
        raf = 0;
        return;
      }
      draw((now - t0) / 1000 * 0.25); // 慢节奏: 约为背景(0.55)一半, 波流舒缓不晃眼
      raf = requestAnimationFrame(tick);
    }

    function start() {
      if (running || !visible || !fontsReady || disposed) return;
      if (!setup()) return;
      t0 = performance.now();
      running = true;
      draw(0); // 先画一帧再通知父级隐藏 CSS 文字, 避免空白闪烁
      if (!readyRef.current) {
        readyRef.current = true;
        onReady();
      }
      raf = requestAnimationFrame(tick);
    }

    function stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      // 保留最后一帧: 回滚视口时立即有内容, 无空白闪烁
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible) start();
        else stop();
      },
      {threshold: 0},
    );
    io.observe(host);

    let resizeTimer = 0;
    const onResize = () => {
      cancelAnimationFrame(resizeTimer);
      resizeTimer = requestAnimationFrame(() => {
        stop();
        start();
      });
    };
    window.addEventListener('resize', onResize, {passive: true});

    /* 等 Inter 加载完成再启动: 掩码需精确字形, 字体未就绪时保持 CSS 兜底 */
    document.fonts.ready.then(() => {
      if (disposed) return;
      fontsReady = true;
      start();
    });

    return () => {
      disposed = true;
      io.disconnect();
      stop();
      cancelAnimationFrame(resizeTimer);
      window.removeEventListener('resize', onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onReady 语义稳定, 仅需执行一次
  }, []);

  return <canvas ref={canvasRef} className={styles.titleAsciiField} aria-hidden="true" />;
}

function HomepageHeader() {
  const [titleCanvas, setTitleCanvas] = useState(false);
  return (
    <header className={styles.heroBanner}>
      <AsciiField />
      <div className={styles.heroContainer}>
        <div className={styles.heroInner}>
          {/* 顶部 chrome · 两端对齐 (mono) */}
          <div className={styles.heroChrome}>
            <span>HippoBuddy · Open Source Demo</span>
            <span>HB · 2026</span>
          </div>

          {/* 主内容 · 左对齐 */}
          <div className={styles.heroMain}>
            <div className={styles.heroKicker}>
              <Translate>DESKTOP AI ASSISTANT · 完全开源免费</Translate>
            </div>

            <Heading
              as="h1"
              className={`${styles.heroTitle} ${titleCanvas ? styles.titleCanvasOn : ''}`}>
              <span className={styles.heroTitleSolid} data-text="Hippo">Hippo</span><span className={styles.heroTitleItalic} data-text="Buddy">Buddy</span>
              <TitleAsciiField onReady={() => setTitleCanvas(true)} />
            </Heading>

            <p className={styles.heroSubtitle}>
              <span className={styles.heroSloganEn}>HI, BUDDY.</span> <span className={styles.heroSloganZh}><Translate>想得到，就做得到。</Translate></span>
            </p>
          </div>

          {/* 底部 · 发丝线 + 两端信息 */}
          <div className={styles.heroFooter}>
            <div className={styles.heroRule} />

            <div className={styles.heroFooterRow}>
              <div className={styles.heroActions}>
                <Link
                  className={`button button--lg ${styles.heroBtn} ${styles.heroBtnPrimary}`}
                  to="/docs/quick-start">
                  <Translate>快速开始</Translate>
                </Link>
                <Link
                  className={`button button--lg ${styles.heroBtn} ${styles.heroBtnGhost}`}
                  to="/docs/intro">
                  <Translate>了解项目</Translate>
                </Link>
              </div>

              <div className={styles.downloadLinks}>
                <span className={styles.downloadLabel}>
              <svg width="18" height="18" viewBox="0 0 48 48" fill="none" style={{verticalAlign: 'middle', marginRight: 4}}>
                <path d="M40.5178 34.3161C43.8044 32.005 45.2136 27.8302 44.0001 24C42.7866 20.1698 39.0705 18.0714 35.0527 18.0745H32.7317C31.2144 12.1613 26.2082 7.79572 20.1435 7.0972C14.0787 6.39868 8.21121 9.5118 5.38931 14.9253C2.56741 20.3388 3.37545 26.9317 7.42115 31.5035" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M24.0084 41L24 23" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M30.3638 34.6362L23.9998 41.0002L17.6358 34.6362" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <Translate>下载：</Translate>
            </span>
            <a href="https://github.com/Puteitous/HippoBuddy/releases/latest" target="_blank">
              <svg width="16" height="16" viewBox="0 0 48 48" fill="none" className={styles.osIcon}><path d="M6.75 11.0625L19.6875 9.33752V21.4125H6.75V11.0625Z" stroke="currentColor" strokeWidth="4" strokeLinejoin="round"/><path d="M24.8623 8.84464L41.2498 6.75V21.4125H24.8623V8.84464Z" stroke="currentColor" strokeWidth="4" strokeLinejoin="round"/><path d="M24.8623 27.45L41.2498 27.8333V41.25L24.8623 38.5666V27.45Z" stroke="currentColor" strokeWidth="4" strokeLinejoin="round"/><path d="M6.75 26.5875L19.6875 26.899V37.8L6.75 35.6198V26.5875Z" stroke="currentColor" strokeWidth="4" strokeLinejoin="round"/></svg>
              Windows
            </a>
            <span className={styles.sep}>·</span>
            <a href="https://github.com/Puteitous/HippoBuddy/releases/latest" target="_blank">
              <svg width="16" height="16" viewBox="0 0 48 48" fill="none" className={styles.osIcon}><path d="M23.9111 11.3176C23.9931 9.08606 24.6201 7.12594 25.7772 5.4874C26.9402 3.84056 28.8628 2.6707 31.4945 2.00781C31.512 2.08885 31.5302 2.16994 31.5491 2.25072V2.67472C31.5491 3.63616 31.3159 4.73862 30.8556 5.95127C30.3732 7.12541 29.6193 8.23048 28.618 9.22782C27.6815 10.1066 26.8151 10.6884 26.0494 10.9514C25.7966 11.0269 25.45 11.1012 25.0314 11.1681C24.6591 11.2261 24.2856 11.276 23.9111 11.3176Z" fill="currentColor"/><path d="M24.3502 14.629C21.3775 14.629 19.3136 11.9999 16.3813 11.9999C13.4491 11.9999 7.4082 14.6951 7.4082 23.9999C7.4082 33.3047 12.7726 39.2999 13.3726 39.9999C13.9725 40.7 15.3601 42.4994 17.5098 42.4994C19.6596 42.4994 22.0131 40.7902 24.3502 40.7902C26.6872 40.7902 29.6288 42.4994 31.5492 42.4994C33.4696 42.4994 34.2595 41.7165 35.5665 40.3662C36.8734 39.0159 39.3663 34.8952 40.2369 32.422C38.8029 31.5684 35.0021 29.2511 35.0021 23.9999C35.0021 20.4992 36.2814 17.5909 38.8401 15.2752C37.1615 13.0917 35.2147 11.9999 32.9996 11.9999C29.6769 11.9999 27.3229 14.629 24.3502 14.629Z" stroke="currentColor" strokeWidth="4" strokeLinejoin="round"/></svg>
              macOS
            </a>
            <span className={styles.sep}>·</span>
            <a href="https://github.com/Puteitous/HippoBuddy/releases/latest" target="_blank">
              <svg width="16" height="16" viewBox="0 0 505.139 505.139" fill="none" className={styles.osIcon}><path d="M456.698,412.044c-13.352-5.479-24.353-14.107-23.555-30.631 c0.777-16.502-11.799-27.438-11.799-27.438s11.001-36.131,0.777-65.963c-10.203-29.876-43.961-77.741-69.868-113.851 c-25.863-36.131-3.904-77.763-27.438-131.129c-23.577-53.366-84.795-50.238-117.776-27.46 c-33.003,22.736-22.8,79.251-21.247,105.999c1.575,26.661,0.712,45.665-2.33,52.568c-3.106,6.903-24.332,32.227-38.482,53.409 c-14.129,21.183-24.332,65.165-34.578,83.22c-10.203,18.055-3.128,34.535-3.128,34.535s-7.075,2.33-12.576,14.172 c-5.501,11.734-16.48,17.235-36.109,21.118c-19.629,3.926-19.629,16.545-14.927,30.674c4.724,14.107,0.022,22.002-5.479,40.014 c-5.501,18.012,21.981,23.555,48.664,26.64c26.705,3.171,56.537,20.449,81.689,23.577c25.087,3.149,32.96-17.257,32.96-17.257 s28.258-6.32,58.069-7.054c29.854-0.798,58.069,6.277,58.069,6.277s5.501,12.554,15.704,18.033 c10.225,5.501,32.205,6.299,46.334-8.585c14.15-14.949,51.835-33.758,73.017-45.557 C473.933,435.535,470.05,417.502,456.698,412.044z M272.958,65.812c13.46,0,24.332,13.352,24.332,29.811 c0,11.691-5.457,21.765-13.417,26.661c-2.028-0.884-4.163-1.79-6.428-2.761c4.789-2.373,8.197-8.477,8.197-15.596 c0-9.275-5.738-16.804-12.835-16.804c-7.01,0-12.77,7.55-12.77,16.804c0,3.43,0.82,6.73,2.222,9.426 c-4.185-1.661-8.046-3.214-11.066-4.357c-1.639-4.012-2.567-8.542-2.567-13.374C248.626,79.164,259.498,65.812,272.958,65.812z M271.211,128.669c6.73,2.33,14.215,6.709,13.439,11.044c-0.798,4.357-4.336,4.357-13.439,9.923 c-9.124,5.522-28.883,17.774-35.204,18.572c-6.363,0.798-9.901-2.761-16.631-7.097-6.73-4.357-19.392-14.69-16.2-20.19 c0,0,9.858-7.55,14.194-11.497c4.357-3.969,15.445-13.439,22.175-12.209C246.275,118.358,264.481,126.296,271.211,128.669z M210.532,70.536c10.613,0,19.241,12.64,19.241,28.236c0,2.869-0.28,5.522-0.82,8.089c-2.588,0.884-5.22,2.308-7.765,4.465 c-1.294,1.057-2.438,2.049-3.538,3.041c1.683-3.149,2.351-7.636,1.596-12.36c-1.424-8.52-7.097-14.733-12.727-13.848 c-5.608,0.971-8.995,8.628-7.571,17.192c1.445,8.564,7.097,14.776,12.705,13.848c0.324-0.065,0.626-0.151,0.949-0.259 c-2.739,2.632-5.263,4.897-7.83,6.816c-7.765-3.602-13.46-14.323-13.46-27.007C191.313,83.155,199.919,70.536,210.532,70.536z M189.803,467.244c-2.502,11.26-15.682,19.435-15.682,19.435c-11.95,3.753-45.169-10.656-60.226-16.976 c-15.035-6.234-53.323-8.175-58.349-13.741c-4.983-5.695,2.502-18.227,4.422-30.113c1.855-11.972-3.753-19.457-1.898-27.632 c1.898-8.132,26.359-8.132,35.743-13.762c9.426-5.673,11.303-21.981,18.831-26.359c7.528-4.422,21.312,11.26,26.963,20.082 c5.63,8.736,26.963,46.399,35.743,55.804C184.151,443.387,192.305,455.984,189.803,467.244z M328.654,357.837 c-2.265,11.066-2.265,51.058-2.265,51.058s-24.332,33.715-62.059,39.237c-37.684,5.522-56.537,1.553-56.537,1.553l-21.183-24.31 c0,0,16.458-2.394,14.129-18.874c-2.373-16.48-50.238-39.259-58.888-59.686c-8.607-20.384-1.553-54.962,9.448-72.241 c10.98-17.257,18.012-54.919,29.013-67.517c11.001-12.511,19.608-39.216,15.682-51.015c0,0,23.555,28.279,40.014,23.598 c16.48-4.724,53.431-32.227,58.888-27.481c5.479,4.724,52.59,108.328,57.27,141.31c4.724,32.96-3.149,58.069-3.149,58.069 S330.983,346.836,328.654,357.837z M449.148,431.803c-7.334,6.73-48.146,23.21-60.377,36.066 c-12.166,12.748-28.064,23.124-37.792,20.104c-9.793-3.085-18.314-16.48-14.043-36.023c4.249-19.478,7.938-40.833,7.334-53.043 c-0.604-12.209-3.085-28.711,0-31.148c3.042-2.373,7.895-1.186,7.895-1.186s-2.394,23.145,11.605,29.293 c13.999,6.04,34.147-2.438,40.251-8.585c6.126-6.061,10.397-15.207,10.397-15.207s6.083,3.085,5.479,12.813 c-0.604,9.75,4.249,23.814,13.439,28.668C442.461,418.365,456.482,425.116,449.148,431.803z" fill="currentColor"/></svg>
              Linux
              </a>
              </div>
            </div>

            <div className={styles.heroMeta}>
              <span>Java 21 × Electron 32 · Apache 2.0</span>
              <span>Open Source</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

export default function Home(): ReactNode {
  const {siteConfig} = useDocusaurusContext();
  const [lightboxItem, setLightboxItem] = useState<LightboxItem | null>(null);
  const [communityModalOpen, setCommunityModalOpen] = useState(false);

  /* 首页时给导航栏加 home 类, 使其与黑色 Hero 无缝融合; 离开首页自动移除 */
  useEffect(() => {
    const nav = document.querySelector<HTMLElement>('nav.navbar');
    if (!nav) return;
    nav.classList.add('navbar--home');
    return () => nav.classList.remove('navbar--home');
  }, []);

  /* 监听 hash 变化, 触发交流群弹窗 */
  useEffect(() => {
    const checkHash = () => {
      if (window.location.hash === '#community') {
        setCommunityModalOpen(true);
        history.replaceState(null, '', window.location.pathname);
      }
    };
    checkHash();
    window.addEventListener('hashchange', checkHash);
    return () => window.removeEventListener('hashchange', checkHash);
  }, []);

  return (
    <Layout
      title={siteConfig.title}
      description={translate({
        message: 'AI-powered desktop assistant for chat, coding, and office productivity',
      })}>
      <HomepageHeader />
      <main>
        <HomepageFeatures />
        <HomepageMetrics />

        {/* ── 视频介绍 · 内嵌 B 站播放器 (官网无 iframe 限制, 页内直接播放) ── */}
        <section className={styles.videoSection}>
          <div className="container">
            <ScrollReveal>
              <div className={styles.videoHead}>
                <div className={styles.videoChrome}>
                  <span><Translate>Media · 视频介绍</Translate></span>
                  <span>HB · VIDEO</span>
                </div>
                <div className={styles.videoKicker}><Translate>Watch the demo · 6 分钟快速了解</Translate></div>
                <Heading as="h2" className={styles.videoTitle}>
                  <Translate>眼见为实</Translate>
                </Heading>
              </div>
            </ScrollReveal>
            <ScrollReveal>
              <div className={styles.videoFrame}>
                <iframe
                  src="https://player.bilibili.com/player.html?bvid=BV13xud6KEXw&page=1&high_quality=1&danmaku=0"
                  scrolling="no"
                  frameBorder="0"
                  allowFullScreen
                  title={translate({message: 'HippoBuddy 介绍视频'})}
                />
              </div>
            </ScrollReveal>
            <ScrollReveal>
              <p className={styles.videoHint}>
                <a href="https://www.bilibili.com/video/BV13xud6KEXw/" target="_blank" rel="noopener noreferrer">
                  <Translate>在 B 站打开观看</Translate> ↗
                </a>
              </p>
            </ScrollReveal>
          </div>
        </section>

        <section className={styles.screenshotSection}>
          <div className="container">
            {/* 区块头部 · 对齐 chrome 刊头 + kicker + 大标题 */}
            <ScrollReveal>
              <div className={styles.shotHead}>
                <div className={styles.shotChrome}>
                  <span><Translate>Interface · 界面</Translate></span>
                  <span>HB · INTERFACE</span>
                </div>
                <div className={styles.shotKicker}><Translate>Screenshots · 实际运行界面</Translate></div>
                <Heading as="h2" className={styles.shotTitle}>
                  <Translate>所见即所得</Translate>
                </Heading>
              </div>
            </ScrollReveal>
            <div className={styles.screenshotGrid}>
              <ScrollReveal>
                <button
                  type="button"
                  className={styles.screenshotCard}
                  onClick={() =>
                    setLightboxItem({
                      src: 'img/screenshot-main.png',
                      alt: translate({message: 'HippoBuddy 主界面'}),
                      no: 'FIG · 01',
                      desc: <Translate>主界面：聊天面板与工具调用可视化</Translate>,
                    })
                  }>
                  <img src="img/screenshot-main.png" alt={translate({message: 'HippoBuddy 主界面'})} />
                  <span className={styles.shotCaption}>
                    <span className={styles.shotNo}>FIG · 01</span>
                    <Translate>主界面：聊天面板与工具调用可视化</Translate>
                  </span>
                </button>
              </ScrollReveal>
              <ScrollReveal>
                <button
                  type="button"
                  className={styles.screenshotCard}
                  onClick={() =>
                    setLightboxItem({
                      src: 'img/screenshot-chat.png',
                      alt: translate({message: 'Chat 与预览面板'}),
                      no: 'FIG · 02',
                      desc: <Translate>Chat 面板与预览面板协同工作</Translate>,
                    })
                  }>
                  <img src="img/screenshot-chat.png" alt={translate({message: 'Chat 与预览面板'})} />
                  <span className={styles.shotCaption}>
                    <span className={styles.shotNo}>FIG · 02</span>
                    <Translate>Chat 面板与预览面板协同工作</Translate>
                  </span>
                </button>
              </ScrollReveal>
              <ScrollReveal>
                <button
                  type="button"
                  className={styles.screenshotCard}
                  onClick={() =>
                    setLightboxItem({
                      src: 'img/screenshot-token.png',
                      alt: translate({message: 'Token 监控与 diff 便签'}),
                      no: 'FIG · 03',
                      desc: <Translate>Token 用量与 diff 便签：每步变更透明可见</Translate>,
                    })
                  }>
                  <img src="img/screenshot-token.png" alt={translate({message: 'Token 监控与 diff 便签'})} />
                  <span className={styles.shotCaption}>
                    <span className={styles.shotNo}>FIG · 03</span>
                    <Translate>Token 用量与 diff 便签：每步变更透明可见</Translate>
                  </span>
                </button>
              </ScrollReveal>
            </div>
          </div>
        </section>
      </main>

      {lightboxItem && (
        <Lightbox item={lightboxItem} onClose={() => setLightboxItem(null)} />
      )}
      <CommunityModal open={communityModalOpen} onClose={() => setCommunityModalOpen(false)} />
    </Layout>
  );
}
