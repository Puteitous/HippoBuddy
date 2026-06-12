/**
 * file-icons — 文件扩展名 → Material Icon Theme SVG 图标
 *
 * 职责：
 *   根据文件名返回对应的 SVG 图标文件路径，
 *   纯函数，不依赖 DOM/window。
 *
 * 图标来源：material-icon-theme (npm) — Material Design Icons for VS Code
 * 图标文件位于 /icons/ 目录下
 */

// ── 扩展名 → SVG 文件名映射 ─────────────────────────────

const EXT_ICON_MAP = {
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
};

const FULLNAME_ICON_MAP = {
  dockerfile: 'docker',
  makefile: 'settings',
  license: 'document',
  readme: 'document',
};

// ── 辅助函数 ────────────────────────────────────────────

function _getExt(fileName) {
  const dotIndex = fileName.lastIndexOf('.');
  return dotIndex > 0 ? fileName.slice(dotIndex + 1).toLowerCase() : '';
}

function _getBaseName(fileName) {
  return fileName.toLowerCase();
}

// ── 公开 API ────────────────────────────────────────────

/**
 * 获取文件图标信息
 * @param {string} fileName
 * @param {{ isDirectory?: boolean }} [options]
 * @returns {{ iconFile: string }}
 *   - iconFile: SVG 文件名（如 "javascript.svg"），相对于 /icons/ 目录
 */
export function getFileIconInfo(fileName, options) {
  if (!fileName) return { iconFile: 'file.svg' };

  // 文件夹
  if (options?.isDirectory) {
    return { iconFile: 'folder.svg' };
  }

  const baseName = _getBaseName(fileName);

  // 1. 全名匹配（Dockerfile、Makefile 等无扩展名文件）
  const iconName = FULLNAME_ICON_MAP[baseName];
  if (iconName) return { iconFile: iconName + '.svg' };

  // 2. 特殊文件匹配
  if (baseName === '.gitignore' || baseName.endsWith('.gitignore')) {
    return { iconFile: 'git.svg' };
  }
  if (baseName === '.gitattributes' || baseName.endsWith('.gitattributes')) {
    return { iconFile: 'git.svg' };
  }
  if (baseName.endsWith('.env')) return { iconFile: 'settings.svg' };

  // 3. 锁文件
  const lockFiles = ['yarn.lock', 'pnpm-lock.yaml', 'pnpm-lock.yml'];
  if (lockFiles.includes(baseName)) return { iconFile: 'lock.svg' };

  // 4. Dockerfile 变体
  if (baseName === 'dockerfile' || baseName.startsWith('dockerfile.')) {
    return { iconFile: 'docker.svg' };
  }

  // 5. 扩展名匹配
  const ext = _getExt(fileName);
  const matchedIconName = EXT_ICON_MAP[ext];
  if (matchedIconName) return { iconFile: matchedIconName + '.svg' };

  // 6. 有扩展名但无匹配 → document
  if (ext) return { iconFile: 'document.svg' };

  // 7. 无扩展名 → 通用文件
  return { iconFile: 'file.svg' };
}
