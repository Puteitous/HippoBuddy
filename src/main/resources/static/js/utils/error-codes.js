/**
 * 前端统一的 LLM 错误码处理模块。
 *
 * 与后端 LlmErrorClassifier（Java）对应：后端把各厂商错误归一化为稳定的业务错误码
 * （如 AUTH_FAILED / INSUFFICIENT_BALANCE / RATE_LIMITED...），通过 SSE error 事件的
 * code 字段下发；前端在此集中维护 code → i18n 文案映射，以及 fetch 层异常的兜底分类。
 *
 * 向后兼容：旧后端不发 code（只有 message）时，按 message 文本兜底分类；
 * 新后端带 code 时，优先按 code 渲染 i18n 文案。
 */

/** 安全 i18n 辅助函数（与 MessageSession 一致，i18n 未初始化时回退 key） */
const _t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;

/**
 * 业务错误码 → i18n 文案 key（与后端 LlmErrorClassifier.CODE_* 一一对应）。
 * message/detail 分别对应主文案与详情文案；无 detail 的用主文案替代。
 */
const CODE_I18N = {
  NETWORK_ERROR:              { message: 'chatui.errorNetwork', detail: 'chatui.errorNetworkDetail' },
  TIMEOUT:                    { message: 'chatui.errorTimeout', detail: 'chatui.errorTimeoutDetail' },
  AUTH_FAILED:                { message: 'chatui.errorAuthFailed', detail: 'chatui.errorAuthFailedDetail' },
  INSUFFICIENT_BALANCE:       { message: 'chatui.errorInsufficientBalance', detail: 'chatui.errorInsufficientBalanceDetail' },
  RATE_LIMITED:               { message: 'chatui.errorTooManyRequests', detail: 'chatui.errorTooManyRequestsDetail' },
  MODEL_NOT_FOUND:            { message: 'chatui.errorModelNotFound', detail: 'chatui.errorModelNotFoundDetail' },
  CONTEXT_LENGTH_EXCEEDED:    { message: 'chatui.errorContextTooLong', detail: 'chatui.errorContextTooLongDetail' },
  SERVER_ERROR:               { message: 'chatui.errorServer', detail: 'chatui.errorServerDetail' },
  SERVER_BUSY:                { message: 'chatui.errorServiceUnavailable', detail: 'chatui.errorServiceUnavailableDetail' },
  INVALID_REQUEST:            { message: 'chatui.errorInvalidRequest', detail: 'chatui.errorInvalidRequestDetail' },
  CONTENT_FILTERED:           { message: 'chatui.errorContentFiltered', detail: 'chatui.errorContentFilteredDetail' },
  EMPTY_RESPONSE:             { message: 'chatui.errorAiNoResponse', detail: 'chatui.errorAiNoResponseDetail' },
  RESPONSE_LENGTH_EXCEEDED:   { message: 'chatui.errorResponseLengthExceeded', detail: 'chatui.errorResponseLengthExceededDetail' },
  CONFIG_MISSING:             { message: 'chatui.errorConfigMissing', detail: 'chatui.errorConfigMissingDetail' }
};

/**
 * 格式化 SSE error 事件为 { message, detail, code }。
 * - 后端带 code → 优先按 code 查 i18n 文案（保持前后端文案一致）；
 * - 无 code 或 code 未知 → fallback 后端 message 原文；
 * - 后端附带 detail（厂商原始详情）时保留。
 * @param {{code?: string, message?: string, detail?: string}} parsed SSE error 事件对象
 * @returns {{message: string, detail: string|null, code: string|null}}
 */
export function formatSseError(parsed) {
  const code = parsed.code || null;
  const mapping = code ? CODE_I18N[code] : null;

  if (mapping) {
    return {
      code,
      message: _t(mapping.message),
      detail: parsed.detail || _t(mapping.detail)
    };
  }

  // 兜底：无 code / 未知 code → 使用后端 message 原文（兼容旧后端）
  return {
    code,
    message: parsed.message || _t('chatui.unknownError'),
    detail: parsed.detail || null
  };
}

/**
 * 将 fetch 层异常（非 SSE 事件，如网络断开 / 超时 / HTTP 状态码 / LLM 空响应）
 * 分类为面向用户的友好文案。这是非 SSE 路径的兜底分类。
 * @param {Error} error
 * @returns {{message: string, detail: string|null, code: string|null}}
 */
export function classifyError(error) {
  const msg = error.message || '';

  if (error.name === 'TypeError' && (msg.includes('fetch') || msg.includes('Failed to fetch') || msg.includes('NetworkError'))) {
    return { message: _t('chatui.errorNetwork'), detail: _t('chatui.errorNetworkDetail'), code: 'NETWORK_ERROR' };
  }

  if (msg.includes('超时') || msg.includes('timeout') || msg.includes('Timeout')) {
    return { message: _t('chatui.errorTimeout'), detail: _t('chatui.errorTimeoutDetail'), code: 'TIMEOUT' };
  }

  if (msg.includes('HTTP error') || /status:? \d{3}/i.test(msg)) {
    const statusMatch = msg.match(/(\d{3})/);
    const status = statusMatch ? statusMatch[1] : '';
    if (status === '502' || status === '503' || status === '504') {
      return { message: _t('chatui.errorServiceUnavailable', { status }), detail: _t('chatui.errorServiceUnavailableDetail'), code: 'SERVER_BUSY' };
    }
    if (status === '429') {
      return { message: _t('chatui.errorTooManyRequests'), detail: _t('chatui.errorTooManyRequestsDetail'), code: 'RATE_LIMITED' };
    }
    if (status === '401' || status === '403') {
      return { message: _t('chatui.errorPermission', { status }), detail: _t('chatui.errorPermissionDetail'), code: 'AUTH_FAILED' };
    }
    return { message: _t('chatui.errorServer', { status: status || msg }), detail: _t('chatui.errorServerDetail'), code: 'SERVER_ERROR' };
  }

  if (msg.includes(_t('chat.llmNoContent'))) {
    return { message: _t('chatui.errorAiNoResponse'), detail: _t('chatui.errorAiNoResponseDetail'), code: 'EMPTY_RESPONSE' };
  }

  return { message: msg || _t('chatui.unknownError'), detail: null, code: 'UNKNOWN' };
}
