package com.example.agent.desktop;

import com.sun.jna.Memory;
import com.sun.jna.Native;
import com.sun.jna.Pointer;
import com.sun.jna.Structure;
import com.sun.jna.platform.win32.Ole32;
import com.sun.jna.win32.StdCallLibrary;
import com.sun.jna.win32.W32APIOptions;

import java.awt.Window;
import java.util.List;

public final class NativeFolderPicker {

    private NativeFolderPicker() {
    }

    interface Shell32 extends StdCallLibrary {
        Shell32 INSTANCE = Native.load("shell32", Shell32.class, W32APIOptions.DEFAULT_OPTIONS);

        int BIF_RETURNONLYFSDIRS = 0x0001;
        int BIF_NEWDIALOGSTYLE = 0x0040;

        Pointer SHBrowseForFolderW(BROWSEINFOW.ByReference bi);
        boolean SHGetPathFromIDListW(Pointer pidl, char[] pszPath);
    }

    public static String chooseFolder(Window parent) {
        Pointer ownerHwnd = parent != null ? Native.getWindowPointer(parent) : null;

        Memory displayMem = new Memory(260L * 2L);
        Memory titleMem = new Memory(260L * 2L);
        titleMem.setWideString(0, "选择工作区文件夹");

        BROWSEINFOW.ByReference bi = new BROWSEINFOW.ByReference();
        bi.hwndOwner = ownerHwnd;
        bi.pidlRoot = null;
        bi.pszDisplayName = displayMem;
        bi.lpszTitle = titleMem;
        bi.ulFlags = Shell32.BIF_RETURNONLYFSDIRS | Shell32.BIF_NEWDIALOGSTYLE;
        bi.lpfn = null;
        bi.lParam = null;
        bi.iImage = 0;
        bi.write();

        Pointer pidl = Shell32.INSTANCE.SHBrowseForFolderW(bi);
        if (pidl == null) {
            return null;
        }

        try {
            char[] pathBuffer = new char[260];
            if (Shell32.INSTANCE.SHGetPathFromIDListW(pidl, pathBuffer)) {
                String path = Native.toString(pathBuffer);
                if (path != null && !path.isBlank()) {
                    return path;
                }
            }
            return null;
        } finally {
            Ole32.INSTANCE.CoTaskMemFree(pidl);
        }
    }

    public static class BROWSEINFOW extends Structure {
        public Pointer hwndOwner;
        public Pointer pidlRoot;
        public Pointer pszDisplayName;
        public Pointer lpszTitle;
        public int ulFlags;
        public Pointer lpfn;
        public Pointer lParam;
        public int iImage;

        @Override
        protected List<String> getFieldOrder() {
            return List.of("hwndOwner", "pidlRoot", "pszDisplayName", "lpszTitle",
                    "ulFlags", "lpfn", "lParam", "iImage");
        }

        public static class ByReference extends BROWSEINFOW implements Structure.ByReference {
        }
    }
}
