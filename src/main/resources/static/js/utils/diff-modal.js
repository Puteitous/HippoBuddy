// Diff 弹窗管理模块
import { escapeHtml } from '../utils.js';
import { showToast } from './toast.js';
import { EventBus } from './event-bus.js';

export class DiffModalManager {
  constructor() {
    this.overlay = null;
    this.body = null;
    this.filePathEl = null;
    this.statsEl = null;
    this.rollbackBtn = null;
    this.currentFilePath = null;
    
    this.init();
  }
  
  init() {
    this.overlay = document.getElementById('diffModalOverlay');
    this.body = document.getElementById('diffModalBody');
    this.filePathEl = document.getElementById('diffFilePath');
    this.statsEl = document.getElementById('diffStats');
    this.rollbackBtn = document.getElementById('diffRollbackBtn');
    
    if (!this.overlay) {
      console.warn('Diff modal overlay not found');
      return;
    }
    
    this.bindEvents();
  }
  
  bindEvents() {
    if (!this.overlay) return;
    
    const closeBtn = document.getElementById('diffModalClose');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }
    
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.close();
      }
    });
    
    if (this.rollbackBtn) {
      this.rollbackBtn.addEventListener('click', () => this.rollbackCurrentFile());
    }
  }
  
  /**
   * 显示文件 Diff
   * @param {string} filePath - 文件路径
   */
  async show(filePath) {
    if (!this.overlay) {
      console.error('Diff modal not initialized');
      return;
    }
    
    this.currentFilePath = filePath;
    this.overlay.style.display = 'flex';
    
    if (this.filePathEl) {
      this.filePathEl.textContent = filePath.split(/[/\\]/).pop();
    }
    
    if (this.body) {
      this.body.innerHTML = '<div class="diff-empty">加载中...</div>';
    }
    
    if (this.statsEl) {
      this.statsEl.innerHTML = '';
    }
    
    if (this.rollbackBtn) {
      this.rollbackBtn.classList.remove('rolling');
      this.rollbackBtn.textContent = '回滚此变更';
    }
    
    try {
      const response = await fetch(`/api/files/diff?path=${encodeURIComponent(filePath)}`);
      if (!response.ok) {
        throw new Error('加载失败');
      }
      const data = await response.json();
      this.render(data);
    } catch (e) {
      if (this.body) {
        this.body.innerHTML = `<div class="diff-empty">加载失败：${escapeHtml(e.message)}</div>`;
      }
    }
  }
  
  /**
   * 渲染 Diff 内容
   * @param {Object} data - Diff 数据
   */
  render(data) {
    if (!this.body) return;
    
    if (!data.changes || data.changes.length === 0) {
      this.body.innerHTML = '<div class="diff-empty">无变更内容</div>';
      if (this.statsEl) this.statsEl.innerHTML = '';
      return;
    }
    
    if (this.filePathEl) {
      this.filePathEl.textContent = data.filePath.split(/[/\\]/).pop();
    }
    
    let addedCount = 0;
    let removedCount = 0;
    let html = '';
    let lineNum = 1;
    
    for (const change of data.changes) {
      const type = change.type;
      const content = change.content || '';
      const typeSymbol = type === 'added' ? '+' : type === 'removed' ? '-' : ' ';
      
      if (type === 'added') addedCount++;
      if (type === 'removed') removedCount++;
      
      html += `<div class="diff-line ${type}">
        <span class="diff-line-num">${type === 'removed' ? '' : lineNum}</span>
        <span class="diff-line-type ${type}">${typeSymbol}</span>
        <span class="diff-line-content">${escapeHtml(content)}</span>
      </div>`;
      
      if (type !== 'removed') lineNum++;
    }
    
    this.body.innerHTML = `<div class="diff-content">${html}</div>`;
    
    if (this.statsEl) {
      this.statsEl.innerHTML = `<span class="diff-added-count">+${addedCount}</span> <span class="diff-removed-count">-${removedCount}</span>`;
    }
  }
  
  /**
   * 回滚当前文件
   */
  async rollbackCurrentFile() {
    if (!this.currentFilePath || !this.rollbackBtn) return;
    
    if (this.rollbackBtn.classList.contains('rolling')) return;
    
    this.rollbackBtn.classList.add('rolling');
    this.rollbackBtn.textContent = '回滚中...';
    
    try {
      const response = await fetch('/api/files/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: this.currentFilePath })
      });
      
      const result = await response.json();
      
      if (result.success) {
        showToast(`文件已恢复：${this.currentFilePath.split(/[/\\]/).pop()}`, { 
          type: 'success', 
          duration: 3000 
        });
        
        // 触发全局事件，通知文件列表更新
        EventBus.emit('file:changes-updated');
        
        this.close();
      } else {
        showToast(`回滚失败：${result.error || '未知错误'}`, { 
          type: 'error', 
          duration: 3000 
        });
        this.rollbackBtn.classList.remove('rolling');
        this.rollbackBtn.textContent = '回滚此变更';
      }
    } catch (e) {
      showToast(`回滚失败：${e.message}`, { type: 'error', duration: 3000 });
      this.rollbackBtn.classList.remove('rolling');
      this.rollbackBtn.textContent = '回滚此变更';
    }
  }
  
  /**
   * 关闭弹窗
   */
  close() {
    if (this.overlay) {
      this.overlay.style.display = 'none';
    }
    this.currentFilePath = null;
  }
}

// 导出单例
export const diffModalManager = new DiffModalManager();
