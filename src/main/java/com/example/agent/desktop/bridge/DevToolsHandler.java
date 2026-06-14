package com.example.agent.desktop.bridge;

import org.cef.browser.CefBrowser;
import org.cef.browser.CefFrame;
import org.cef.callback.CefQueryCallback;
import org.cef.handler.CefMessageRouterHandlerAdapter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.swing.*;
import java.awt.*;
import java.awt.event.WindowAdapter;
import java.awt.event.WindowEvent;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * DevTools 窗口管理 — 打开/关闭/防重入/资源清理。
 *
 * <p>
 * 通过构造函数注入父窗口 JFrame，不依赖 DesktopApplication 静态字段。
 * 使用实例级 pendingCallbacks 持有异步回调引用。
 * </p>
 *
 * <p>
 * 窗口关闭时只隐藏（HIDE_ON_CLOSE），不销毁 CEF 浏览器实例，
 * 避免反复 getDevTools() 导致 DevTools 页面空白。
 * </p>
 */
public class DevToolsHandler extends CefMessageRouterHandlerAdapter {

    private static final Logger logger = LoggerFactory.getLogger(DevToolsHandler.class);

    private final JFrame parentFrame;
    private final List<CefQueryCallback> pendingCallbacks = new CopyOnWriteArrayList<>();

    /** 主浏览器引用，用于关闭 DevTools 时通知前端恢复按钮状态 */
    private CefBrowser mainBrowser;
    private JDialog devToolsDialog;
    private CefBrowser devToolsBrowser;

    public DevToolsHandler(JFrame parentFrame) {
        this.parentFrame = parentFrame;
    }

    @Override
    public boolean onQuery(CefBrowser browser, CefFrame frame, long queryId,
                           String request, boolean persistent, CefQueryCallback callback) {
        if (!request.contains("openDevTools")) {
            return false;
        }
        handleOpenDevTools(browser, callback);
        return true;
    }

    private void handleOpenDevTools(CefBrowser browser, CefQueryCallback callback) {
        logger.info("正在打开 DevTools 窗口...");
        pendingCallbacks.add(callback);
        this.mainBrowser = browser;

        // 如果已有 DevTools 窗口，直接显示并聚焦，避免重复创建导致空白
        if (devToolsDialog != null) {
            if (!devToolsDialog.isVisible()) {
                devToolsDialog.setVisible(true);
            }
            devToolsDialog.toFront();
            notifyFrontend(true);
            callback.success("{}");
            pendingCallbacks.remove(callback);
            return;
        }

        // 首次创建 DevTools
        CefBrowser devTools = browser.getDevTools();
        devToolsBrowser = devTools;

        SwingUtilities.invokeLater(() -> {
            try {
                JDialog dialog = new JDialog(parentFrame, "Hippo Code - DevTools", false);
                // HIDE_ON_CLOSE 而非 DISPOSE_ON_CLOSE：关闭只隐藏，保留 CEF 浏览器实例
                dialog.setDefaultCloseOperation(JDialog.HIDE_ON_CLOSE);
                dialog.setSize(960, 640);
                dialog.setLocationRelativeTo(parentFrame);
                dialog.add(devTools.getUIComponent(), BorderLayout.CENTER);

                // 窗口关闭时只隐藏，不销毁 CEF 资源
                dialog.addWindowListener(new WindowAdapter() {
                    @Override
                    public void windowClosing(WindowEvent e) {
                        logger.info("DevTools 窗口已隐藏，CEF 浏览器实例保留");
                        notifyFrontend(false);
                    }
                });

                dialog.setVisible(true);
                devToolsDialog = dialog;
                logger.info("DevTools 窗口已打开");
                notifyFrontend(true);
                callback.success("{}");
            } catch (Exception e) {
                logger.error("打开 DevTools 失败", e);
                callback.failure(500, e.getMessage());
                // 异常时彻底清理，避免泄漏
                notifyFrontend(false);
                destroyDevTools();
            } finally {
                pendingCallbacks.remove(callback);
            }
        });
    }

    /** 通知前端 DevTools 打开/关闭状态 */
    private void notifyFrontend(boolean open) {
        if (mainBrowser != null) {
            SwingUtilities.invokeLater(() ->
                mainBrowser.executeJavaScript(
                    "window.__devToolsOpen(" + open + ")", "", 0));
        }
    }

    /** 彻底销毁 DevTools 资源（异常恢复时调用） */
    private void destroyDevTools() {
        JDialog dialog = devToolsDialog;
        CefBrowser browser = devToolsBrowser;
        devToolsDialog = null;
        devToolsBrowser = null;

        if (dialog != null) {
            dialog.dispose();
        }
        if (browser != null) {
            browser.close(false);
        }
    }
}
