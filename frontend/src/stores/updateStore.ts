/**
 * 自动更新状态 (Zustand)
 *
 * 对齐旧版 static/js/main.js 的更新逻辑：
 *  - 状态机：idle → checking → available → downloading → downloaded → (install)
 *  - download 后台完成后由主进程系统通知提醒；若用户此前取消了卡片(dismissed)，
 *    主进程再次推送 downloaded 时不再自动弹卡片。
 *  - 事件来自 Electron preload 注入的 electronAPI.update:* 回调，
 *    经 desktopBridge.onUpdateEvents 统一注册。
 *
 * 3.7-4:为新前端补齐自动更新能力(对齐旧版 updater 卡片)。
 */
import { create } from 'zustand';
import { desktopBridge } from '@/utils/desktop-bridge';
import { showToast } from '@/utils/toastStore';
import { translate } from '@/i18n';

export type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error';

interface UpdateState {
  /** 当前更新状态 */
  status: UpdateStatus;
  /** 新版本信息(available/downloaded 时有效) */
  info: UpdateInfo | null;
  /** 下载进度(downloading 时有效) */
  progress: UpdateProgress | null;
  /** 错误信息(status=error 时有效) */
  errorMsg: string;
  /** 用户是否已关闭卡片(不主动打断;下载完成仅靠系统通知提醒) */
  dismissed: boolean;

  /** 注册 Electron 自动更新事件监听(应用启动调用一次) */
  registerListeners: () => () => void;
  /** 手动检查更新 */
  checkForUpdates: () => Promise<void>;
  /** 开始下载更新 */
  download: () => Promise<void>;
  /** 重启安装 */
  install: () => Promise<void>;
  /** 关闭卡片(可见性;后台下载仍继续) */
  dismiss: () => void;
  /** 重新展示卡片(重置 dismissed,供再次手动检查/重新弹卡) */
  showCard: () => void;
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  status: 'idle',
  info: null,
  progress: null,
  errorMsg: '',
  dismissed: false,

  registerListeners: () => {
    return desktopBridge.onUpdateEvents({
      onChecking: () => {
        if (!get().dismissed) set({ status: 'checking', errorMsg: '' });
      },
      onAvailable: (info) => {
        // 发现新版本 → 若用户未关闭卡片则弹出更新卡片
        if (get().dismissed) return;
        set({ status: 'available', info, progress: null, errorMsg: '' });
      },
      onNotAvailable: () => {
        // 手动检查的"已是最新"反馈由 toast 提示,不重复弹卡
        if (get().status === 'checking') {
          showToast(translate('updater.upToDate'), { type: 'success' });
          set({ status: 'idle' });
        }
      },
      onError: (msg) => {
        set({ status: 'error', errorMsg: msg });
        showToast(translate('updater.checkFailed', { message: msg }), { type: 'error' });
      },
      onDownloadProgress: (progress) => {
        // 后台下载:即使卡片已关闭也持续更新状态,供系统通知/重新展开时展示进度
        set({ status: 'downloading', progress });
      },
      onDownloaded: (info) => {
        // 用户此前关闭卡片(后台下载) → 不自动弹卡,主进程系统通知已提醒;
        // 未关闭 → 弹出"重启安装"卡片。
        if (get().dismissed) return;
        set({ status: 'downloaded', info, progress: null });
      },
    });
  },

  checkForUpdates: async () => {
    set({ status: 'checking', errorMsg: '', dismissed: false });
    const r = await desktopBridge.checkForUpdates();
    if (!r.success) {
      // 非桌面端或检查失败:回到 idle,避免旋钮永久转圈
      set({ status: 'idle', errorMsg: r.error || '' });
    }
    // 成功时等待 onAvailable / onNotAvailable 事件驱动状态切换
  },

  download: async () => {
    set({ status: 'downloading', progress: { percent: 0 } });
    const r = await desktopBridge.downloadUpdate();
    if (!r.success) {
      set({ status: 'error', errorMsg: r.error || '' });
      showToast(translate('updater.downloadFailed', { message: r.error || '' }), { type: 'error' });
    }
  },

  install: async () => {
    await desktopBridge.quitAndInstall();
  },

  dismiss: () => set({ dismissed: true, status: 'idle' }),
  showCard: () => set({ dismissed: false }),
}));
