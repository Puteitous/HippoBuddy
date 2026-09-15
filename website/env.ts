/**
 * 极简 .env.local 加载器
 *
 * Docusaurus 默认不会自动读取 .env 文件, 因此自行加载站点的 .env.local,
 * 把其中声明的变量填充到 process.env。
 *
 * 规则:
 *   - 仅当某个键尚未被设置时才填充(已存在的环境变量优先, 如 CI 注入)。
 *   - 仅处理本项目需要的键, 不做通用 dotenv 替换。
 *
 * 用法: 在 docusaurus.config.ts 顶部调用 loadEnv()。
 */
const ENV_FILE = '.env.local';

// 本配置需要从 .env.local 读取的键
const SUPPORTED_KEYS = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'];

export function loadEnv() {
  const file = `${__dirname}\\${ENV_FILE}`;
  try {
    // eslint-disable-next-line n/no-explicit-require
    const fs = require('node:fs');
    if (!fs.existsSync(file)) return;
    const raw = fs.readFileSync(file, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!match) continue;
      const key = match[1].toUpperCase();
      if (!SUPPORTED_KEYS.includes(key)) continue;
      // 已有环境变量优先, 不做覆盖
      if (process.env[key] !== undefined) continue;
      process.env[key] = match[2];
    }
  } catch {
    // 读取失败静默忽略, 交由上游(环境变量/CI)决定
  }
}