/**
 * WorkspaceManager — 工作区编排层
 *
 * 管理三个核心交互：
 *   1. 侧栏视图切换（会话列表 ↔ 文件树）
 *   2. 文件树 → 标签 → 预览联动
 *   3. 工作区打开/清除
 *
 * 依赖：
 *   - window.HippoDesktop（桌面端 bridge）
 *   - FileTree, FileTabs, FilePreview 组件
 *
 * Web 端没有 cefQuery，本模块自动降级。
 */

import { FileTree } from './components/FileTree.js';
import { FileTabs } from './components/FileTabs.js';
import { FilePreview } from './components/FilePreview.js';

const HippoWorkspace = (() => {
  if (typeof window.cefQuery === 'undefined') {
    return { isAvailable: false };
  }

  // JCEF 环境：覆盖 .desktop-only 的 display:none
  (function enableDesktopUI() {
    const s = document.createElement('style');
    s.textContent = '.desktop-only { display: initial !important; }';
    document.head.appendChild(s);
  })();

  // DOM 元素
  const els = {
    sessionList: document.getElementById('sessionList'),
    fileTreeView: document.getElementById('fileTreeView'),
    fileTreeBody: document.getElementById('fileTreeBody'),
    fileTreeEmpty: document.getElementById('fileTreeEmpty'),
    tabBar: document.getElementById('fileTabBar'),
    tabs: document.getElementById('fileTabs'),
    previewArea: document.getElementById('filePreviewArea'),
    previewContent: document.getElementById('filePreviewContent'),
    previewPath: document.getElementById('filePreviewPath'),
    previewBack: document.getElementById('filePreviewBack'),
    chatPanel: document.querySelector('.chat-panel'),
    viewSwitcher: document.getElementById('sidebarViewSwitcher'),
    viewBtns: null,
    workspaceIndicator: document.getElementById('workspaceIndicator'),
    workspacePath: document.getElementById('workspacePath'),
  };

  // 视图切换按钮
  if (els.viewSwitcher) {
    els.viewBtns = els.viewSwitcher.querySelectorAll('.capsule-btn');
  }

  if (!els.fileTreeBody || !els.tabs || !els.previewContent) {
    console.warn('HippoWorkspace: required DOM not found');
    return { isAvailable: false };
  }

  // ========== 组件实例 ==========
  const fileTree = new FileTree({
    container: els.fileTreeBody,
    onFileSelect: handleFileSelect,
    onError: (err) => console.error('FileTree:', err),
  });

  const fileTabs = new FileTabs({
    container: els.tabs,
    onTabSelect: handleTabSelect,
    onTabClose: handleTabClose,
  });

  const filePreview = new FilePreview({
    container: els.previewContent,
    onError: (err) => console.error('FilePreview:', err),
  });

  // ========== 状态 ==========
  let _currentRoot = null;
  let _currentView = 'sessions'; // 'sessions' | 'files'

  // ========== 公开 API ==========

  const api = {
    get isAvailable() { return true; },
    get currentPath() { return _currentRoot; },
    get fileTabs() { return fileTabs; },

    async openWorkspace(path) {
      if (!path) return;
      _currentRoot = path;

      // 显示视图切换器和工作区指示器
      if (els.viewSwitcher) els.viewSwitcher.style.display = '';
      if (els.workspaceIndicator && els.workspacePath) {
        els.workspacePath.textContent = path;
        els.workspacePath.title = path;
        els.workspaceIndicator.style.display = '';
      }

      // 加载文件树
      fileTree.clear();
      fileTabs.closeAll();
      hidePreview();
      await fileTree.loadRoot(path);

      // 文件树模式可见
      if (els.fileTreeEmpty) els.fileTreeEmpty.style.display = 'none';

      // 自动切换到文件视图
      switchView('files');
    },

    clearWorkspace() {
      _currentRoot = null;
      _currentView = 'sessions';
      fileTree.clear();
      fileTabs.closeAll();
      hidePreview();
      if (els.fileTreeEmpty) els.fileTreeEmpty.style.display = '';
      if (els.viewSwitcher) els.viewSwitcher.style.display = 'none';
      if (els.workspaceIndicator) els.workspaceIndicator.style.display = 'none';
      switchView('sessions');
    },

    /** 切换到文件视图（外部触发） */
    showFileTree() {
      switchView('files');
    },

    /** 切换到会话视图 */
    showSessions() {
      switchView('sessions');
    },

    /** 刷新当前预览的文件 */
    refreshCurrentFile() {
      if (filePreview.currentPath) {
        filePreview.reload();
      }
    },
  };

  // ========== 侧栏视图切换 ==========

  function switchView(view) {
    _currentView = view;

    // 更新按钮状态
    if (els.viewBtns) {
      for (const btn of els.viewBtns) {
        btn.classList.toggle('active', btn.dataset.view === view);
      }
    }

    // 通过 .view-files class 控制显示（配合 CSS 的 !important 对抗 desktop-only 注入）
    document.getElementById('sessionPanel').classList.toggle('view-files', view === 'files');

    // 切换内容
    if (els.sessionList) {
      els.sessionList.style.display = view === 'sessions' ? '' : 'none';
    }
  }

  // 绑定视图切换按钮
  if (els.viewBtns) {
    for (const btn of els.viewBtns) {
      btn.addEventListener('click', () => {
        switchView(btn.dataset.view);
      });
    }
  }

  // ========== 文件选择流 ==========

  function handleFileSelect(filePath) {
    const displayName = filePath.split('/').pop() || filePath;
    fileTabs.openTab(filePath, displayName);
    fileTree.setActiveFile(filePath);
    showPreview(filePath);
  }

  function handleTabSelect(filePath) {
    fileTree.setActiveFile(filePath);
    showPreview(filePath);
  }

  function handleTabClose(filePath) {
    if (fileTabs.count === 0) {
      hidePreview();
    }
  }

  // ========== 预览控制 ==========

  function showPreview(filePath) {
    filePreview.show(filePath);
    if (els.previewPath) {
      els.previewPath.textContent = filePath;
      els.previewPath.title = filePath;
    }
    if (els.chatPanel) {
      els.chatPanel.classList.add('has-preview');
    }
  }

  function hidePreview() {
    filePreview.clear();
    if (els.chatPanel) {
      els.chatPanel.classList.remove('has-preview');
    }
  }

  // ========== 事件绑定 ==========

  // 返回聊天按钮
  if (els.previewBack) {
    els.previewBack.addEventListener('click', () => {
      hidePreview();
    });
  }

  // 工作区清除按钮
  const clearBtn = document.getElementById('workspaceClear');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      api.clearWorkspace();
      // 同步清除后端状态
      if (window.HippoDesktop && window.HippoDesktop.clearCurrentFolder) {
        window.HippoDesktop.clearCurrentFolder();
      }
    });
  }

  console.log('HippoWorkspace initialized ✅');
  return api;
})();

window.HippoWorkspace = HippoWorkspace;
