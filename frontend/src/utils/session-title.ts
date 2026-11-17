/**
 * 会话显示名解析(侧栏 / 历史下拉 / 标签栏共用)
 *
 * 优先真实标题,其次临时显示名,最后用「会话 + 短 id」兜底。
 */
import type { Session } from '@/types';

export function sessionTitle(
  session: Pick<Session, 'id' | 'title'>,
  displayNames: Record<string, string>,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  if (session.title && session.title.trim()) return session.title;
  if (displayNames[session.id]) return displayNames[session.id];
  const shortId = session.id.replace(/^web-/, '').slice(-6);
  return shortId ? t('chat.sessionPrefix', { id: shortId }) : t('chat.unnamedSession');
}
