import {type ReactNode} from 'react';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import Translate, {translate} from '@docusaurus/Translate';
import FeedbackForm from '@site/src/components/FeedbackForm';

import styles from './feedback.module.css';

export default function Feedback(): ReactNode {
  return (
    <Layout
      title={translate({message: '建议反馈'})}
      description={translate({
        message: '给 HippoBuddy 提建议、报 Bug 或催新特性',
      })}>
      <main className={styles.main}>
        <div className="container">
          <div className={styles.head}>
            <div className={styles.kicker}>
              <Translate>Feedback · 建议反馈</Translate>
            </div>
            <Heading as="h1" className={styles.title}>
              <Translate>让 HippoBuddy 更好用</Translate>
            </Heading>
            <p className={styles.desc}>
              <Translate>
                遇到问题、想到改进，或期待某个新特性？告诉我们，每一条都会被认真看到。
              </Translate>
            </p>
          </div>
          <FeedbackForm />
        </div>
      </main>
    </Layout>
  );
}