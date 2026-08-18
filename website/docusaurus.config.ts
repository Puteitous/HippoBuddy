import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'HippoBuddy',
  tagline: 'AI-powered desktop assistant for chat, coding, and office productivity',
  favicon: 'img/logo.svg',

  future: {
    v4: true,
  },

  url: 'https://www.hippobuddy.cn',
  baseUrl: '/',

  organizationName: 'Puteitous',
  projectName: 'HippoBuddy',

  trailingSlash: false,

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  i18n: {
    defaultLocale: 'zh-Hans',
    locales: ['zh-Hans', 'en'],
    localeConfigs: {
      'zh-Hans': {
        label: '简体中文',
      },
      en: {
        label: 'English',
      },
    },
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/Puteitous/HippoBuddy/tree/main/website/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  // 瑞士风字体: Inter(超细字重) + JetBrains Mono(等宽标签) + Noto Sans SC(中文回退) + Noto Serif SC(slogan 衬线)
  stylesheets: [
    {
      href: 'https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&family=JetBrains+Mono:wght@300;400;500;600&family=Noto+Sans+SC:wght@200;300;400;500;700;900&family=Noto+Serif+SC:wght@200;300;400;500;600;700;900&display=swap',
      type: 'text/css',
    },
  ],

  themeConfig: {
    image: 'img/social-card.jpg',
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'HippoBuddy',
      logo: {
        alt: 'HippoBuddy Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: '文档',
        },
        {
          label: '交流群',
          position: 'right',
          to: '#community',
        },
        {
          href: 'https://github.com/Puteitous/HippoBuddy',
          label: 'GitHub',
          position: 'right',
        },
        {
          type: 'localeDropdown',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: '文档',
          items: [
            {
              label: '快速开始',
              to: '/docs/quick-start',
            },
            {
              label: '架构哲学',
              to: '/docs/architecture/philosophy',
            },
            {
              label: '使用心得',
              to: '/docs/guides/agent-mindset',
            },
          ],
        },
        {
          title: '项目',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/Puteitous/HippoBuddy',
            },
            {
              label: '发布页',
              href: 'https://github.com/Puteitous/HippoBuddy/releases',
            },
          ],
        },
        {
          title: '更多',
          items: [
            {
              label: '技术文档',
              to: '/docs/intro',
            },
            {
              label: '交流群',
              to: '#community',
            },
          ],
        },
      ],
      copyright: `© ${new Date().getFullYear()} Puteitous · HippoBuddy`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
