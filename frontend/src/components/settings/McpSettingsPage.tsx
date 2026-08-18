/**
 * McpSettingsPage - MCP 配置
 *
 * 基本设置(enabled/auto_connect/auto_reconnect/max_reconnect_attempts/
 * reconnect_delay_seconds/request_timeout)+ 服务器列表 CRUD。
 *
 * 服务器条目:id/name/type(stdio|sse)/command/args/url/env/auto_register_tools
 * 行为:基本设置 checkbox/select 变更立即 PUT;服务器增删改通过内嵌编辑器,save 时 PUT。
 */
import { useEffect, useState } from 'react';
import { configApi } from '@/api/client';
import { ApiError } from '@/api/error';
import { showToast } from './toastStore';
import type {
  McpConfigSection,
  McpServerConfigSection,
  McpServerType,
} from '@/types/config';

const MAX_RECONNECT_ITEMS = [
  { label: '无限制', value: '0' },
  { label: '3', value: '3' },
  { label: '5 (默认)', value: '5' },
  { label: '10', value: '10' },
  { label: '20', value: '20' },
];

const RECONNECT_DELAY_ITEMS = [
  { label: '1 秒', value: '1' },
  { label: '3 秒', value: '3' },
  { label: '5 秒 (默认)', value: '5' },
  { label: '10 秒', value: '10' },
  { label: '30 秒', value: '30' },
];

const REQ_TIMEOUT_ITEMS = [
  { label: '10 秒', value: '10000' },
  { label: '30 秒', value: '30000' },
  { label: '60 秒 (默认)', value: '60000' },
  { label: '2 分钟', value: '120000' },
  { label: '5 分钟', value: '300000' },
];

interface ServerEditorState {
  editingIndex: number; // -1 表示新建
  id: string;
  name: string;
  type: McpServerType;
  command: string;
  argsText: string;
  url: string;
  envs: Array<{ key: string; value: string }>;
  autoRegisterTools: boolean;
}

function defaultMcp(): McpConfigSection {
  return {
    enabled: true,
    auto_connect: true,
    auto_reconnect: true,
    max_reconnect_attempts: 5,
    reconnect_delay_seconds: 5,
    request_timeout: 60000,
    servers: [],
  };
}

function emptyServerEditor(): ServerEditorState {
  return {
    editingIndex: -1,
    id: '',
    name: '',
    type: 'stdio',
    command: '',
    argsText: '',
    url: '',
    envs: [],
    autoRegisterTools: true,
  };
}

function serverToEditor(server: McpServerConfigSection, editingIndex: number): ServerEditorState {
  return {
    editingIndex,
    id: server.id || '',
    name: server.name || '',
    type: (server.type as McpServerType) || 'stdio',
    command: server.command || '',
    argsText: (server.args || []).join(' '),
    url: server.url || '',
    envs: Object.entries(server.env || {}).map(([k, v]) => ({ key: k, value: v })),
    autoRegisterTools: server.auto_register_tools !== false,
  };
}

function editorToServer(s: ServerEditorState): McpServerConfigSection {
  const args = s.argsText.trim() ? s.argsText.trim().split(/\s+/).filter(Boolean) : [];
  const env: Record<string, string> = {};
  for (const { key, value } of s.envs) {
    const k = key.trim();
    if (k) env[k] = value;
  }
  return {
    id: s.id.trim(),
    name: s.name.trim() || s.id.trim(),
    type: s.type,
    command: s.type === 'stdio' ? s.command.trim() : '',
    args: s.type === 'stdio' ? args : [],
    url: s.type === 'sse' ? s.url.trim() : '',
    env: s.type === 'stdio' ? env : {},
    auto_register_tools: s.autoRegisterTools,
  };
}

