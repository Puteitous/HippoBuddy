package com.example.agent.desktop;

import com.example.agent.logging.WorkspaceManager;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.swing.*;
import java.awt.*;
import java.awt.event.ComponentAdapter;
import java.awt.event.ComponentEvent;
import java.awt.event.WindowAdapter;
import java.awt.event.WindowEvent;
import java.nio.file.Path;

/**
 * 桌面窗口管理器 — 负责 JFrame 的创建、窗口控制、圆角应用。
 *
 * <p>
 * 所有窗口控制方法均通过实例方法暴露，供 Bridge Handler 注入调用，
 * 避免静态字段和静态方法的耦合。
 * </p>
 */
public class WindowManager {

    private static final Logger logger = LoggerFactory.getLogger(WindowManager.class);

    private JFrame mainFrame;
    private boolean maximized = false;
    private Runnable onWindowClosing;

    /**
     * 创建无标题栏主窗口（仅初始化框架，尚未显示）。
     * <p>
     * 构造函数中提前创建 JFrame，确保 {@link #getMainFrame()} 在注册 Bridge Handler 时可用。
     * 之后调用 {@link #showWindow(Component)} 将浏览器组件放入窗口并显示。
     * </p>
     *
     * @param onWindowClosing 窗口关闭时的回调（清理 CEF / Server 等资源）
     */
    public WindowManager(Runnable onWindowClosing) {
        this.onWindowClosing = onWindowClosing;
        this.mainFrame = new JFrame("Hippo Code");
        mainFrame.setDefaultCloseOperation(JFrame.DO_NOTHING_ON_CLOSE);
        mainFrame.setUndecorated(true);
        mainFrame.setBackground(new Color(0xED, 0xEF, 0xF2));
        mainFrame.setSize(1280, 800);
        mainFrame.setLocationRelativeTo(null);
        mainFrame.setResizable(true);

        // 窗口大小变化时重新应用圆角
        mainFrame.addComponentListener(new ComponentAdapter() {
            @Override
            public void componentResized(ComponentEvent e) {
                applyRoundedCorners();
            }
        });

        mainFrame.addWindowListener(new WindowAdapter() {
            @Override
            public void windowClosing(WindowEvent e) {
                logger.info("正在关闭桌面端...");
                mainFrame.setVisible(false);
                if (WindowManager.this.onWindowClosing != null) {
                    WindowManager.this.onWindowClosing.run();
                }
            }

            @Override
            public void windowDeiconified(WindowEvent e) {
                // undecorated JFrame 从最小化恢复时，Windows 会重置为 NORMAL 状态，
                // 导致最大化标志位丢失。这里手动重新应用最大化。
                if (maximized) {
                    maximized = false;
                    maximizeWindow();
                }
            }

            @Override
            public void windowStateChanged(WindowEvent e) {
                int newState = e.getNewState();
                // 最小化时不改变 maximized 状态，等还原时自动恢复
                if ((newState & Frame.ICONIFIED) != 0) return;
                maximized = (newState & Frame.MAXIMIZED_BOTH) != 0;
                SwingUtilities.invokeLater(WindowManager.this::applyRoundedCorners);
            }
        });
    }

    /**
     * 将浏览器组件添加到窗口并显示。
     *
     * @param browserComponent 浏览器 UI 组件
     */
    public void showWindow(Component browserComponent) {
        mainFrame.add(browserComponent, BorderLayout.CENTER);
        mainFrame.setVisible(true);
        // 窗口显示后首次应用圆角
        SwingUtilities.invokeLater(this::applyRoundedCorners);
        logger.info("桌面窗口已打开");
    }

    // ========== 窗口控制 ==========

    /** 最小化窗口 */
    public void minimizeWindow() {
        mainFrame.setExtendedState(Frame.ICONIFIED);
    }

    /**
     * 最大化窗口到可用屏幕区域（排除任务栏）。
     * 对 undecorated 窗口，使用 setMaximizedBounds + setExtendedState 组合，
     * 避免手动 setBounds 导致 JCEF 渲染异常。
     */
    public void maximizeWindow() {
        if (!maximized) {
            GraphicsConfiguration gc = mainFrame.getGraphicsConfiguration();
            Insets insets = Toolkit.getDefaultToolkit().getScreenInsets(gc);
            Rectangle screen = gc.getBounds();
            int x = screen.x + insets.left;
            int y = screen.y + insets.top;
            int w = screen.width - insets.left - insets.right;
            int h = screen.height - insets.top - insets.bottom;
            mainFrame.setMaximizedBounds(new Rectangle(x, y, w, h));
            mainFrame.setExtendedState(Frame.MAXIMIZED_BOTH);
            maximized = true;
        }
    }

    /** 还原窗口 */
    public void restoreWindow() {
        if (maximized) {
            mainFrame.setExtendedState(Frame.NORMAL);
            maximized = false;
        }
    }

    /** 切换最大化/还原 */
    public void toggleMaximize() {
        if (maximized) {
            restoreWindow();
        } else {
            maximizeWindow();
        }
    }

    /** 触发窗口关闭（dispatch WINDOW_CLOSING 事件） */
    public void closeWindow() {
        mainFrame.dispatchEvent(new WindowEvent(mainFrame, WindowEvent.WINDOW_CLOSING));
    }

    /** 移动窗口到指定坐标 */
    public void moveWindow(int x, int y) {
        mainFrame.setLocation(x, y);
    }

    /**
     * 获取窗口当前状态（位置、尺寸、最大化状态）。
     * 返回 ObjectNode 便于 Bridge Handler 直接序列化。
     */
    public com.fasterxml.jackson.databind.node.ObjectNode getState(
            com.fasterxml.jackson.databind.ObjectMapper mapper) {
        com.fasterxml.jackson.databind.node.ObjectNode state = mapper.createObjectNode();
        int actualState = mainFrame.getExtendedState();
        boolean actuallyMaximized = (actualState & Frame.MAXIMIZED_BOTH) != 0;
        maximized = actuallyMaximized; // 同步缓存
        state.put("maximized", actuallyMaximized);
        state.put("x", mainFrame.getX());
        state.put("y", mainFrame.getY());
        state.put("width", mainFrame.getWidth());
        state.put("height", mainFrame.getHeight());
        return state;
    }

    /** 当前是否已最大化 */
    public boolean isMaximized() {
        return maximized;
    }

    /** 获取主窗口 JFrame（供 Bridge Handler 作为对话框 parent 使用） */
    public JFrame getMainFrame() {
        return mainFrame;
    }

    // ========== 圆角处理 ==========

    /**
     * 应用窗口圆角形状。最大化时恢复直角，还原后重新切圆角。
     * 优先使用 Windows DWM API（硬件抗锯齿），兜底 setShape。
     */
    public void applyRoundedCorners() {
        WindowCornerUtil.apply(mainFrame, maximized);
    }

    // ========== 持久化配置路径 ==========

    public Path getThemeConfigPath() {
        return WorkspaceManager.getGlobalConfigDir().resolve("theme.txt");
    }

    public Path getRecentFoldersConfigPath() {
        return WorkspaceManager.getGlobalConfigDir().resolve("recent-folders.json");
    }

    public Path getWorkspaceSessionConfigPath() {
        return WorkspaceManager.getGlobalConfigDir().resolve("workspace-session.json");
    }
}
