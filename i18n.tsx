import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type Language = 'zh' | 'en';

const messages = {
  zh: {
    tools: '工具', openTools: '打开工具面板', closeTools: '关闭工具面板',
    creativeSpace: '创意空间', apiConfiguration: 'API 配置', aiModel: 'AI 模型',
    serverAiModel: '服务器 AI 模型', notConfigured: '未配置', serverReady: '服务器就绪',
    needsEnv: '需要配置 .env', modelsAvailable: '可用模型：{count} 个', proKeyConnected: 'Pro 密钥已连接',
    switch: '切换', connectProKey: '连接 Pro 密钥', billingInfo: '计费说明', resolution: '分辨率',
    aspectRatio: '宽高比', numberOfImages: '图片数量', addNote: '添加便签', addArrow: '添加箭头',
    addLabel: '添加标签', addDrawing: '添加绘图', addWebPage: '添加网页', addImages: '添加图片',
    enterWebUrl: '输入要嵌入的网页地址：', color: '颜色', changeColorTo: '将颜色改为{color}',
    labelBackground: '标签背景', transparentBackground: '将标签背景设为透明',
    labelBackgroundColor: '将标签背景设为{color}', controls: '操作', undo: '撤销', redo: '重做',
    bringToFront: '↑ 移到最前', sendToBack: '↓ 移到最后', copy: '复制', delete: '删除',
    resetView: '重置视图', trash: '回收站', language: '语言', chinese: '中文', english: 'English',
    apiProvider: 'API 提供方', serverApi: '服务器 API (.env)', customGeminiApi: '自定义 Gemini API',
    customOpenAiApi: '自定义 OpenAI API', serverAiReady: '服务器 AI 已就绪',
    serverAiNeedsConfig: '服务器 AI 需要配置', channel: '通道', defaultModel: '默认模型',
    availableModels: '可用模型', unknown: '未知', notSet: '未设置', none: '无',
    serverConfigHelp: '在服务器的 .env 文件中设置 AI_MODEL 和 AI_MODELS，然后重启服务器。每位用户都可以选择允许的模型，而不会看到 API 密钥。',
    geminiApiKey: 'Gemini API 密钥', baseUrl: '基础 URL', modelName: '模型名称',
    deleteSavedModel: '删除已保存的模型', apiKey: 'API 密钥', enableStream: '启用流式输出', done: '完成',
    editDrawing: '编辑绘图', downloadImage: '下载图片', changeColor: '更改颜色', addImage: '添加图片',
    drawingPad: '绘图板', pencil: '画笔', eraser: '橡皮擦', size: '大小：', clear: '清空',
    cancel: '取消', saveDrawing: '保存绘图', history: '历史记录', openHistory: '打开生成记录',
    closeHistory: '关闭生成记录', generationHistory: '生成记录', historyHelp: '任务和生成的图片会显示在这里。',
    latestAnnotation: '最近的标注附件', emptyHistory: '在画布上选中元素，然后点击“生成”来创建图片。',
    generating: '生成中', failed: '失败', completed: '已完成', imagesCount: '{count} 张图片',
    requestsCount: '{count} 个请求', generatingEllipsis: '正在生成…', parallelTask: '此任务可与其他任务同时运行。',
    addToCanvas: '添加到画布', deleteImage: '删除图片', restore: '恢复', deletePermanently: '永久删除',
    emptyTrash: '清空回收站', trashEmpty: '回收站为空', trashTitle: '回收站（{count}）',
    selectedItems: '已选择 {count} 项', selectTrashItems: '请选择要恢复或删除的项目',
    confirmEmptyTrash: '确定要永久删除全部 {count} 项吗？此操作无法撤销。', unknownElement: '未知元素',
    writePlaceholder: '写点什么…', labelPlaceholder: '标签…', generated: '已生成', ready: '就绪',
    output: '输出', workflowOutput: '工作流输出', userUpload: '用户上传', userDrawing: '用户绘图',
    doubleClickDraw: '双击开始绘图', aiSource: 'AI 来源：{mode}', deactivateForAi: '停用 AI 来源',
    activateForAi: '启用 AI 来源', copyAiContext: '复制 AI 上下文', close: '关闭', embeddedWebPage: '嵌入网页',
    failedCopyFullPage: '无法获取完整网页内容，已改为复制网址。',
    sessions: '会话', newSession: '新建会话', renameSession: '重命名会话', deleteSession: '删除会话',
    sessionPersistenceError: '会话保存失败', renameSessionPrompt: '请输入新的会话名称：',
    confirmDeleteSession: '确定删除“{name}”吗？此操作无法撤销。', sessionNotFound: '找不到该会话。',
    fallbackCurrentSession: '当前会话', generate: '生成', group: '编组', start: '开始', ungroup: '取消编组',
    moveGroup: '移动组', dropToAdd: '拖放图片或网址即可添加',
    invalidUrl: '请输入有效的网址。', selectGenerationContext: '请至少选择一个画布元素，或启用一个网页作为生成上下文。',
    serverKeyMissing: '服务器尚未配置 AI_API_KEY。', openAiKeyMissing: 'OpenAI API 密钥不可用。',
    geminiKeyMissing: 'Gemini API 密钥不可用。', copySelectionFailed: '复制当前选择失败。',
    newNote: '新便签', newLabel: '标签',
  },
  en: {
    tools: 'Tools', openTools: 'Open tools panel', closeTools: 'Close tools panel',
    creativeSpace: 'Creative Space', apiConfiguration: 'API Configuration', aiModel: 'AI Model',
    serverAiModel: 'Server AI model', notConfigured: 'Not configured', serverReady: 'Server ready',
    needsEnv: 'Needs .env', modelsAvailable: '{count} model(s) available', proKeyConnected: 'Pro Key Connected',
    switch: 'Switch', connectProKey: 'Connect Pro Key', billingInfo: 'Billing Info', resolution: 'Resolution',
    aspectRatio: 'Aspect Ratio', numberOfImages: 'Number of Images', addNote: 'Add Note', addArrow: 'Add Arrow',
    addLabel: 'Add Label', addDrawing: 'Add Drawing', addWebPage: 'Add Web Page', addImages: 'Add Image(s)',
    enterWebUrl: 'Enter a web page URL to embed:', color: 'Color', changeColorTo: 'Change color to {color}',
    labelBackground: 'Label Background', transparentBackground: 'Set label background to transparent',
    labelBackgroundColor: 'Set label background to {color}', controls: 'Controls', undo: 'Undo', redo: 'Redo',
    bringToFront: '↑ Bring to Front', sendToBack: '↓ Send to Back', copy: 'Copy', delete: 'Delete',
    resetView: 'Reset View', trash: 'Trash', language: 'Language', chinese: '中文', english: 'English',
    apiProvider: 'API Provider', serverApi: 'Server API (.env)', customGeminiApi: 'Custom Gemini API',
    customOpenAiApi: 'Custom OpenAI API', serverAiReady: 'Server AI is ready',
    serverAiNeedsConfig: 'Server AI needs configuration', channel: 'Channel', defaultModel: 'Default model',
    availableModels: 'Available models', unknown: 'unknown', notSet: 'not set', none: 'none',
    serverConfigHelp: "Set AI_MODEL and AI_MODELS in the server's .env file, then restart the server. Each user can choose an allowed model without seeing the API key.",
    geminiApiKey: 'Gemini API Key', baseUrl: 'Base URL', modelName: 'Model Name',
    deleteSavedModel: 'Delete saved model', apiKey: 'API Key', enableStream: 'Enable Stream', done: 'Done',
    editDrawing: 'Edit Drawing', downloadImage: 'Download Image', changeColor: 'Change Color', addImage: 'Add Image',
    drawingPad: 'Drawing Pad', pencil: 'Pencil', eraser: 'Eraser', size: 'Size:', clear: 'Clear',
    cancel: 'Cancel', saveDrawing: 'Save Drawing', history: 'History', openHistory: 'Open generation panel',
    closeHistory: 'Close generation panel', generationHistory: 'Generation History', historyHelp: 'Tasks and generated images appear here.',
    latestAnnotation: 'Latest annotation attachment', emptyHistory: 'Select elements on the canvas and click "Generate" to create images.',
    generating: 'Generating', failed: 'Failed', completed: 'Completed', imagesCount: '{count} image(s)',
    requestsCount: '{count} request(s)', generatingEllipsis: 'Generating...', parallelTask: 'This task can run alongside others.',
    addToCanvas: 'Add to Canvas', deleteImage: 'Delete image', restore: 'Restore', deletePermanently: 'Delete Permanently',
    emptyTrash: 'Empty Trash', trashEmpty: 'Trash is empty', trashTitle: 'Trash ({count})',
    selectedItems: '{count} item(s) selected', selectTrashItems: 'Select items to restore or delete',
    confirmEmptyTrash: 'Are you sure you want to permanently delete all {count} items? This action cannot be undone.', unknownElement: 'Unknown Element',
    writePlaceholder: 'Write...', labelPlaceholder: 'Label...', generated: 'Generated', ready: 'Ready',
    output: 'Output', workflowOutput: 'Workflow output', userUpload: 'User upload', userDrawing: 'User drawing',
    doubleClickDraw: 'Double-click to draw', aiSource: 'AI Source: {mode}', deactivateForAi: 'Deactivate for AI',
    activateForAi: 'Activate for AI', copyAiContext: 'Copy AI Context', close: 'Close', embeddedWebPage: 'Embedded Web Page',
    failedCopyFullPage: 'Failed to fetch full page content. Copied URL instead.',
    sessions: 'Sessions', newSession: 'New Session', renameSession: 'Rename Session', deleteSession: 'Delete Session',
    sessionPersistenceError: 'Failed to save session', renameSessionPrompt: 'Enter a new session name:',
    confirmDeleteSession: 'Delete “{name}”? This action cannot be undone.', sessionNotFound: 'Session not found.',
    fallbackCurrentSession: 'Current Session', generate: 'Generate', group: 'Group', start: 'Start', ungroup: 'Ungroup',
    moveGroup: 'Move group', dropToAdd: 'Drop images or URLs to add',
    invalidUrl: 'Please enter a valid URL.', selectGenerationContext: 'Select at least one canvas element or activate a web page to provide generation context.',
    serverKeyMissing: 'The server AI_API_KEY is not configured.', openAiKeyMissing: 'OpenAI API key is not available.',
    geminiKeyMissing: 'Gemini API key is not available.', copySelectionFailed: 'Failed to copy the current selection.',
    newNote: 'New Note', newLabel: 'Label',
  },
} as const;

export type TranslationKey = keyof typeof messages.zh;
type Variables = Record<string, string | number>;

interface I18nValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: TranslationKey, variables?: Variables) => string;
}

const STORAGE_KEY = 'banana-canvas-language';
const I18nContext = createContext<I18nValue | null>(null);

export const I18nProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [language, setLanguage] = useState<Language>(() => {
    if (typeof window === 'undefined') return 'zh';
    return window.localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'zh';
  });

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, language);
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  }, [language]);

  const value = useMemo<I18nValue>(() => ({
    language,
    setLanguage,
    t: (key, variables) => {
      let text: string = messages[language][key];
      if (!variables) return text;
      for (const [name, value] of Object.entries(variables)) {
        text = text.replaceAll(`{${name}}`, String(value));
      }
      return text;
    },
  }), [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = () => {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside I18nProvider');
  return value;
};
