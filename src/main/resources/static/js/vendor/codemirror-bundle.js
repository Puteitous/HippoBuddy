/**
 * CodeMirror 6 打包入口
 * 运行 `npm run build:cm` 重新生成 vendor/codemirror.js
 *
 * 不依赖 'codemirror' 元包，手动组装 basicSetup，
 * 避免 @codemirror/state 多实例 instanceof 检查失败。
 */

// 统一从 @codemirror/view 引入
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLineGutter,
  highlightSpecialChars,
  drawSelection,
  highlightActiveLine,
  rectangularSelection,
  crosshairCursor,
} from '@codemirror/view'

// 从 @codemirror/state 引入
import {
  EditorState,
  StateEffect,
  StateField,
  Facet,
  Compartment,
  Annotation,
  Transaction,
  combineConfig,
} from '@codemirror/state'

// 语言相关
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  bracketMatching,
  indentOnInput,
  foldGutter,
  foldKeymap,
} from '@codemirror/language'

// 命令
import {
  defaultKeymap,
  history,
  historyKeymap,
  toggleComment,
  indentWithTab,
} from '@codemirror/commands'

// 补全
import { closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete'

// 搜索
import { search, highlightSelectionMatches, searchKeymap, openSearchPanel, closeSearchPanel } from '@codemirror/search'

// 主题
import { oneDark } from '@codemirror/theme-one-dark'

// 语言包
import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'
import { java } from '@codemirror/lang-java'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { xml } from '@codemirror/lang-xml'
import { yaml } from '@codemirror/lang-yaml'
import { sql } from '@codemirror/lang-sql'
import { rust } from '@codemirror/lang-rust'
import { php } from '@codemirror/lang-php'
import { go } from '@codemirror/lang-go'
import { sass } from '@codemirror/lang-sass'

// ========== 导出所有 API 给 FilePreview.js 使用 ==========

export {
  EditorView,
  keymap,
  EditorState,
  Compartment,
  search,
  openSearchPanel,
  closeSearchPanel,
}

/** 手动构造 basicSetup，避免元包版本冲突 */
export const basicSetup = (() => {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    foldGutter(),
    drawSelection(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    bracketMatching(),
    closeBrackets(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    search(),
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...foldKeymap,
      indentWithTab,
      { key: 'Mod-/', run: toggleComment },
      ...completionKeymap,
    ]),
  ]
})()

export { oneDark }
export { javascript, python, java, html, css, json, markdown, xml, yaml, sql, rust, php, go, sass }
