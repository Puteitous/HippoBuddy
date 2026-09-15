/**
 * 建议反馈 · Supabase 连接配置
 *
 * 桌面端无构建环境变量, anon/publishable key 本就对浏览器公开,
 * 安全完全依赖 RLS(表 feedback 仅 INSERT、拒 SELECT; 存储桶公开读 + 匿名写)。
 * 与官网(website/)共用同一套 Supabase 项目与表。
 */
export const FEEDBACK_CONFIG = {
  supabaseUrl: 'https://tdqminrknaiszdvlniko.supabase.co',
  supabaseAnonKey: 'sb_publishable_fH2zgAEfA2qajZxce3Pu8w_t4H47by8',
} as const;