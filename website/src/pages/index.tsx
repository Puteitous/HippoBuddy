import {type ReactNode, useRef, useState, useEffect} from 'react';
import Link from '@docusaurus/Link';
import Translate, {translate} from '@docusaurus/Translate';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import HomepageFeatures from '@site/src/components/HomepageFeatures';
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

function HomepageHeader() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <header className={styles.heroBanner}>
      <div className="container">
        <div className={styles.heroLogo}>
          <img src="img/logo.svg" alt="HippoBuddy" width="80" height="80" />
        </div>
        <Heading as="h1" className={styles.heroTitle}>
          HippoBuddy
        </Heading>
        <p className={styles.heroSubtitle}>{siteConfig.tagline}</p>
        <div className={styles.buttons}>
          <Link
            className="button button--primary button--lg"
            to="/docs/quick-start">
            <Translate>快速开始</Translate>
          </Link>
          <Link
            className="button button--secondary button--lg"
            to="/docs/intro">
            <Translate>了解项目</Translate>
          </Link>
        </div>
        <div className={styles.downloadLinks}>
          <span><Translate>下载：</Translate></span>
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
            <svg width="16" height="16" viewBox="0 0 505.139 505.139" fill="none" className={styles.osIcon}><path d="M456.698,412.044c-13.352-5.479-24.353-14.107-23.555-30.631 c0.777-16.502-11.799-27.438-11.799-27.438s11.001-36.131,0.777-65.963c-10.203-29.876-43.961-77.741-69.868-113.851 c-25.863-36.131-3.904-77.763-27.438-131.129c-23.577-53.366-84.795-50.238-117.776-27.46 c-33.003,22.736-22.8,79.251-21.247,105.999c1.575,26.661,0.712,45.665-2.33,52.568c-3.106,6.903-24.332,32.227-38.482,53.409 c-14.129,21.183-24.332,65.165-34.578,83.22c-10.203,18.055-3.128,34.535-3.128,34.535s-7.075,2.33-12.576,14.172 c-5.501,11.734-16.48,17.235-36.109,21.118c-19.629,3.926-19.629,16.545-14.927,30.674c4.724,14.107,0.022,22.002-5.479,40.014 c-5.501,18.012,21.981,23.555,48.664,26.64c26.705,3.171,56.537,20.449,81.689,23.577c25.087,3.149,32.96-17.257,32.96-17.257 s28.258-6.32,58.069-7.054c29.854-0.798,58.069,6.277,58.069,6.277s5.501,12.554,15.704,18.033 c10.225,5.501,32.205,6.299,46.334-8.585c14.15-14.949,51.835-33.758,73.017-45.557 C473.933,435.535,470.05,417.502,456.698,412.044z M272.958,65.812c13.46,0,24.332,13.352,24.332,29.811 c0,11.691-5.457,21.765-13.417,26.661c-2.028-0.884-4.163-1.79-6.428-2.761c4.789-2.373,8.197-8.477,8.197-15.596 c0-9.275-5.738-16.804-12.835-16.804c-7.01,0-12.77,7.55-12.77,16.804c0,3.43,0.82,6.73,2.222,9.426 c-4.185-1.661-8.046-3.214-11.066-4.357c-1.639-4.012-2.567-8.542-2.567-13.374C248.626,79.164,259.498,65.812,272.958,65.812z M271.211,128.669c6.73,2.33,14.215,6.709,13.439,11.044c-0.798,4.357-4.336,4.357-13.439,9.923 c-9.124,5.522-28.883,17.774-35.204,18.572c-6.363,0.798-9.901-2.761-16.631-7.097c-6.73-4.357-19.392-14.69-16.2-20.19 c0,0,9.858-7.55,14.194-11.497c4.357-3.969,15.445-13.439,22.175-12.209C246.275,118.358,264.481,126.296,271.211,128.669z M210.532,70.536c10.613,0,19.241,12.64,19.241,28.236c0,2.869-0.28,5.522-0.82,8.089c-2.588,0.884-5.22,2.308-7.765,4.465 c-1.294,1.057-2.438,2.049-3.538,3.041c1.683-3.149,2.351-7.636,1.596-12.36c-1.424-8.52-7.097-14.733-12.727-13.848 c-5.608,0.971-8.995,8.628-7.571,17.192c1.445,8.564,7.097,14.776,12.705,13.848c0.324-0.065,0.626-0.151,0.949-0.259 c-2.739,2.632-5.263,4.897-7.83,6.816c-7.765-3.602-13.46-14.323-13.46-27.007C191.313,83.155,199.919,70.536,210.532,70.536z M189.803,467.244c-2.502,11.26-15.682,19.435-15.682,19.435c-11.95,3.753-45.169-10.656-60.226-16.976 c-15.035-6.234-53.323-8.175-58.349-13.741c-4.983-5.695,2.502-18.227,4.422-30.113c1.855-11.972-3.753-19.457-1.898-27.632 c1.898-8.132,26.359-8.132,35.743-13.762c9.426-5.673,11.303-21.981,18.831-26.359c7.528-4.422,21.312,11.26,26.963,20.082 c5.63,8.736,26.963,46.399,35.743,55.804C184.151,443.387,192.305,455.984,189.803,467.244z M328.654,357.837 c-2.265,11.066-2.265,51.058-2.265,51.058s-24.332,33.715-62.059,39.237c-37.684,5.522-56.537,1.553-56.537,1.553l-21.183-24.31 c0,0,16.458-2.394,14.129-18.874c-2.373-16.48-50.238-39.259-58.888-59.686c-8.607-20.384-1.553-54.962,9.448-72.241 c10.98-17.257,18.012-54.919,29.013-67.517c11.001-12.511,19.608-39.216,15.682-51.015c0,0,23.555,28.279,40.014,23.598 c16.48-4.724,53.431-32.227,58.888-27.481c5.479,4.724,52.59,108.328,57.27,141.31c4.724,32.96-3.149,58.069-3.149,58.069 S330.983,346.836,328.654,357.837z M449.148,431.803c-7.334,6.73-48.146,23.21-60.377,36.066 c-12.166,12.748-28.064,23.124-37.792,20.104c-9.793-3.085-18.314-16.48-14.043-36.023c4.249-19.478,7.938-40.833,7.334-53.043 c-0.604-12.209-3.085-28.711,0-31.148c3.042-2.373,7.895-1.186,7.895-1.186s-2.394,23.145,11.605,29.293 c13.999,6.04,34.147-2.438,40.251-8.585c6.126-6.061,10.397-15.207,10.397-15.207s6.083,3.085,5.479,12.813 c-0.604,9.75,4.249,23.814,13.439,28.668C442.461,418.365,456.482,425.116,449.148,431.803z" fill="currentColor"/></svg>
            Linux
          </a>
        </div>
      </div>
    </header>
  );
}

export default function Home(): ReactNode {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout
      title={siteConfig.title}
      description={translate({
        message: 'AI-powered desktop assistant for chat, coding, and office productivity',
      })}>
      <HomepageHeader />
      <main>
        <HomepageFeatures />

        <section className={styles.screenshotSection}>
          <div className="container">
            <ScrollReveal>
              <Heading as="h2" className={styles.screenshotHeading}>
                <Translate>界面预览</Translate>
              </Heading>
            </ScrollReveal>
            <div className={styles.screenshotGrid}>
              <ScrollReveal>
                <div className={styles.screenshotCard}>
                  <img src="img/screenshot-main.png" alt={translate({message: 'HippoBuddy 主界面'})} />
                  <p><Translate>主界面：聊天面板与工具调用可视化</Translate></p>
                </div>
              </ScrollReveal>
              <ScrollReveal>
                <div className={styles.screenshotCard}>
                  <img src="img/screenshot-chat.png" alt={translate({message: 'Chat 与预览面板'})} />
                  <p><Translate>Chat 面板与预览面板协同工作</Translate></p>
                </div>
              </ScrollReveal>
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
