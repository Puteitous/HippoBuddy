/**
 * Settings 面板 toast store - re-export 自 utils
 *
 * 3.7-1:toast 提升到 utils/ 供全局复用。此文件保留以兼容现有 settings 内部
 * import './toastStore' 路径,后续可逐步迁移 import 到 '@/utils/toastStore'。
 */
export * from '@/utils/toastStore';
