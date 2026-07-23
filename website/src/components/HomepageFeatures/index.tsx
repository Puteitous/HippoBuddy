import {type ReactNode, useRef, useState, useEffect} from 'react';
import Translate from '@docusaurus/Translate';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

type FeatureItem = {
  titleKey: string;
  descKey: string;
  icon: ReactNode;
};

function ChatIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z"/>
      <circle cx="12" cy="10" r="1" fill="currentColor"/>
      <circle cx="16" cy="10" r="1" fill="currentColor"/>
      <circle cx="8" cy="10" r="1" fill="currentColor"/>
    </svg>
  );
}

function CodeIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6"/>
      <polyline points="8 6 2 12 8 18"/>
      <path d="M14 4l-4 16"/>
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"/>
      <path d="M14 2v6h6"/>
      <path d="M12 18v-6"/>
      <path d="M9 15l3-3 3 3"/>
    </svg>
  );
}

function ForkIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="6" y1="3" x2="6" y2="15"/>
      <circle cx="18" cy="6" r="2"/>
      <circle cx="6" cy="3" r="2"/>
      <circle cx="6" cy="15" r="2"/>
      <path d="M18 8v1a4 4 0 01-4 4H8"/>
    </svg>
  );
}

function WrenchIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>
    </svg>
  );
}

function ActivityIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
  );
}

const FeatureList: FeatureItem[] = [
  {
    icon: <ChatIcon />,
    titleKey: '智能对话',
    descKey: '聊天 / 代码 / 办公三种模式，自由切换。工具调用与思考过程全透明，实时可见。',
  },
  {
    icon: <CodeIcon />,
    titleKey: 'AI 编程协助',
    descKey: '理解项目上下文，生成、修改、重构代码。支持 diff 预览与一键回滚，变更可控。',
  },
  {
    icon: <FileIcon />,
    titleKey: '文件操作',
    descKey: '读、写、编辑、删除，支持 diff 回滚。内置 PDF / Word / Excel / PPT 浏览。',
  },
  {
    icon: <ForkIcon />,
    titleKey: '会话管理',
    descKey: '新建、重命名、删除、分叉讨论。文件级与会话级变更追踪，随时回滚。',
  },
  {
    icon: <WrenchIcon />,
    titleKey: '内置工具集',
    descKey: '10+ 种内置工具：终端、浏览器、搜索、代码分析等，覆盖日常开发全场景。',
  },
  {
    icon: <ActivityIcon />,
    titleKey: '实时监控',
    descKey: 'Token 统计、上下文用量、LLM 调用监控，全方位掌握 Agent 运行状态。',
  },
];

function Feature({icon, titleKey, descKey}: FeatureItem) {
  return (
    <div className={styles.featureCard}>
      <div className={styles.featureHeader}>
        <div className={styles.featureIcon}>{icon}</div>
        <Heading as="h3"><Translate>{titleKey}</Translate></Heading>
      </div>
      <p><Translate>{descKey}</Translate></p>
    </div>
  );
}

export default function HomepageFeatures(): ReactNode {
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
      className={`${styles.features} ${styles.reveal} ${visible ? styles.revealVisible : ''}`}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <div key={idx} className={`col col--4 ${styles.featureCol}`}>
              <Feature {...props} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
