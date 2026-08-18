/**
 * Settings 面板 toast 视图 - re-export 自 utils
 *
 * 3.7-1:toast 视图提升到 utils/,并由 AppShell 全局挂载。
 * 此文件保留以兼容 SettingsPanel 内部 import { ToastViewport } from './toast'。
 */
export { ToastViewport } from '@/utils/toast';
