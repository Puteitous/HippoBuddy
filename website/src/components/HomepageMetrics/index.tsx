import {type ReactNode, useRef, useState, useEffect} from 'react';
import Translate from '@docusaurus/Translate';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

type MetricItem = {
  labelKey: string;
  subKey: string;
  num: string;
  unitKey: string;
  icon: ReactNode;
};

function GridIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7"/>
      <rect x="14" y="3" width="7" height="7"/>
      <rect x="14" y="14" width="7" height="7"/>
      <rect x="3" y="14" width="7" height="7"/>
    </svg>
  );
}

function WrenchIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>
    </svg>
  );
}

function ZapIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  );
}

function MonitorIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
      <line x1="8" y1="21" x2="16" y2="21"/>
      <line x1="12" y1="17" x2="12" y2="21"/>
    </svg>
  );
}

function LayersIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2"/>
      <polyline points="2 17 12 22 22 17"/>
      <polyline points="2 12 12 17 22 12"/>
    </svg>
  );
}

function ActivityIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
  );
}

/* 六个数字 · 对齐 ppt-demo 第 2 页 (S20 · Stacked KPI Ledger) */
const MetricList: MetricItem[] = [
  {
    icon: <GridIcon />,
    labelKey: '工作模式',
    subKey: 'Chat · Coding · Office 随时切换',
    num: '3',
    unitKey: 'Modes',
  },
  {
    icon: <WrenchIcon />,
    labelKey: '内置工具',
    subKey: '终端 / 搜索 / 文件 / Office / 审查…',
    num: '20',
    unitKey: '+Tools',
  },
  {
    icon: <ZapIcon />,
    labelKey: '快捷预设',
    subKey: '代码审查 / 生成测试 / 重构优化 / 写周报',
    num: '12',
    unitKey: 'Presets',
  },
  {
    icon: <MonitorIcon />,
    labelKey: '跨平台',
    subKey: 'Windows / macOS / Linux 一套安装',
    num: '3',
    unitKey: 'Platforms',
  },
  {
    icon: <LayersIcon />,
    labelKey: '核心模块',
    subKey: 'LLM / 工具 / 编排 / 记忆 / 会话 分层解耦',
    num: '15',
    unitKey: 'Modules',
  },
  {
    icon: <ActivityIcon />,
    labelKey: 'Token 监控',
    subKey: '用量 / 成本 / 缓存命中一目了然',
    num: '100',
    unitKey: '% 透明',
  },
];

function MetricRow({labelKey, subKey, num, unitKey, icon}: MetricItem) {
  return (
    <div className={styles.ledgerRow}>
      <div className={styles.ledgerLabel}>
        <Translate>{labelKey}</Translate>
        <span className={styles.ledgerSub}><Translate>{subKey}</Translate></span>
      </div>
      {/* 账本点线 · 填充 label 与数字之间的空白 (经典账单/目录手法) */}
      <span className={styles.ledgerDash} aria-hidden="true" />
      <div className={styles.ledgerNum}>
        {num}
        <span className={styles.ledgerUnit}><Translate>{unitKey}</Translate></span>
      </div>
      <div className={styles.ledgerIcon}>{icon}</div>
    </div>
  );
}

export default function HomepageMetrics(): ReactNode {
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
    <section
      ref={ref}
      className={`${styles.metrics} ${styles.reveal} ${visible ? styles.revealVisible : ''}`}>
      <div className="container">
        {/* ── 区块头部 · 对齐 ppt-demo 第 2 页 (chrome 刊头 + kicker + 大标题) ── */}
        <div className={styles.metricsHead}>
          <div className={styles.chrome}>
            <span className={styles.chromeL}>Six Numbers</span>
            <span className={styles.chromeR}>HB · METRICS</span>
          </div>
          <div className={styles.kicker}><Translate>Metrics · 数字看懂 HippoBuddy</Translate></div>
          <Heading as="h2" className={styles.headTitle}>
            <Translate>六个数字，一个产品</Translate>
          </Heading>
        </div>

        {/* ── 纵向账本 · 对齐 PPT .stacked-ledger ── */}
        <div className={styles.ledger}>
          {MetricList.map((props, idx) => (
            <MetricRow key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
