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
import { EventBus } from './utils/event-bus.js';
import { ConfirmDialog } from './utils/modal.js';
import { showBottomToast } from './utils/toast.js';

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
    previewPanel: document.getElementById('previewPanel'),
    previewArea: document.getElementById('filePreviewArea'),
    previewContent: document.getElementById('filePreviewContent'),
    previewPath: document.getElementById('filePreviewPath'),
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

  // 桌面端默认显示视图切换胶囊（工作区状态不影响）
  if (els.viewSwitcher) els.viewSwitcher.style.display = '';

  // ========== 组件实例 ==========
  const fileTree = new FileTree({
    container: els.fileTreeBody,
    onFileSelect: handleFileSelect,
    onRefresh: _saveWorkspaceSession,
    onError: (err) => console.error('FileTree:', err),
  });

  const fileTabs = new FileTabs({
    container: els.tabs,
    onTabSelect: handleTabSelect,
    onTabClose: handleTabClose,
    onBeforeSwitch: async (fromPath, toPath) => {
      if (filePreview.isDirty && filePreview.currentPath === fromPath) {
        const name = fromPath.split('/').pop() || fromPath;
        const result = await ConfirmDialog.saveDiscardCancel(`"${name}" 有未保存的修改，是否保存？`);
        if (result === 'save') {
          await filePreview.save();
          return true;
        }
        return result !== 'cancel';
      }
      return true;
    },
    onBeforeClose: async (filePath) => {
      if (filePreview.isDirty && filePreview.currentPath === filePath) {
        const name = filePath.split('/').pop() || filePath;
        const result = await ConfirmDialog.closeConfirm(`"${name}" 有未保存的修改，是否保存？`);
        if (result === 'save') {
          await filePreview.save();
          return true;
        }
        return result !== 'cancel';
      }
      return true;
    },
  });

  const filePreview = new FilePreview({
    container: els.previewContent,
    onError: (err) => console.error('FilePreview:', err),
    onDirtyChange: (filePath, dirty) => {
      fileTabs.setDirty(filePath, dirty);
    },
  });

  // ========== 状态 ==========
  let _currentRoot = null;
  let _currentView = 'sessions'; // 'sessions' | 'files'

  // ========== 最近文件夹管理 ==========

  const RECENT_FOLDERS_KEY = 'hippo-recent-folders';
  const MAX_RECENT_FOLDERS = 20;

  function _syncRecentFolders() {
    _renderRecentFolders();
  }

  function _getRecentFolders() {
    try {
      const raw = localStorage.getItem(RECENT_FOLDERS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  function _saveRecentFolder(folderPath) {
    let folders = _getRecentFolders();
    // 去重，把当前放到最前面
    folders = folders.filter(f => f !== folderPath);
    folders.unshift(folderPath);
    if (folders.length > MAX_RECENT_FOLDERS) {
      folders = folders.slice(0, MAX_RECENT_FOLDERS);
    }
    localStorage.setItem(RECENT_FOLDERS_KEY, JSON.stringify(folders));
    _syncRecentFolders();
  }

  function _removeRecentFolder(folderPath) {
    const folders = _getRecentFolders().filter(f => f !== folderPath);
    localStorage.setItem(RECENT_FOLDERS_KEY, JSON.stringify(folders));
    _syncRecentFolders();
    _renderRecentFolders();
  }

  // ========== 工作区会话持久化（标签页 + 预览恢复） ==========

  function _saveWorkspaceSession() {
    if (!_currentRoot) return;
    const openFiles = fileTabs.openPaths;
    if (openFiles.length === 0) {
      try { localStorage.removeItem('hippo-workspace-session'); } catch(e) {}
      return;
    }
    const session = {
      root: _currentRoot,
      openFiles: openFiles,
      activeFile: fileTabs.activePath
    };
    try {
      localStorage.setItem('hippo-workspace-session', JSON.stringify(session));
    } catch(e) {}
  }

  function _restoreWorkspaceSession() {
    if (!_currentRoot) return;
    _restoreFromLocalStorage();
  }

  function _restoreFromLocalStorage() {
    try {
      const raw = localStorage.getItem('hippo-workspace-session');
      if (!raw) return;
      const session = JSON.parse(raw);
      if (session.root !== _currentRoot) return;
      _applyRestoredSession(session);
    } catch(e) {
      console.warn('从 localStorage 恢复工作区标签页失败', e);
    }
  }

  async function _applyRestoredSession(session) {
    const files = session.openFiles || [];
    if (files.length === 0) return;

    // 临时替换回调，批量打开标签时不逐个触发预览
    const savedCallback = fileTabs._onTabSelect;
    fileTabs._onTabSelect = () => {};

    for (const filePath of files) {
      const displayName = filePath.split('/').pop() || filePath;
      await fileTabs.openTab(filePath, displayName);
    }

    // 恢复回调
    fileTabs._onTabSelect = savedCallback;

    // 切换到激活的文件
    if (session.activeFile && files.includes(session.activeFile)) {
      await fileTabs._selectTab(session.activeFile);
    } else {
      await fileTabs._selectTab(files[files.length - 1]);
    }

    // 显式触发预览（_selectTab 在目标已是 activePath 时会提前返回，不触发回调）
    const target = session.activeFile && files.includes(session.activeFile)
      ? session.activeFile
      : files[files.length - 1];
    fileTree.setActiveFile(target);
    showPreview(target);
  }

  function _renderRecentFolders() {
    const listEl = document.getElementById('recentFoldersList');
    const dropdown = document.getElementById('recentFoldersDropdown');
    if (!listEl) return;
    const folders = _getRecentFolders();
    if (folders.length === 0) {
      listEl.innerHTML = '<div class="header-folder-dropdown-empty">暂无最近打开的文件夹</div>';
      return;
    }
    listEl.innerHTML = folders.map(f => `
      <div class="header-folder-dropdown-item" data-path="${f.replace(/"/g, '&quot;')}">
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3.5h5l2 2h5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z"/></svg>
        <span class="folder-item-path">${f.replace(/</g, '&lt;')}</span>
        <button class="folder-item-remove" data-path="${f.replace(/"/g, '&quot;')}" title="移除">✕</button>
      </div>
    `).join('');

    // 点击项目打开文件夹
    listEl.querySelectorAll('.header-folder-dropdown-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.folder-item-remove')) return;
        const path = item.dataset.path;
        if (path) {
          dropdown.classList.remove('show');
          api.openWorkspace(path);
          showBottomToast('工作区已切换: ' + path);
        }
      });
    });

    // 点击 ✕ 移除
    listEl.querySelectorAll('.folder-item-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        _removeRecentFolder(btn.dataset.path);
      });
    });
  }

  // ========== 公开 API ==========

  const api = {
    get isAvailable() { return true; },
    get currentPath() { return _currentRoot; },
    get fileTabs() { return fileTabs; },

    async openWorkspace(path, isDefault) {
      if (!path) return;
      _currentRoot = path.replace(/\\/g, '/');

      // 保存到最近文件夹（默认工作区不加入最近列表）
      if (!isDefault) {
        _saveRecentFolder(_currentRoot);
      }
      _renderRecentFolders();

      // 持久化到 workspace.txt，确保重启后可恢复
      if (window.HippoDesktop?.setCurrentFolder) {
        window.HippoDesktop.setCurrentFolder(_currentRoot).catch(() => {});
      }

      // 显示视图切换器和工作区指示器
      if (els.viewSwitcher) els.viewSwitcher.style.display = '';
      if (els.workspaceIndicator && els.workspacePath) {
        if (isDefault) {
          els.workspacePath.textContent = '默认工作区';
          els.workspacePath.title = path;
        } else {
          els.workspacePath.textContent = path;
          els.workspacePath.title = path;
        }
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

      // 恢复上次打开的标签页和预览
      _restoreWorkspaceSession();
    },

    async clearWorkspace() {
      // closeAll 内部会检查脏文件并弹窗，用户取消则中止
      if (fileTabs.count > 0 && !(await fileTabs.closeAll())) return;

      // 重置后端到默认工作区
      if (window.HippoDesktop?.clearCurrentFolder) {
        await window.HippoDesktop.clearCurrentFolder();
      }

      // 重新加载默认工作区
      if (window.HippoDesktop?.isDefaultWorkspace) {
        const defaultResult = await window.HippoDesktop.isDefaultWorkspace();
        const folderResult = await window.HippoDesktop.getCurrentFolder();
        if (folderResult?.path) {
          await api.openWorkspace(folderResult.path, defaultResult?.isDefault ?? true);
          return;
        }
      }

      // fallback: 隐藏指示器
      _currentRoot = null;
      _currentView = 'sessions';
      fileTree.clear();
      hidePreview();
      if (els.fileTreeEmpty) els.fileTreeEmpty.style.display = '';
      if (els.workspaceIndicator) els.workspaceIndicator.style.setProperty('display', 'none', 'important');
      try { localStorage.removeItem('hippo-workspace-session'); } catch(e) {}
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

    /**
     * 打开内嵌浏览器标签页
     * @param {string} url - 完整 URL
     * @param {string} [displayName] - 标签显示名，默认自动从 URL 提取
     */
    async openWebBrowser(url, displayName) {
      if (!url) return;
      // 自动补全协议（跳过已有协议和 about: 这类特殊 URL）
      let fullUrl = url.trim();
      if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/i.test(fullUrl)) {
        fullUrl = 'https://' + fullUrl;
      }
      // 切换到文件视图确保能显示预览
      switchView('files');
      await fileTabs.openWebTab(fullUrl, displayName);
    },

    /**
     * 浏览器地址栏 URL 变更回调（由 FilePreview._bindBrowserEvents 调用）
     * 用于更新 web 标签的 key，使下次切换时能命中
     */
    onBrowserUrlChange(url) {
      // showBrowser 时已更新 _currentPath，只需重新持久化
      _saveWorkspaceSession();
    },

    /** 刷新文件树（保留展开状态），AI 工具调用后自动调用 */
    refreshFileTree() {
      fileTree.refresh();
    },

    /** 渲染最近文件夹下拉列表 */
    renderRecentFolders() {
      _renderRecentFolders();
    },

    /**
     * 导航到文件（切换文件视图、打开文件、跳转行号）
     * 如果是目录路径，则在文件树中展开并高亮该目录。
     * @param {string} filePath - 绝对或相对路径
     * @param {number} [startLine] - 1-based 起始行号
     * @param {number} [endLine] - 1-based 结束行号，提供则选中范围
     */
    async navigateToFile(filePath, startLine, endLine) {
      let absPath = filePath;
      // 相对路径 → 拼接工作区根路径
      if (absPath && !absPath.startsWith('/') && !absPath.match(/^[a-zA-Z]:/)) {
        absPath = _currentRoot ? _currentRoot + '/' + absPath : absPath;
      }
      if (!absPath) return;

      // 检测路径是否为目录
      try {
        const result = await window.HippoDesktop.isDirectory(absPath);
        if (result && result.isDirectory) {
          // 目录：切换到文件视图，在文件树中展开并高亮
          switchView('files');
          await fileTree.revealDirectory(absPath);
          return;
        }
      } catch (e) {
        // isDirectory 不可用或失败，回退到文件行为
        console.debug('navigateToFile: isDirectory check failed, fallback to file behavior', e);
      }

      // 文件：保持现有行为
      handleFileSelect(absPath);
      if (startLine != null) {
        // 等文件加载渲染完成后滚动到指定行
        setTimeout(() => filePreview.scrollToLine(startLine, endLine), 100);
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

  async function handleFileSelect(filePath) {
    const displayName = filePath.split('/').pop() || filePath;
    await fileTabs.openTab(filePath, displayName);
    await fileTree.revealFile(filePath);
    showPreview(filePath);
    // 打开文件后持久化标签页状态
    _saveWorkspaceSession();
  }

  async function handleTabSelect(filePath) {
    // 检测是否为 web 标签
    if (filePath && filePath.startsWith('url:')) {
      const url = filePath.slice(4);
      filePreview.showBrowser(url);
      // 显示预览面板，不显示面包屑路径
      if (els.previewPanel) {
        els.previewPanel.classList.remove('hidden');
      }
      if (els.previewPath) {
        els.previewPath.textContent = url;
        els.previewPath.title = url;
      }
      return;
    }
    await fileTree.revealFile(filePath);
    showPreview(filePath);
  }

  function handleTabClose(filePath) {
    if (fileTabs.count === 0) {
      hidePreview();
    }
    // 关闭标签后持久化标签页状态
    _saveWorkspaceSession();
  }

  // ========== 预览控制 ==========

  function showPreview(filePath) {
    filePreview.show(filePath);
    if (els.previewPath) {
      // 显示相对于工作区根目录的路径，IDE 面包屑风格 (xx > xx > xx)
      const relativePath = _currentRoot && filePath.startsWith(_currentRoot)
        ? filePath.slice(_currentRoot.length + 1)
        : filePath;
      els.previewPath.innerHTML = relativePath.split('/').join('<span class="sep">></span>');
      els.previewPath.title = filePath;
    }
    if (els.previewPanel) {
      els.previewPanel.classList.remove('hidden');
    }
  }

  function hidePreview() {
    filePreview.clear();
    if (els.previewPanel) {
      els.previewPanel.classList.add('hidden');
    }
    // 恢复聊天面板（如果被折叠了）
    chatPanel.classList.remove('collapsed');
    if (resizer) resizer.style.display = '';
    const showBtn = document.getElementById('chatShowBtn');
    if (showBtn) showBtn.style.display = 'none';
  }

  // ========== 事件绑定 ==========

  // 工作区清除按钮
  const clearBtn = document.getElementById('workspaceClear');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      api.clearWorkspace();
    });
  }

  // ========== 聊天面板宽度拖拽 ==========
  const resizer = document.getElementById('chatResizer');
  const chatPanel = document.querySelector('.chat-panel');
  if (resizer && chatPanel) {
    // 恢复上次保存的宽度
    const saved = localStorage.getItem('hippo-chat-width');
    if (saved) {
      document.documentElement.style.setProperty('--chat-panel-width', saved + 'px');
    }

    resizer.addEventListener('mousedown', (e) => {
      e.preventDefault();
      resizer.classList.add('resizing');
      const startX = e.clientX;
      const startWidth = chatPanel.offsetWidth;

      const onMove = (ev) => {
        const diff = startX - ev.clientX;
        const w = Math.max(320, Math.min(720, startWidth + diff));
        document.documentElement.style.setProperty('--chat-panel-width', w + 'px');
      };

      const onUp = () => {
        resizer.classList.remove('resizing');
        const finalW = document.documentElement.style.getPropertyValue('--chat-panel-width').replace('px', '').trim();
        if (finalW) localStorage.setItem('hippo-chat-width', finalW);
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  // ========== 左侧面板宽度拖拽 ==========
  const sessionResizer = document.getElementById('sessionResizer');
  const sessionPanel = document.getElementById('sessionPanel');
  if (sessionResizer && sessionPanel) {
    const saved = localStorage.getItem('hippo-session-width');
    if (saved) {
      document.documentElement.style.setProperty('--session-panel-width', saved + 'px');
    }

    sessionResizer.addEventListener('mousedown', (e) => {
      e.preventDefault();
      sessionResizer.classList.add('resizing');
      sessionPanel.classList.add('resizing');
      const startX = e.clientX;
      const startWidth = sessionPanel.offsetWidth;

      const onMove = (ev) => {
        const diff = ev.clientX - startX; // 拖右为正，拖左为负
        const w = Math.max(180, Math.min(500, startWidth + diff));
        sessionPanel.classList.remove('hidden');
        document.documentElement.style.setProperty('--session-panel-width', w + 'px');
      };

      const onUp = () => {
        sessionResizer.classList.remove('resizing');
        sessionPanel.classList.remove('resizing');
        const finalW = document.documentElement.style.getPropertyValue('--session-panel-width').replace('px', '').trim();
        if (finalW) localStorage.setItem('hippo-session-width', finalW);
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  // ========== 面板折叠/展开按钮 ==========

  const chatShowBtn = document.getElementById('chatShowBtn');

  // 预览折叠
  document.getElementById('previewCollapseBtn')?.addEventListener('click', () => {
    hidePreview();
  });

  // 保存按钮
  document.getElementById('previewSaveBtn')?.addEventListener('click', () => {
    filePreview.save();
  });

  // 聊天折叠
  document.getElementById('chatCollapseBtn')?.addEventListener('click', () => {
    chatPanel.classList.add('collapsed');
    if (resizer) resizer.style.display = 'none';
    if (chatShowBtn) chatShowBtn.style.display = '';
  });

  // 展开聊天
  chatShowBtn?.addEventListener('click', () => {
    chatPanel.classList.remove('collapsed');
    // 移除内联样式，让 CSS 自行控制分隔条显隐
    if (resizer) resizer.style.display = '';
    chatShowBtn.style.display = 'none';
  });

  // ========== 事件订阅：文件变更时自动刷新文件树 ==========

  EventBus.on('file:changes-updated', () => {
    fileTree.refresh();
  });

  // AI 工具修改了当前预览的文件时，自动重新加载预览
  EventBus.on('file:preview-reload', (filePath) => {
    if (filePreview.currentPath && filePath &&
        filePreview.currentPath.replace(/\\/g, '/') === filePath.replace(/\\/g, '/')) {
      filePreview.reload();
    }
  });

  // 文件变更时刷新文件树（file-change-manager 在 `message:sent` 后自动检测变更并 emit 此事件）
  // AI 消息发送完成后不需要额外挂 fileTree.refresh()，防止双重刷新导致闪烁

  // ── 全局文件拖放保护 ────────────────────────────
  // 防止外部文件拖到非输入区时浏览器默认跳转/打开文件
  document.addEventListener('dragover', (e) => {
    if (e.dataTransfer.types?.includes('Files')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  });
  document.addEventListener('drop', (e) => {
    if (e.dataTransfer.types?.includes('Files')) {
      // 阻止浏览器默认行为（导航到文件路径），
      // 输入区内的 drop 由 ChatPanel 处理，也一起拦掉不影响
      e.preventDefault();
    }
  });

  console.log('HippoWorkspace initialized ✅');
  return api;
})();

window.HippoWorkspace = HippoWorkspace;
