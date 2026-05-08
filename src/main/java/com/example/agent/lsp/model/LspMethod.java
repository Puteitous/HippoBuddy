package com.example.agent.lsp.model;

/**
 * LSP 协议方法枚举，统一管理所有 JSON-RPC method 名称。
 * 遵循 LSP 3.18 规范。
 */
public enum LspMethod {

    // ── 生命周期 ──
    INITIALIZE("initialize"),
    INITIALIZED("initialized", true),
    SHUTDOWN("shutdown"),
    EXIT("exit", true),

    // ── 文本同步 ──
    TEXT_DOCUMENT_DID_OPEN("textDocument/didOpen", true),
    TEXT_DOCUMENT_DID_CHANGE("textDocument/didChange", true),
    TEXT_DOCUMENT_DID_CLOSE("textDocument/didClose", true),
    TEXT_DOCUMENT_DID_SAVE("textDocument/didSave", true),

    // ── 语言功能 ──
    TEXT_DOCUMENT_DEFINITION("textDocument/definition"),
    TEXT_DOCUMENT_DECLARATION("textDocument/declaration"),
    TEXT_DOCUMENT_TYPE_DEFINITION("textDocument/typeDefinition"),
    TEXT_DOCUMENT_REFERENCES("textDocument/references"),
    TEXT_DOCUMENT_HOVER("textDocument/hover"),
    TEXT_DOCUMENT_COMPLETION("textDocument/completion"),
    TEXT_DOCUMENT_SIGNATURE_HELP("textDocument/signatureHelp"),
    TEXT_DOCUMENT_DOCUMENT_SYMBOL("textDocument/documentSymbol"),
    TEXT_DOCUMENT_CODE_ACTION("textDocument/codeAction"),
    TEXT_DOCUMENT_CODE_LENS("textDocument/codeLens"),
    TEXT_DOCUMENT_FORMATTING("textDocument/formatting"),
    TEXT_DOCUMENT_RANGE_FORMATTING("textDocument/rangeFormatting"),
    TEXT_DOCUMENT_ON_TYPE_FORMATTING("textDocument/onTypeFormatting"),
    TEXT_DOCUMENT_RENAME("textDocument/rename"),
    TEXT_DOCUMENT_FOLDING_RANGE("textDocument/foldingRange"),
    TEXT_DOCUMENT_SEMANTIC_TOKENS_FULL("textDocument/semanticTokens/full"),
    TEXT_DOCUMENT_INLAY_HINT("textDocument/inlayHint"),

    // ── Workspace ──
    WORKSPACE_SYMBOL("workspace/symbol"),
    WORKSPACE_EXECUTE_COMMAND("workspace/executeCommand"),
    WORKSPACE_DID_CHANGE_CONFIGURATION("workspace/didChangeConfiguration", true),
    WORKSPACE_DID_CHANGE_WATCHED_FILES("workspace/didChangeWatchedFiles", true),

    // ── 诊断 ──
    TEXT_DOCUMENT_PUBLISH_DIAGNOSTICS("textDocument/publishDiagnostics", true),

    // ── 窗口 ──
    WINDOW_SHOW_MESSAGE("window/showMessage", true),
    WINDOW_SHOW_MESSAGE_REQUEST("window/showMessageRequest"),
    WINDOW_LOG_MESSAGE("window/logMessage", true),

    // ── 进度 ──
    WINDOW_WORK_DONE_PROGRESS_CREATE("window/workDoneProgress/create"),
    WINDOW_WORK_DONE_PROGRESS("$/progress", true),

    // ── 客户端寄存器 ──
    CLIENT_REGISTER_CAPABILITY("client/registerCapability"),
    ;

    private final String method;
    private final boolean notification;

    LspMethod(String method) {
        this(method, false);
    }

    LspMethod(String method, boolean notification) {
        this.method = method;
        this.notification = notification;
    }

    /** 获取 JSON-RPC method 字符串。 */
    public String getMethod() {
        return method;
    }

    /** 是否为通知（无需响应）。 */
    public boolean isNotification() {
        return notification;
    }

    @Override
    public String toString() {
        return method;
    }
}
