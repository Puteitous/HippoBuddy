/**
 * 模式预设数据（ChatEmptyHero 空会话 Hero 使用）
 *
 * 数据与旧版 ModePresets.js 的 MODE_PRESETS / SLOGAN_MAP 对齐。
 * 独立成纯数据文件,避免在组件文件中导出非组件内容触发 react-refresh 告警。
 */
import type { ModePreset, SessionMode } from '@/types';

/** 各模式的预设提示词 */
export const MODE_PRESETS: Record<SessionMode, ModePreset[]> = {
  chat: [
    {
      label: '头脑风暴',
      icon: 'M12 2a5 5 0 0 0-5 5c0 2 1 3.5 2.5 4.5V15a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-3.5C16 10.5 17 9 17 7a5 5 0 0 0-5-5z M9 17h6',
      prompt: '请帮我做一些头脑风暴,围绕以下主题展开多个视角的思考:',
    },
    {
      label: '润色',
      icon: 'M17 3a2 2 0 0 1 2 2L9 15l-4 1 1-4Z M15 5l4 4',
      prompt: '请帮我对下面的文字进行润色,使其表达更清晰、专业,但保持原意不变:',
    },
    {
      label: '解读',
      icon: 'M4 6h16v14H4z M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2',
      prompt: '请帮我解读下面这段内容,提炼核心观点与关键信息:',
    },
    {
      label: '翻译',
      icon: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M2 12h20 M6 4.5a16 16 0 0 0 0 15 M18 4.5a16 16 0 0 1 0 15',
      prompt: '请将下面的内容在中文与英文之间互相翻译,保持专业术语与上下文一致:',
    },
  ],
  office: [
    {
      label: '周报',
      icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6l-4-4z M14 2v4h4 M8 10h8 M8 14h6',
      prompt: '请根据以下本周工作要点,生成一份结构清晰的周报,包括进展、问题、下周计划:',
    },
    {
      label: '数据分析',
      icon: 'M4 20h16 M6 16v-4 M12 16v-8 M18 16v-6',
      prompt: '请基于以下数据进行分析,给出趋势、异常与建议:',
    },
    {
      label: 'PPT 大纲',
      icon: 'M2 3h20v12H2z M8 21h8 M12 15v6',
      prompt: '请帮我生成一份 PPT 大纲,围绕以下主题,每页给出标题与要点:',
    },
    {
      label: '会议纪要',
      icon: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2 M15 2H9a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1z M8 11h8 M8 15h5',
      prompt: '请根据以下会议记录,整理出结构化的会议纪要,包括议题、决议、待办:',
    },
  ],
  coding: [
    {
      label: '代码审查',
      icon: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M21 21l-6-6',
      prompt: '请对下面的代码进行审查,指出潜在问题、风险与改进建议:',
    },
    {
      label: '生成测试',
      icon: 'M9 3v7L4 18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2L15 10V3 M9 3h6',
      prompt: '请为以下代码生成单元测试,覆盖关键路径与边界条件,使用 JUnit 5 + Mockito:',
    },
    {
      label: '解读代码',
      icon: 'M8 6l-5 6 5 6 M16 6l5 6-5 6',
      prompt: '请帮我解读下面这段代码的作用、关键逻辑与潜在风险:',
    },
    {
      label: '重构',
      icon: 'M23 4v6h-6M1 20v-6h6M3.5 9a9 9 0 0 1 14.9-3.4L23 10M20.5 15a9 9 0 0 1-14.9 3.4L1 14',
      prompt: '请帮我对下面的代码进行重构,在不改变外部行为的前提下提升可读性与可维护性:',
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
