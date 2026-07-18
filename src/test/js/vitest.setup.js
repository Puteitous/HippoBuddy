/**
 * Vitest 全局 setup — 为测试环境提供 window.i18n
 *
 * 直接引入真实的 i18n.js（IIFE 自动设置 window.i18n），
 * 确保翻译与生产环境完全一致，无需手动维护两份表。
 */

// i18n.js 的 IIFE 会设置 window.i18n，引入即可
import '../../main/resources/static/js/i18n.js';
