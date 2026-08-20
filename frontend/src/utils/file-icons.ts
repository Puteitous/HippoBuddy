/**
 * file-icons — 文件扩展名 → 彩色 SVG 图标(对齐旧版 utils/file-icons.js)
 *
 * 职责:
 *   根据文件名(可选目录标记)返回对应的图标信息。
 *   旧版通过 <img src="icons/xxx.svg"> 引用后端 /icons 静态资源;
 *   新版部署在 /app context,访问不到 /static/icons,
 *   故将 38 个图标 svg 拷入 frontend/src/assets/icons,用 import.meta.glob 以 URL 加载。
 *
 * 图标来源:material-icon-theme (npm) — Material Design Icons for VS Code
 * 纯函数,不依赖 DOM/window。组件(FileTree/RefChips 等)应通过 FileTypeIcon 渲染。
 */

// ── 异步 glob:key 为 "…/assets/icons/<name>.svg",value 为打包后的资源 URL ──
const iconModules = import.meta.glob('../assets/icons/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
});

/** 已加载的图标名称 → URL 映射(key 为 "name.svg") */
const iconUrlByName: Record<string, string> = {};
for (const [path, url] of Object.entries(iconModules)) {
  const name = path.slice(path.lastIndexOf('/') + 1);
  iconUrlByName[name] = url as string;
}

// ── 扩展名 → SVG 文件名映射 ─────────────────────────────

const EXT_ICON_MAP: Record<string, string> = {
  // JavaScript
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  // TypeScript
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  // Web
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'css',
  less: 'css',
  sass: 'css',
  // Data / Config
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  xml: 'xml',
  toml: 'settings',
  // Markdown
  md: 'markdown',
  mdx: 'markdown',
  // Python
  py: 'python',
  pyw: 'python',
  // Java / JVM
  java: 'java',
  class: 'javaclass',
  kt: 'kotlin',
  kts: 'kotlin',
  groovy: 'settings',
  // Go
  go: 'go',
  // Rust
  rs: 'rust',
  // C / C++
  c: 'c',
  h: 'h',
  cpp: 'cpp',
  hpp: 'hpp',
  cs: 'csharp',
  // Shell
  sh: 'console',
  bash: 'console',
  zsh: 'console',
  ps1: 'console',
  bat: 'console',
  cmd: 'console',
  // Images
  svg: 'image',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  ico: 'image',
  bmp: 'image',
  // Frameworks
  vue: 'vue',
  svelte: 'svelte',
  // Database
  sql: 'database',
  // Docker
  dockerfile: 'docker',
  // Gradle / Maven
  gradle: 'gradle',
  // Git
  gitignore: 'git',
  gitattributes: 'git',
  // Archives
  zip: 'zip',
  tar: 'zip',
  gz: 'zip',
  rar: 'zip',
  '7z': 'zip',
  tgz: 'zip',
  // Documents
  pdf: 'pdf',
  docx: 'word',
  doc: 'word',
  xlsx: 'excel',
  xls: 'excel',
  csv: 'excel',
  pptx: 'powerpoint',
  ppt: 'powerpoint',
};

const FULLNAME_ICON_MAP: Record<string, string> = {
  dockerfile: 'docker',
  makefile: 'settings',
  license: 'document',
  readme: 'document',
};

// ── 辅助函数 ────────────────────────────────────────────

function _getExt(fileName: string): string {
  const dotIndex = fileName.lastIndexOf('.');
  return dotIndex > 0 ? fileName.slice(dotIndex + 1).toLowerCase() : '';
}

function _getBaseName(fileName: string): string {
  return fileName.toLowerCase();
}

/**
 * 获取文件扩展名对应的图标名称(如 "javascript.svg")。
 * 逻辑与旧版 utils/file-icons.js 的 getFileIconInfo 对齐,仅返回图标文件名。
 */
export function getFileIconName(fileName: string): string {
  if (!fileName) return 'file.svg';

  const baseName = _getBaseName(fileName);

  // 1. 全名匹配(Dockerfile、Makefile 等无扩展名文件)
  const iconName = FULLNAME_ICON_MAP[baseName];
  if (iconName) return iconName + '.svg';

  // 2. 特殊文件匹配
  if (baseName === '.gitignore' || baseName.endsWith('.gitignore')) return 'git.svg';
  if (baseName === '.gitattributes' || baseName.endsWith('.gitattributes')) return 'git.svg';
  if (baseName.endsWith('.env')) return 'settings.svg';

  // 3. 锁文件
  const lockFiles = ['yarn.lock', 'pnpm-lock.yaml', 'pnpm-lock.yml'];
  if (lockFiles.includes(baseName)) return 'lock.svg';

  // 4. Dockerfile 变体
  if (baseName === 'dockerfile' || baseName.startsWith('dockerfile.')) return 'docker.svg';

  // 5. 扩展名匹配
  const ext = _getExt(fileName);
  const matchedIconName = EXT_ICON_MAP[ext];
  if (matchedIconName) return matchedIconName + '.svg';

  // 6. 有扩展名但无匹配 → document
  if (ext) return 'document.svg';

  // 7. 无扩展名 → 通用文件
  return 'file.svg';
}

/**
 * 获取图标资源的 URL(可用于 <img src>)。未加载到对应资源时回退 file.svg。
 */
export function getFileIconUrl(fileName: string, isDirectory = false): string {
  if (isDirectory) return iconUrlByName['folder.svg'] ?? '';
  return iconUrlByName[getFileIconName(fileName)] ?? iconUrlByName['file.svg'] ?? '';
}