export function McpSettingsPage() {
  const [mcp, setMcp] = useState<McpConfigSection>(defaultMcp());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editor, setEditor] = useState<ServerEditorState | null>(null);
  const [savingServer, setSavingServer] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const config = await configApi.getFull();
        if (cancelled) return;
        if (config.mcp) {
          setMcp({ ...defaultMcp(), ...config.mcp });
        }
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof ApiError ? `[${e.status}] ${e.message}` : String(e);
        setLoadError(msg);
        showToast('加载 MCP 配置失败:' + msg, { type: 'error', duration: 3000 });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** 基本设置保存:接受部分 patch,合并到 mcp 节后立即 PUT */
  const saveBasic = async (patch: Partial<McpConfigSection>) => {
    const next: McpConfigSection = { ...mcp, ...patch };
    setMcp(next);
    try {
      await configApi.updateFull({ mcp: next });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e);
      showToast('保存 MCP 配置失败:' + msg, { type: 'error', duration: 3000 });
    }
  };

  const openServerEditor = (index: number) => {
    if (index >= 0 && index < mcp.servers.length) {
      setEditor(serverToEditor(mcp.servers[index], index));
    } else {
      setEditor(emptyServerEditor());
    }
  };

  const closeServerEditor = () => setEditor(null);

  const saveServer = async () => {
    if (!editor || savingServer) return;
    const server = editorToServer(editor);
    if (!server.id) {
      showToast('请输入服务器 ID', { type: 'warning', duration: 2000 });
      return;
    }
    const servers = [...mcp.servers];
    const isEdit = editor.editingIndex >= 0 && editor.editingIndex < servers.length;
    if (isEdit) {
      const idx = editor.editingIndex;
      // ID 变更时检查唯一性
      if (
        server.id !== servers[idx].id &&
        servers.some((s, i) => i !== idx && s.id === server.id)
      ) {
        showToast('服务器 ID 已存在:' + server.id, { type: 'warning', duration: 2000 });
        return;
      }
      servers[idx] = server;
    } else {
      // 新建:检查 ID 唯一性
      if (servers.some((s) => s.id === server.id)) {
        showToast('服务器 ID 已存在:' + server.id, { type: 'warning', duration: 2000 });
        return;
      }
      servers.push(server);
    }
    setSavingServer(true);
    try {
      const next: McpConfigSection = { ...mcp, servers };
      setMcp(next);
      await configApi.updateFull({ mcp: next });
      showToast(isEdit ? '服务器已保存' : '服务器已添加', {
        type: 'success',
        duration: 2000,
      });
      setEditor(null);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e);
      showToast('保存服务器失败:' + msg, { type: 'error', duration: 3000 });
    } finally {
      setSavingServer(false);
    }
  };

  const deleteServer = async (index: number) => {
    const server = mcp.servers[index];
    if (!server) return;
    const name = server.name || server.id || '未命名';
    if (!window.confirm(`确定删除服务器「${name}」?`)) return;
    const servers = mcp.servers.filter((_, i) => i !== index);
    const next: McpConfigSection = { ...mcp, servers };
    setMcp(next);
    try {
      await configApi.updateFull({ mcp: next });
      showToast('服务器已删除:' + name, { type: 'success', duration: 2000 });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e);
      showToast('删除服务器失败:' + msg, { type: 'error', duration: 3000 });
    }
  };

  const addEnvRow = () => {
    if (!editor) return;
    setEditor({ ...editor, envs: [...editor.envs, { key: '', value: '' }] });
  };

  const updateEnvRow = (i: number, key: string, value: string) => {
    if (!editor) return;
    const envs = editor.envs.map((e, idx) => (idx === i ? { key, value } : e));
    setEditor({ ...editor, envs });
  };

  const removeEnvRow = (i: number) => {
    if (!editor) return;
    const envs = editor.envs.filter((_, idx) => idx !== i);
    setEditor({ ...editor, envs });
  };

  if (loading) {
    return <div className="settings-loading">加载中...</div>;
  }

  if (loadError) {
    return (
      <div>
        <h2 className="settings-page-title">MCP</h2>
        <p className="settings-page-desc">配置 Model Context Protocol 服务与连接策略。</p>
        <hr className="settings-page-divider" />
        <p className="settings-error-text">配置不可用:{loadError}</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="settings-page-title">MCP</h2>
      <p className="settings-page-desc">配置 Model Context Protocol 服务与连接策略。</p>
      <hr className="settings-page-divider" />

      {/* 基本设置 */}
      <div className="settings-field-group-title">基本设置</div>
      <div className="settings-field-group">
        <div className="settings-form">
          <div className="settings-field-horizontal">
            <label className="settings-field-label">启用</label>
            <div className="settings-field-body">
              <label className="settings-switch">
                <input
                  type="checkbox"
                  checked={mcp.enabled !== false}
                  onChange={(e) => saveBasic({ enabled: e.target.checked })}
                />
                <span className="settings-switch-slider" />
              </label>
            </div>
          </div>
          <div className="settings-field-horizontal">
            <label className="settings-field-label">自动连接</label>
            <div className="settings-field-body">
              <label className="settings-switch">
                <input
                  type="checkbox"
                  checked={mcp.auto_connect !== false}
                  onChange={(e) => saveBasic({ auto_connect: e.target.checked })}
                />
                <span className="settings-switch-slider" />
              </label>
            </div>
          </div>
          <div className="settings-field-horizontal">
            <label className="settings-field-label">自动重连</label>
            <div className="settings-field-body">
              <label className="settings-switch">
                <input
                  type="checkbox"
                  checked={mcp.auto_reconnect !== false}
                  onChange={(e) => saveBasic({ auto_reconnect: e.target.checked })}
                />
                <span className="settings-switch-slider" />
              </label>
            </div>
          </div>
          <div className="settings-field-horizontal">
            <div className="settings-field-label">
              <div>最大重连次数</div>
              <div className="settings-field-hint">0 表示无限制</div>
            </div>
            <div className="settings-field-body">
              <select
                className="settings-select"
                value={String(mcp.max_reconnect_attempts ?? 5)}
                onChange={(e) =>
                  saveBasic({ max_reconnect_attempts: parseInt(e.target.value, 10) })
                }
              >
                {MAX_RECONNECT_ITEMS.map((it) => (
                  <option key={it.value} value={it.value}>
                    {it.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="settings-field-horizontal">
            <div className="settings-field-label">
              <div>重连延迟</div>
              <div className="settings-field-hint">两次重连之间等待时间</div>
            </div>
            <div className="settings-field-body">
              <select
                className="settings-select"
                value={String(mcp.reconnect_delay_seconds ?? 5)}
                onChange={(e) =>
                  saveBasic({ reconnect_delay_seconds: parseInt(e.target.value, 10) })
                }
              >
                {RECONNECT_DELAY_ITEMS.map((it) => (
                  <option key={it.value} value={it.value}>
                    {it.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="settings-field-horizontal">
            <div className="settings-field-label">
              <div>请求超时</div>
              <div className="settings-field-hint">单次 MCP 调用最长等待</div>
            </div>
            <div className="settings-field-body">
              <select
                className="settings-select"
                value={String(mcp.request_timeout ?? 60000)}
                onChange={(e) =>
                  saveBasic({ request_timeout: parseInt(e.target.value, 10) })
                }
              >
                {REQ_TIMEOUT_ITEMS.map((it) => (
                  <option key={it.value} value={it.value}>
                    {it.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* 服务器列表 */}
      {!editor && (
        <>
          <div className="settings-item-list-header">
            <h3>服务器列表 ({mcp.servers.length})</h3>
            <div className="settings-item-list-actions">
              <button
                type="button"
                className="settings-btn settings-btn-primary"
                onClick={() => openServerEditor(-1)}
              >
                + 添加
              </button>
            </div>
          </div>

          {mcp.servers.length === 0 ? (
            <div className="settings-items-empty">
              暂无服务器
              <span className="settings-items-empty-hint">点击右上角「+ 添加」配置第一个 MCP 服务器</span>
            </div>
          ) : (
            <div className="settings-item-group">
              <div className="settings-item-group-header">
                <span className="settings-item-group-label">Servers</span>
                <span className="settings-item-group-count">{mcp.servers.length}</span>
              </div>
              <div className="settings-items">
                {mcp.servers.map((server, i) => (
                  <div
                    key={server.id || i}
                    className="settings-item"
                    onClick={() => openServerEditor(i)}
                  >
                    <span className="settings-item-badge">
                      {server.type === 'sse' ? 'SSE' : 'STDIO'}
                    </span>
                    <div className="settings-item-info">
                      <div className="settings-item-name">
                        {server.name || server.id || '未命名'}
                      </div>
                      <div className="settings-item-meta">
                        {server.type === 'sse'
                          ? server.url
                          : server.command +
                            (server.args?.length ? ' ' + server.args.join(' ') : '')}
                      </div>
                    </div>
                    {server.auto_register_tools !== false && (
                      <span className="settings-item-badge">自动注册</span>
                    )}
                    <button
                      type="button"
                      className="settings-item-del"
                      title="删除"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteServer(i);
                      }}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="12"
                        height="12"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* 服务器编辑器 */}
      {editor && (
        <div className="settings-editor">
          <div className="settings-editor-header">
            <span className="settings-editor-title">
              {editor.editingIndex >= 0 ? '编辑服务器' : '添加服务器'}
            </span>
            <div className="settings-editor-actions">
              <button
                type="button"
                className="settings-editor-btn"
                onClick={closeServerEditor}
                disabled={savingServer}
              >
                返回列表
              </button>
              <button
                type="button"
                className="settings-editor-btn settings-editor-btn-primary"
                onClick={saveServer}
                disabled={savingServer}
              >
                {editor.editingIndex >= 0 ? '保存' : '添加'}
              </button>
            </div>
          </div>
          <div className="settings-editor-fields">
            <div className="settings-field">
              <label className="settings-field-label">
                服务器 ID
                <div className="settings-field-hint">唯一标识,建议使用英文与连字符</div>
              </label>
              <input
                className="settings-input"
                type="text"
                value={editor.id}
                placeholder="my-mcp-server"
                disabled={editor.editingIndex >= 0}
                onChange={(e) => setEditor({ ...editor, id: e.target.value })}
              />
            </div>
            <div className="settings-field">
              <label className="settings-field-label">显示名称</label>
              <input
                className="settings-input"
                type="text"
                value={editor.name}
                placeholder="My MCP Server"
                onChange={(e) => setEditor({ ...editor, name: e.target.value })}
              />
            </div>
            <div className="settings-field">
              <label className="settings-field-label">类型</label>
              <div className="settings-toggle-group">
                <button
                  type="button"
                  className={`settings-toggle-btn${editor.type === 'stdio' ? ' active' : ''}`}
                  onClick={() => setEditor({ ...editor, type: 'stdio' })}
                >
                  STDIO
                </button>
                <button
                  type="button"
                  className={`settings-toggle-btn${editor.type === 'sse' ? ' active' : ''}`}
                  onClick={() => setEditor({ ...editor, type: 'sse' })}
                >
                  SSE
                </button>
              </div>
            </div>

            {editor.type === 'stdio' && (
              <>
                <div className="settings-field">
                  <label className="settings-field-label">命令</label>
                  <input
                    className="settings-input"
                    type="text"
                    value={editor.command}
                    placeholder="npx"
                    onChange={(e) => setEditor({ ...editor, command: e.target.value })}
                  />
                </div>
                <div className="settings-field">
                  <label className="settings-field-label">
                    参数
                    <div className="settings-field-hint">空格分隔</div>
                  </label>
                  <input
                    className="settings-input"
                    type="text"
                    value={editor.argsText}
                    placeholder="-y @modelcontextprotocol/server-filesystem"
                    onChange={(e) => setEditor({ ...editor, argsText: e.target.value })}
                  />
                </div>
              </>
            )}

            {editor.type === 'sse' && (
              <div className="settings-field">
                <label className="settings-field-label">URL</label>
                <input
                  className="settings-input"
                  type="text"
                  value={editor.url}
                  placeholder="http://localhost:8080/sse"
                  onChange={(e) => setEditor({ ...editor, url: e.target.value })}
                />
              </div>
            )}

            {editor.type === 'stdio' && (
              <div className="settings-field">
                <label className="settings-field-label">
                  环境变量
                  <div className="settings-field-hint">供 MCP 进程读取</div>
                </label>
                <div style={{ marginBottom: 6 }}>
                  {editor.envs.length === 0 ? (
                    <div className="mcp-env-empty">无环境变量</div>
                  ) : (
                    editor.envs.map((env, i) => (
                      <div className="mcp-env-row" key={i}>
                        <input
                          className="settings-input"
                          type="text"
                          style={{ flex: 1, fontSize: 12, fontFamily: 'monospace' }}
                          value={env.key}
                          placeholder="KEY"
                          onChange={(e) => updateEnvRow(i, e.target.value, env.value)}
                        />
                        <input
                          className="settings-input"
                          type="text"
                          style={{ flex: 2, fontSize: 12, fontFamily: 'monospace' }}
                          value={env.value}
                          placeholder="VALUE"
                          onChange={(e) => updateEnvRow(i, env.key, e.target.value)}
                        />
                        <button
                          type="button"
                          className="settings-input-btn"
                          title="删除"
                          onClick={() => removeEnvRow(i)}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            width="12"
                            height="12"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    ))
                  )}
                </div>
                <button
                  type="button"
                  className="settings-btn"
                  style={{ fontSize: 12 }}
                  onClick={addEnvRow}
                >
                  + 添加环境变量
                </button>
              </div>
            )}

            <div className="settings-field-horizontal">
              <label className="settings-field-label">自动注册工具</label>
              <div className="settings-field-body">
                <label className="settings-switch">
                  <input
                    type="checkbox"
                    checked={editor.autoRegisterTools}
                    onChange={(e) =>
                      setEditor({ ...editor, autoRegisterTools: e.target.checked })
                    }
                  />
                  <span className="settings-switch-slider" />
                </label>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
