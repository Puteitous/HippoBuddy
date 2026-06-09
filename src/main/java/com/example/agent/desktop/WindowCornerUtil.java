package com.example.agent.desktop;

import com.sun.jna.Function;
import com.sun.jna.Native;
import com.sun.jna.NativeLibrary;
import com.sun.jna.Pointer;
import com.sun.jna.ptr.IntByReference;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.swing.*;
import java.awt.*;
import java.awt.geom.RoundRectangle2D;

/**
 * 窗口圆角工具 — 优先使用 Windows DWM API 实现硬件抗锯齿圆角，
 * 兜底使用 {@link Window#setShape(java.awt.Shape)}。
 *
 * <p>Windows 11 / 10 20H1+ 通过 {@code DwmSetWindowAttribute} 与
 * {@code DWMWA_WINDOW_CORNER_PREFERENCE = 33} 可实现 OS 级圆角裁剪，
 * 边缘自带硬件抗锯齿，效果远优于 {@code setShape} 的 1-bit 像素遮罩。</p>
 */
public final class WindowCornerUtil {

    private static final Logger LOG = LoggerFactory.getLogger(WindowCornerUtil.class);

    private static final int CORNER_RADIUS = 12;
    private static final int DWMWA_WINDOW_CORNER_PREFERENCE = 33;
    private static final int DWMWCP_ROUND = 2;
    private static final int DWMWCP_DONOTROUND = 1;

    private static Boolean dwmSupported;

    private WindowCornerUtil() {
    }

    /**
     * 应用窗口圆角。最大化时恢复直角，还原时重新切圆角。
     */
    public static void apply(JFrame frame, boolean maximized) {
        if (frame == null) return;

        if (maximized) {
            setCornerRound(frame, false);
        } else {
            setCornerRound(frame, true);
        }
    }

    private static void setCornerRound(JFrame frame, boolean round) {
        // 优先尝试 DWM API（仅 Windows，硬件抗锯齿）
        if (tryDwmSetRound(frame, round)) {
            return;
        }

        // 兜底：setShape（可能存在锯齿）
        setShapeRound(frame, round);
    }

    // ========== DWM API（Windows 原生抗锯齿） ==========

    private static boolean tryDwmSetRound(Window window, boolean round) {
        if (!isWindows()) return false;

        try {
            Pointer hwndPtr = Native.getWindowPointer(window);
            if (hwndPtr == null) return false;

            int pref = round ? DWMWCP_ROUND : DWMWCP_DONOTROUND;
            IntByReference prefRef = new IntByReference(pref);

            int result = DwmSetWindowAttribute(hwndPtr, DWMWA_WINDOW_CORNER_PREFERENCE,
                    prefRef.getPointer(), Integer.SIZE / 8);

            if (result == 0) {
                LOG.debug("DWM: set corner round={}", round);
                return true;
            } else {
                LOG.warn("DWM: DwmSetWindowAttribute returned {}", result);
                return false;
            }
        } catch (Exception e) {
            LOG.debug("DWM not available, falling back to setShape: {}", e.getMessage());
            return false;
        }
    }

    /**
     * 调用 dwmapi.DwmSetWindowAttribute。
     */
    private static int DwmSetWindowAttribute(Pointer hwnd, int dwAttribute,
                                              Pointer pvAttribute, int cbAttribute) {
        NativeLibrary dwmapi = NativeLibrary.getInstance("dwmapi");
        Function func = dwmapi.getFunction("DwmSetWindowAttribute");
        return func.invokeInt(new Object[]{hwnd, dwAttribute, pvAttribute, cbAttribute});
    }

    // ========== setShape 兜底 ==========

    private static void setShapeRound(JFrame frame, boolean round) {
        if (round) {
            int w = frame.getWidth();
            int h = frame.getHeight();
            if (w > 0 && h > 0) {
                frame.setShape(new RoundRectangle2D.Float(0, 0, w, h,
                        CORNER_RADIUS, CORNER_RADIUS));
            }
        } else {
            frame.setShape(null);
        }
    }

    // ========== 辅助方法 ==========

    private static boolean isWindows() {
        return System.getProperty("os.name", "").toLowerCase().contains("win");
    }

    /**
     * 判断 DWM 圆角在当前系统上是否可用（仅在 Windows 上检测一次）。
     */
    public static boolean isDwmSupported() {
        if (dwmSupported == null) {
            dwmSupported = false;
            if (isWindows()) {
                try {
                    NativeLibrary.getInstance("dwmapi");
                    dwmSupported = true;
                } catch (Exception ignored) {
                }
            }
        }
        return dwmSupported;
    }
}
