import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    'intro',
    'quick-start',
    {
      type: 'category',
      label: '架构哲学',
      items: ['architecture/philosophy', 'architecture/syntax-check-tool', 'architecture/wasm-dual-runtime'],
    },
    {
      type: 'category',
      label: '实战思考',
      items: ['guides/agent-mindset', 'guides/tool-design-philosophy', 'guides/hard-constraints-soft-guidance', 'guides/context-and-cache', 'guides/startup-loading', 'guides/responses-api-guide'],
    },
  ],
};

export default sidebars;
