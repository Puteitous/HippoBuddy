package com.example.agent.desktop;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.swing.*;
import java.awt.*;
import java.io.File;

/**
 * 原生 Windows 文件夹选择器
 *
 * 使用 JFileChooser，稳定可靠。Windows 系统会自动呈现资源管理器风格。
 */
public final class NativeFolderPicker {

    private static final Logger logger = LoggerFactory.getLogger(NativeFolderPicker.class);

    private NativeFolderPicker() {
    }

    /**
     * 弹出一个文件夹选择对话框。
     *
     * @param parent 父窗口（对话框的拥有者），可以为 null
     * @return 选择的文件夹路径，如果用户取消则返回 null
     */
    public static String chooseFolder(Window parent) {
        try {
            JFileChooser chooser = new JFileChooser();
            chooser.setFileSelectionMode(JFileChooser.DIRECTORIES_ONLY);
            chooser.setDialogTitle("选择工作区文件夹");
            chooser.setApproveButtonText("选择文件夹");
            chooser.setAcceptAllFileFilterUsed(false);

            try {
                String userHome = System.getProperty("user.home");
                if (userHome != null) {
                    chooser.setCurrentDirectory(new File(userHome));
                }
            } catch (Exception ignored) {
            }

            Frame frame = (parent instanceof Frame) ? (Frame) parent : null;
            int result;
            if (frame != null) {
                result = chooser.showOpenDialog(frame);
            } else if (parent != null) {
                result = chooser.showOpenDialog(parent);
            } else {
                result = chooser.showOpenDialog(null);
            }

            if (result == JFileChooser.APPROVE_OPTION) {
                File selected = chooser.getSelectedFile();
                if (selected != null) {
                    return selected.getAbsolutePath();
                }
            }
            return null;
        } catch (Exception e) {
            logger.error("NativeFolderPicker failed", e);
            return null;
        }
    }
}
