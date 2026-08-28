/**
 * 模式预设数据（ChatEmptyHero 空会话 Hero 使用）
 *
 * 数据与旧版 ModePresets.js 的 MODE_PRESETS / SLOGAN_MAP 对齐。
 * 独立成纯数据文件,避免在组件文件中导出非组件内容触发 react-refresh 告警。
 * label / prompt 存 i18n key,实际文案在 i18n/messages.ts 的 chat.preset.* 下。
 */
import type { ModePreset, SessionMode } from '@/types';

/** 各模式的预设提示词(label/prompt 为 i18n key) */
export const MODE_PRESETS: Record<SessionMode, ModePreset[]> = {
  chat: [
    {
      label: 'chat.preset.brainstorm.label',
      icon: 'M12 2a5 5 0 0 0-5 5c0 2 1 3.5 2.5 4.5V15a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-3.5C16 10.5 17 9 17 7a5 5 0 0 0-5-5z M9 17h6',
      prompt: 'chat.preset.brainstorm.prompt',
    },
    {
      label: 'chat.preset.polish.label',
      icon: 'M17 3a2 2 0 0 1 2 2L9 15l-4 1 1-4Z M15 5l4 4',
      prompt: 'chat.preset.polish.prompt',
    },
    {
      label: 'chat.preset.interpret.label',
      icon: 'M4 6h16v14H4z M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2',
      prompt: 'chat.preset.interpret.prompt',
    },
    {
      label: 'chat.preset.translate.label',
      icon: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M2 12h20 M6 4.5a16 16 0 0 0 0 15 M18 4.5a16 16 0 0 1 0 15',
      prompt: 'chat.preset.translate.prompt',
    },
  ],
  office: [
    {
      label: 'chat.preset.weeklyReport.label',
      icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6l-4-4z M14 2v4h4 M8 10h8 M8 14h6',
      prompt: 'chat.preset.weeklyReport.prompt',
    },
    {
      label: 'chat.preset.dataAnalysis.label',
      icon: 'M4 20h16 M6 16v-4 M12 16v-8 M18 16v-6',
      prompt: 'chat.preset.dataAnalysis.prompt',
    },
    {
      label: 'chat.preset.pptOutline.label',
      icon: 'M2 3h20v12H2z M8 21h8 M12 15v6',
      prompt: 'chat.preset.pptOutline.prompt',
    },
    {
      label: 'chat.preset.meetingMinutes.label',
      icon: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2 M15 2H9a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1z M8 11h8 M8 15h5',
      prompt: 'chat.preset.meetingMinutes.prompt',
    },
  ],
  coding: [
    {
      label: 'chat.preset.codeReview.label',
      icon: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M21 21l-6-6',
      prompt: 'chat.preset.codeReview.prompt',
    },
    {
      label: 'chat.preset.genTests.label',
      icon: 'M9 3v7L4 18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2L15 10V3 M9 3h6',
      prompt: 'chat.preset.genTests.prompt',
    },
    {
      label: 'chat.preset.interpretCode.label',
      icon: 'M8 6l-5 6 5 6 M16 6l5 6-5 6',
      prompt: 'chat.preset.interpretCode.prompt',
    },
    {
      label: 'chat.preset.refactor.label',
      icon: 'M23 4v6h-6M1 20v-6h6M3.5 9a9 9 0 0 1 14.9-3.4L23 10M20.5 15a9 9 0 0 1-14.9 3.4L1 14',
      prompt: 'chat.preset.refactor.prompt',
    },
  ],
};

/** 模式对应的标语(用于空状态 Hero 标题) */
export const SLOGAN_MAP: Record<SessionMode, string> = {
  chat: "Let's Chat!",
  office: "Let's Work!",
  coding: "Let's Code!",
};

/** 模式按钮展示顺序与中文名(与旧版 cockpit.html 一致:chat → coding → office) */
export const MODE_ORDER: SessionMode[] = ['chat', 'coding', 'office'];