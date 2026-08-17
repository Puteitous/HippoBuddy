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
 * Web 端没有 Electron 桌面能力，本模块自动降级。
 */

import { FileTree } from './components/FileTree.js';
import { FileTabs } from './components/FileTabs.js';
import { FilePreview } from './components/FilePreview.js';
import { EventBus } from './utils/event-bus.js';
import { ConfirmDialog } from './utils/modal.js';
import { showBottomToast, showToast } from './utils/toast.js';

const HippoWorkspace = (() => {
  const isDesktop = window.electronAPI && window.electronAPI.isElectron;

  if (!isDesktop) {
    return { isAvailable: false };
  }

  // Electron 环境：覆盖 .desktop-only 的 display:none
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
    fileTreeRefresh: document.getElementById('fileTreeRefresh'),
    fileTreeCollapseAll: document.getElementById('fileTreeCollapseAll'),
    tabBar: document.getElementById('fileTabBar'),
    tabs: document.getElementById('fileTabs'),
    previewPanel: document.getElementById('previewPanel'),
    previewArea: document.getElementById('filePreviewArea'),
    previewContent: document.getElementById('filePreviewContent'),
    previewPath: document.getElementById('filePreviewPath'),
    previewToolbar: document.getElementById('filePreviewToolbar'),
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
        const name = fromPath.split(/[/\\]/).pop() || fromPath;
        const result = await ConfirmDialog.saveDiscardCancel(i18n.t('workspace.unsavedSingle', { name }));
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
        const name = filePath.split(/[/\\]/).pop() || filePath;
        const result = await ConfirmDialog.closeConfirm(i18n.t('workspace.unsavedSingle', { name }));
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
    onError: handlePreviewError,
    onDirtyChange: (filePath, dirty) => {
      fileTabs.setDirty(filePath, dirty);
    },
  });

  // ========== 预览错误处理 ==========

  /**
   * 预览错误统一处理：
   * - ENOENT（文件已被外部删除/重命名）→ 静默关闭死标签 + 刷新文件树 + toast 提示，控制台降级为 warn
   * - 其他错误 → 保持原样输出到控制台
   */
  function handlePreviewError(err) {
    const errMsg = err?.message || '';
    const isENOENT = errMsg.includes('ENOENT') || errMsg.includes('no such file');
    const filePath = filePreview.currentPath;

    if (isENOENT && filePath && !filePath.startsWith('url:') && !filePath.startsWith('diff:')) {
      const displayName = filePath.split(/[/\\]/).pop() || filePath;
      console.warn('FilePreview: file not found, closing stale tab:', filePath);
      // 静默关闭死标签（文件已不存在，保存无意义）；fire-and-forget 防止阻塞预览流程
      fileTabs.closeTabSilent(filePath).catch(e => {
        console.warn('FilePreview: failed to close stale tab:', e);
      });
      // 刷新文件树，移除已删除的条目
      fileTree.refresh();
      // 提示用户
      showToast(i18n.t('workspace.fileRemoved') + ' ' + displayName, { type: 'warning' });
      return;
    }
    console.error('FilePreview:', err);
  }

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
      activeFile: fileTabs.activePath,
      expandedDirs: fileTree.getExpandedDirs()
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
      const displayName = filePath.split(/[/\\]/).pop() || filePath;
      if (filePath.startsWith('url:')) {
        const url = filePath.slice(4);
        await fileTabs.openWebTab(url, displayName);
      } else if (filePath.startsWith('diff:')) {
        const target = filePath.slice(5);
        const diffName = (target.split(/[/\\]/).pop() || target) + ' ' + i18n.t('diff.tabSuffix');
        await fileTabs.openDiffTab(target, diffName);
      } else {
        await fileTabs.openTab(filePath, displayName);
      }
    }

    // 切换到激活的文件（此时 _onTabSelect 仍为空函数，避免误触 handleTabSelect 清除折叠标记）
    if (session.activeFile && files.includes(session.activeFile)) {
      await fileTabs._selectTab(session.activeFile);
    } else {
      await fileTabs._selectTab(files[files.length - 1]);
    }

    // 恢复回调（放在 _selectTab 之后，防止切换时误触 handleTabSelect 清除折叠状态）
    fileTabs._onTabSelect = savedCallback;

    // 显式触发预览（_selectTab 在目标已是 activePath 时会提前返回，不触发回调）。
    // 必须走 handleTabSelect 完整分流：恢复的 diff/url 标签与正常切换一致——
    // diff 标签隐藏 toolbar、显示相对路径面包屑、保留可点击样式；
    // 若直接调 showPreview(target)，diff: 前缀会被当普通文件处理，
    // 导致 toolbar 错误显示、面包屑错乱（刷新后复现）。
    const target = session.activeFile && files.includes(session.activeFile)
      ? session.activeFile
      : files[files.length - 1];
    fileTree.setActiveFile(target);
    await handleTabSelect(target);

    // 预览面板刚刚变为可见，重新滚动标签到激活标签位置
    // （之前的 _scrollTabIntoView 因面板 display:none 而无效）
    fileTabs.scrollActiveTabIntoView();

    // 恢复文件树展开状态（刷新树以渲染已展开的目录）
    if (session.expandedDirs && session.expandedDirs.length > 0) {
      fileTree.restoreExpandedDirs(session.expandedDirs);
      fileTree.refresh();
    }
  }

  function _renderRecentFolders() {
    const listEl = document.getElementById('recentFoldersList');
    const dropdown = document.getElementById('recentFoldersDropdown');
    if (!listEl) return;
    const folders = _getRecentFolders();
    if (folders.length === 0) {
      listEl.innerHTML = '<div class="header-folder-dropdown-empty">' + i18n.t('workspace.noRecentFolders') + '</div>';
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
          showBottomToast(i18n.t('workspace.switched') + path);
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

  // ── 默认工作区欢迎文件 ──
  const WELCOME_FILE_NAME = '👋 欢迎使用 HippoBuddy.md';
  const WELCOME_FILE_CONTENT = `# 👋 欢迎使用 HippoBuddy！

> *你的 AI 编程搭档，让写代码像聊天一样自然。*

---

## 🚀 快速上手

### 1️⃣ 开始对话

在右侧聊天面板中描述你的需求，按 \`Enter\` 发送。例如：

> *"帮我写一个 Python 的快速排序算法"*
> *"分析这个项目的代码结构"*
> *"给这段代码写单元测试"*

### 2️⃣ 打开项目文件夹

点击顶部工具栏的 **📂 文件夹图标**，选择你的项目目录。

支持：**Java** · **Python** · **JavaScript** · **TypeScript** · **Go** · **Rust** 等主流语言。

### 3️⃣ 探索功能

| 区域 | 功能 |
|---|---|
| 🔧 **左侧工具栏** | Token 统计 · 实时监控 · 文件变更 · 终端 · 浏览器 · 技能市场 |
| 📋 **会话列表** | 管理对话历史 · 重命名 · 分叉讨论 |
| ⚙️ **顶部设置** | 切换 AI 模型 · 主题切换 · 系统设置 |

---

## 💡 小技巧

- **拖拽文件** 到输入框，AI 可以读取并分析
- **会话分叉**：点击会话右上角分叉按钮，从某条消息继续探索
- **暗色模式**：点击顶部 🌙 图标切换

---

## 📚 需要帮助？

试试直接提问，比如：

- *"这个怎么用？"*
- *"帮我写个 Hello World"*
- *"如何打开我的项目文件夹？"*

或点击右侧聊天面板上方的 **快捷建议** 按钮一键开始。

---

*Happy Coding! 🎉*
`;

  // ── 默认工作区配置指南 ──
  const CONFIG_FILE_NAME = '🔧 配置指南.md';
  const CONFIG_FILE_CONTENT = `# 🔧 配置指南

> 首次使用前，需要配置 **AI 模型** 才能正常使用。**联网搜索** 可按需开启。

---

## 🤖 AI 模型配置

在右侧 **⚙️ 设置面板** 的「模型」选项卡中，或直接编辑 \`config.yaml\`，配置以下信息：

### 常见模型厂商

| 厂商 | 官网（建议直接搜索品牌名） | API 地址示例 |
|------|---------------------------|-------------|
| **DeepSeek** | [platform.deepseek.com](https://platform.deepseek.com) | \`https://api.deepseek.com\` |
| **DeepSeek Responses**（仅 \`deepseek-v4-flash\`，服务端联网搜索） | [platform.deepseek.com](https://platform.deepseek.com) | \`https://api.deepseek.com\`（不带 /v1） |
| **OpenAI** | [platform.openai.com](https://platform.openai.com) | \`https://api.openai.com/v1\` |
| **Anthropic** | [console.anthropic.com](https://console.anthropic.com) | \`https://api.anthropic.com\` |
| **Google Gemini** | [aistudio.google.com](https://aistudio.google.com) | \`https://generativelanguage.googleapis.com/v1beta\` |
| **月之暗面 (Kimi)** | [platform.moonshot.cn](https://platform.moonshot.cn) | \`https://api.moonshot.cn/v1\` |
| **阿里通义千问** | [help.aliyun.com/model-studio](https://help.aliyun.com/model-studio) | \`https://dashscope.aliyuncs.com/compatible-mode/v1\` |
| **字节豆包** | [console.volcengine.com/ark](https://console.volcengine.com/ark) | \`https://ark.cn-beijing.volces.com/api/v3\` |
| **智谱 AI** | [open.bigmodel.cn](https://open.bigmodel.cn) | \`https://open.bigmodel.cn/api/paas/v4\` |
| **MiniMax** | [platform.minimaxi.com](https://platform.minimaxi.com) | \`https://api.minimaxi.com/v1\` |
| **百度千帆** | [console.bce.baidu.com/qianfan](https://console.bce.baidu.com/qianfan) | \`https://qianfan.baidubce.com/v2\` |
### 配置示例 (\`config.yaml\`)

\`\`\`yaml
llm:
  provider: deepseek
  api_key: sk-your-api-key-here
  model: deepseek-v4-flash
  base_url: https://api.deepseek.com
\`\`\`

---

## 🌐 联网搜索配置

联网搜索默认关闭，如需使用请按以下步骤配置：

1. 在右侧 **⚙️ 设置面板** → 「工具管理」中，打开 **Web 搜索** 开关
2. 选择一个服务提供商并注册获取 API Key
3. 填入 API Key 即可使用

| 提供商 | 注册链接 | 免费额度 |
|--------|---------|----------|
| **Tavily**（国内较友好） | [tavily.com](https://tavily.com) | 每月 1,000 basic + 100 advanced |
| **Brave Search** | [brave.com/search/api](https://brave.com/search/api) | 每月 2,000 次免费查询 |

### 配置示例 (\`config.yaml\`)

\`\`\`yaml
tools:
  web_search:
    enabled: true             # 改为 true 启用
    provider: brave           # brave | tavily
    api_key: "your-api-key"
\`\`\`

> 💡 **提示**：当模型 Provider 为 \`deepseek-responses\` 时，联网搜索会自动切换为 **DeepSeek 服务端搜索**（无需上面的 API Key，服务端执行）。其他 Provider 仍使用 Brave / Tavily 客户端搜索。

---

## 📝 配置方式

1. **通过 UI 配置**：点击顶部 ⚙️ 图标，在设置面板中填写对应字段
2. **通过配置文件**：编辑 HippoBuddy 数据目录下的 \`config.yaml\`

> 配置文件路径：\`.hippo/config.yaml\`（位于你的工作区根目录）

---

*如有问题，直接在聊天框中提问即可。*
`;

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
          els.workspacePath.textContent = i18n.t('workspace.defaultName');
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

      // ── 默认工作区：首次启动时创建欢迎文件 + 配置指南（不自动打开） ──
      if (isDefault && fileTabs.count === 0 && window.HippoDesktop?.writeFile) {
        const dir = await window.HippoDesktop.readDir(_currentRoot);
        const fileNames = new Set(dir?.entries?.map(e => e.name) || []);

        // 欢迎文件
        const welcomeKey = 'hippo-welcome-shown-' + _currentRoot.replace(/[\\/:]/g, '_');
        if (!localStorage.getItem(welcomeKey)) {
          if (!fileNames.has(WELCOME_FILE_NAME)) {
            try {
              await window.HippoDesktop.writeFile(
                _currentRoot + '/' + WELCOME_FILE_NAME,
                WELCOME_FILE_CONTENT
              );
            } catch (e) {
              console.warn('[Workspace] 创建欢迎文件失败:', e);
            }
          }
          localStorage.setItem(welcomeKey, '1');
        }

        // 配置指南
        const configKey = 'hippo-config-shown-' + _currentRoot.replace(/[\\/:]/g, '_');
        if (!localStorage.getItem(configKey)) {
          if (!fileNames.has(CONFIG_FILE_NAME)) {
            try {
              await window.HippoDesktop.writeFile(
                _currentRoot + '/' + CONFIG_FILE_NAME,
                CONFIG_FILE_CONTENT
              );
            } catch (e) {
              console.warn('[Workspace] 创建配置指南失败:', e);
            }
          }
          localStorage.setItem(configKey, '1');
        }
      }

      // 刷新文件树，使新创建的欢迎文件/配置指南在树中立即可见
      fileTree.refresh();
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
      console.debug('[HTML预览] openWebBrowser 接收 URL:', url, 'displayName:', displayName);
      // 自动补全协议（跳过已有协议、绝对路径 /、about: 这类特殊 URL）
      let fullUrl = url.trim();
      if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/i.test(fullUrl) && !fullUrl.startsWith('/')) {
        fullUrl = 'https://' + fullUrl;
      }
      console.debug('[HTML预览] openWebBrowser 最终 URL:', fullUrl);
      // 切换到文件视图确保能显示预览
      switchView('files');
      await fileTabs.openWebTab(fullUrl, displayName);
    },

    /**
     * 打开文件变更对比标签页（diff tab）
     * @param {string} filePath - 目标文件真实路径
     * @param {string} [toolCallId] - 定位到该次变更；缺省默认展示"整体变更"
     */
    async openFileDiff(filePath, toolCallId) {
      if (!filePath) return;
      switchView('files');
      const fileName = filePath.split(/[/\\]/).pop() || filePath;
      await fileTabs.openDiffTab(filePath, fileName + ' ' + i18n.t('diff.tabSuffix'), toolCallId);
      _saveWorkspaceSession();
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
      // 统一为 / 分隔（面包屑相对路径计算 / fileTree.revealFile 均依赖正斜杠，
      // 与 revealFileInTree 同口径，避免 Windows 反斜杠绝对路径导致 startsWith 匹配失败）
      absPath = absPath.replace(/\\/g, '/');

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

    /**
     * 在文件树中定位文件：切换到文件视图、展开父目录并高亮该文件（不打开预览）。
     * 若工作区未打开或路径无效，返回 false，由调用方降级处理。
     * @param {string} filePath - 绝对或相对路径
     * @returns {Promise<boolean>} 是否定位成功
     */
    async revealFileInTree(filePath) {
      if (!_currentRoot) return false;
      let absPath = filePath;
      // 相对路径 → 拼接工作区根路径
      if (absPath && !absPath.startsWith('/') && !absPath.match(/^[a-zA-Z]:/)) {
        absPath = _currentRoot + '/' + absPath;
      }
      if (!absPath) return false;
      // 统一为 / 分隔（revealFile 内部依赖 lastIndexOf('/') 与 split('/')）
      absPath = absPath.replace(/\\/g, '/');

      switchView('files');
      await fileTree.revealFile(absPath);
      return true;
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

    // 更新 session-header 图标和标题，与当前视图保持一致
    _updateSessionHeader(view);
  }

  /** 更新 session-header 的图标和标题文字以匹配当前视图 */
  function _updateSessionHeader(view) {
    const icon = document.querySelector('.session-header-icon');
    const title = document.querySelector('.session-header-title');
    if (!icon || !title) return;

    if (view === 'files') {
      // 文件夹图标
      icon.innerHTML = '<path d="M2 4h5l2 2h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/>';
      title.textContent = i18n.t('session.fileBrowse');
      // 头部操作按钮（刷新 / 折叠全部）仅在打开工作区时显示
      const showActions = _currentRoot ? '' : 'none';
      if (els.fileTreeRefresh) els.fileTreeRefresh.style.display = showActions;
      if (els.fileTreeCollapseAll) els.fileTreeCollapseAll.style.display = showActions;
    } else {
      // 会话气泡图标
      icon.innerHTML = '<path d="M13.5 2H2.5a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h2.5l2 2 2-2h4.5a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1z"/>';
      title.textContent = i18n.t('session.title');
      if (els.fileTreeRefresh) els.fileTreeRefresh.style.display = 'none';
      if (els.fileTreeCollapseAll) els.fileTreeCollapseAll.style.display = 'none';
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

  // 绑定折叠全部按钮
  if (els.fileTreeCollapseAll) {
    els.fileTreeCollapseAll.addEventListener('click', () => {
      fileTree.collapseAll();
    });
  }

  // 绑定刷新按钮：触发文件树刷新 + 图标旋转反馈
  if (els.fileTreeRefresh) {
    els.fileTreeRefresh.addEventListener('click', () => {
      fileTree.refresh();
      const icon = els.fileTreeRefresh.querySelector('.file-tree-refresh-icon');
      if (icon) {
        icon.classList.remove('spinning');
        // 强制重排，确保动画可重复触发
        void icon.offsetWidth;
        icon.classList.add('spinning');
        icon.addEventListener('animationend', () => {
          icon.classList.remove('spinning');
        }, { once: true });
      }
    });
  }

  // ========== 面包屑路径段点击导航 ==========
  if (els.previewPath) {
    els.previewPath.addEventListener('click', (e) => {
      // diff 模式：点击面包屑（整体变更 · <path>）→ 跳转到该文件的编辑 tab
      const cp = filePreview.currentPath || '';
      if (cp.startsWith('diff:')) {
        const target = cp.slice(5);
        if (target) {
          HippoWorkspace.navigateToFile(target);
        }
        return;
      }
      const segment = e.target.closest('.path-segment');
      if (!segment) return;
      const dirPath = segment.dataset.path;
      if (!dirPath) return;
      // 切换到文件视图，在文件树中展开并高亮该目录
      switchView('files');
      fileTree.revealDirectory(dirPath);
    });
  }

  // ========== 文件选择流 ==========

  async function handleFileSelect(filePath) {
    // 用户主动点击文件，清除折叠状态，恢复预览显示
    localStorage.removeItem('hippo-preview-collapsed');
    const displayName = filePath.split(/[/\\]/).pop() || filePath;
    await fileTabs.openTab(filePath, displayName);
    await fileTree.revealFile(filePath);
    // 注意：openTab → _selectTab → handleTabSelect 内部已调用 showPreview，
    // 此处不再重复调用，避免竞态条件导致滚动位置错误恢复到其他文件的位置
    // 打开文件后持久化标签页状态
    _saveWorkspaceSession();
  }

  async function handleTabSelect(filePath) {
    // 用户主动切换标签，清除折叠状态，恢复预览显示
    localStorage.removeItem('hippo-preview-collapsed');
    // 检测是否为 web 标签
    if (filePath && filePath.startsWith('url:')) {
      const url = filePath.slice(4);
      filePreview.showBrowser(url);
      // 显示预览面板，隐藏文件路径工具栏
      if (els.previewPanel) {
        els.previewPanel.classList.remove('hidden');
      }
      if (els.previewPath) {
        els.previewPath.textContent = url;
        els.previewPath.title = url;
        els.previewPath.classList.remove('preview-path-clickable');
      }
      if (els.previewToolbar) {
        els.previewToolbar.style.display = 'none';
      }
      // 持久化标签页（包含 web tab）
      _saveWorkspaceSession();
      return;
    }
    // 检测是否为 diff 标签
    if (filePath && filePath.startsWith('diff:')) {
      const target = filePath.slice(5);
      // 从标签 dataset 取暂存的 toolCallId（工具卡片进入时精确到该次变更；无则默认整体视图）
      const tabEl = fileTabs._tabs.get(filePath);
      const toolCallId = tabEl ? (tabEl.dataset.toolCallId || '') : '';
      filePreview.showDiff(target, toolCallId);
      if (els.previewPanel) {
        els.previewPanel.classList.remove('hidden');
      }
      if (els.previewPath) {
        // 相对工作区根目录显示，与普通文件标签的面包屑同口径（避免显示完整绝对路径）
        const normalized = target.replace(/\\/g, '/');
        const rel = _currentRoot && normalized.startsWith(_currentRoot)
          ? normalized.slice(_currentRoot.length + 1)
          : normalized;
        els.previewPath.textContent = i18n.t('diff.overall') + ' · ' + rel;
        els.previewPath.title = i18n.t('diff.openInEditorTip') + ' ' + target;
        els.previewPath.classList.add('preview-path-clickable');
      }
      if (els.previewToolbar) {
        els.previewToolbar.style.display = 'none';
      }
      _saveWorkspaceSession();
      return;
    }
    await fileTree.revealFile(filePath);
    showPreview(filePath);
  }

  function handleTabClose(filePath) {
    // 关闭 web 标签时释放内嵌浏览器缓存（销毁 iframe，避免内存/网络连接残留）
    if (filePath && filePath.startsWith('url:')) {
      filePreview.disposeBrowser(filePath.slice(4));
    }
    if (fileTabs.count === 0) {
      hidePreview();
    }
    // 关闭标签时清除该文件的滚动位置记忆，重新打开时从顶部开始
    filePreview.clearScrollPosition(filePath);
    // 关闭标签后持久化标签页状态
    _saveWorkspaceSession();
  }

  // ========== 预览控制 ==========

  function showPreview(filePath) {
    // 如果用户上次主动收起了预览面板，则保持隐藏（刷新/重启后生效）
    if (localStorage.getItem('hippo-preview-collapsed') === 'true') {
      return;
    }
    filePreview.show(filePath);
    if (els.previewPath) {
      // 非 diff 模式：移除可点击样式（避免从 diff 标签切换回来残留）
      els.previewPath.classList.remove('preview-path-clickable');
      // 显示相对于工作区根目录的路径，IDE 面包屑风格 (xx > xx > xx)
      const relativePath = _currentRoot && filePath.startsWith(_currentRoot)
        ? filePath.slice(_currentRoot.length + 1)
        : filePath;
      const parts = relativePath.split('/');
      const html = parts.map((part, index) => {
        // 对 part 做 HTML 转义（路径中可能出现 & < > 等字符）
        const escaped = part.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        if (index < parts.length - 1) {
          // 目录段：可点击，构建完整目录路径
          const dirPath = _currentRoot
            ? _currentRoot + '/' + parts.slice(0, index + 1).join('/')
            : parts.slice(0, index + 1).join('/');
          return `<span class="path-segment" data-path="${dirPath.replace(/"/g, '&quot;')}">${escaped}</span>`;
        }
        // 最后一段是文件名，纯文本
        return escaped;
      }).join('<span class="sep">></span>');
      els.previewPath.innerHTML = html;
      els.previewPath.title = filePath;
    }
    if (els.previewToolbar) {
      els.previewToolbar.style.display = '';
    }
    if (els.previewPanel) {
      els.previewPanel.classList.remove('hidden');
    }
  }

  function hidePreview() {
    filePreview.clear();
    if (els.previewToolbar) {
      els.previewToolbar.style.display = '';
    }
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
      // 拖拽期间：全局 col-resize 光标 + 屏蔽预览面板 iframe 的指针事件。
      // iframe 是独立文档，鼠标移入后 mousemove/mouseup 不再冒泡到父页面，
      // 会导致拖动"脱手"、松手后 resizing 状态残留。此处用 body class 统一控制。
      document.body.classList.add('panel-dragging');
      const startX = e.clientX;
      const startWidth = chatPanel.offsetWidth;
      // 判断布局方向：chat 在左时拖拽方向取反
      const isSwapped = document.querySelector('.main-container')?.classList.contains('layout-chat-first');

      const onMove = (ev) => {
        const diff = isSwapped ? (ev.clientX - startX) : (startX - ev.clientX);
        const w = Math.max(320, Math.min(960, startWidth + diff));
        document.documentElement.style.setProperty('--chat-panel-width', w + 'px');
      };

      const onUp = () => {
        resizer.classList.remove('resizing');
        document.body.classList.remove('panel-dragging');
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
    localStorage.setItem('hippo-preview-collapsed', 'true');
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
    // 当前处于 diff 标签页时自动重载（回滚/变更后保持数据新鲜）
    filePreview.reloadDiffView();
  });

  // AI 工具修改了当前预览的文件时，自动重新加载预览
  EventBus.on('file:preview-reload', (filePath) => {
    if (filePreview.currentPath && filePath &&
        filePreview.currentPath.replace(/\\/g, '/') === filePath.replace(/\\/g, '/')) {
      filePreview.reload();
    }
  });

  // 回撤操作完成后，刷新当前预览的文件内容（仅当被回滚的文件正好是当前预览文件时，
  // 避免回滚任意文件导致预览区被无故重建、滚动位置跳动）
  EventBus.on('file:rollback-completed', (paths) => {
    const current = filePreview.currentPath;
    if (!current || current.startsWith('url:') || current.startsWith('diff:')) return;
    // 统一为数组：兼容字符串路径 / 路径数组 / 无参（旧语义=全量回滚，保守刷新当前预览）
    const list = Array.isArray(paths) ? paths : (typeof paths === 'string' ? [paths] : []);
    if (list.length === 0) {
      filePreview.reload();
      return;
    }
    const cur = current.replace(/\\/g, '/').toLowerCase();
    const hit = list.some(p => p && p.replace(/\\/g, '/').toLowerCase() === cur);
    if (hit) filePreview.reload();
  });

  // 外部程序（非 AI 工具）修改了工作区文件 → 刷新文件树；
  // 若修改的正是当前预览文件则重载预览（带 dirty 保护，不覆盖未保存修改）
  EventBus.on('file:external-changed', ({ changes }) => {
    fileTree.refresh();
    if (!changes || changes.length === 0) return;
    const current = filePreview.currentPath?.replace(/\\/g, '/').toLowerCase();
    if (!current || current.startsWith('url:')) return;
    for (const c of changes) {
      const p = (c.path || '').replace(/\\/g, '/').toLowerCase();
      if (p !== current) continue;
      if (filePreview.isDirty) {
        const name = filePreview.currentPath.split(/[/\\]/).pop() || filePreview.currentPath;
        showToast(i18n.t('workspace.externalChangedDirty', { name }), { type: 'warning', duration: 4000 });
      } else {
        filePreview.reload();
      }
      break;
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

  // ── 页面刷新/关闭前保存工作区会话（标签页 + 展开状态）──
  window.addEventListener('beforeunload', () => {
    _saveWorkspaceSession();
  });

  return api;
})();

window.HippoWorkspace = HippoWorkspace;
