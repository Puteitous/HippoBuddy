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

  url: 'https://puteitous.github.io',
  baseUrl: '/HippoBuddy/',

  organizationName: 'Puteitous',
  projectName: 'HippoBuddy',

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
              label: '使用心法',
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
              label: 'Archived 思考',
              to: '/docs/guides/startup-loading',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Puteitous. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
