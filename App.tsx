
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { GoogleGenAI, Modality } from "@google/genai";
import { InfiniteCanvas, CanvasApi } from './components/InfiniteCanvas';
import { ContextMenu } from './components/ContextMenu';
import { DrawingModal } from './components/DrawingModal';
import { TrashModal } from './components/TrashModal';
import { GenerationPanel } from './components/GenerationPanel';
import type { CanvasElement, NoteElement, ImageElement, ArrowElement, LabelElement, DrawingElement, Point, ElementType, IFrameElement, GenerationItem, WorkflowGroup, Bounds } from './types';
import { useHistoryState } from './useHistoryState';
import { useI18n } from './i18n';
import {
  createCanvasSession,
  deleteCanvasSession,
  getActiveSessionId,
  getCanvasSession,
  listCanvasSessions,
  saveCanvasSession,
  setActiveSessionId as persistActiveSessionId,
  type CanvasSession,
  type CanvasSessionSummary,
} from './canvasSessions';

export const COLORS = [
  { name: 'Gray', bg: 'bg-gray-700', text: 'text-gray-700' },
  { name: 'Red', bg: 'bg-red-500', text: 'text-red-500' },
  { name: 'Orange', bg: 'bg-orange-500', text: 'text-orange-500' },
  { name: 'Yellow', bg: 'bg-yellow-500', text: 'text-yellow-500' },
  { name: 'Green', bg: 'bg-green-500', text: 'text-green-500' },
  { name: 'Blue', bg: 'bg-blue-600', text: 'text-blue-600' },
  { name: 'Purple', bg: 'bg-purple-600', text: 'text-purple-600' },
  { name: 'Pink', bg: 'bg-pink-500', text: 'text-pink-500' },
];

const getInitialElements = (language: 'zh' | 'en'): CanvasElement[] => [
  { id: '1', type: 'note', position: { x: 100, y: 100 }, width: 180, height: 100, rotation: 0, zIndex: 1, content: language === 'zh' ? '欢迎！👋\nCopyright: Prompt_case' : 'Welcome! 👋\nCopyright: Prompt_case', color: 'bg-blue-600' },
  { id: '2', type: 'note', position: { x: 350, y: 250 }, width: 200, height: 100, rotation: -10, zIndex: 2, content: language === 'zh' ? '按住 [空格键] 或鼠标中键平移' : 'Hold [SPACE] or Middle Mouse to Pan', color: 'bg-green-500' },
  { id: '3', type: 'note', position: { x: -50, y: 350 }, width: 220, height: 100, rotation: 5, zIndex: 0, content: language === 'zh' ? '右键打开选项！\n双击画布添加便签。' : 'Right-click for options!\nDouble-click canvas to add a note.', color: 'bg-yellow-500' },
];

const INITIAL_ELEMENTS = getInitialElements('zh');

interface ContextMenuData {
    x: number;
    y: number;
    worldPoint: Point;
    elementId: string | null;
}

interface InternalClipboardSnapshot {
  elements: CanvasElement[];
  bounds: ReturnType<typeof getBoundingBox>;
}

type ApiProvider = 'server' | 'gemini-custom' | 'openai-custom';

interface ServerAiConfig {
  configured: boolean;
  provider: 'gemini' | 'openai-compatible';
  model: string;
  models: string[];
  stream: boolean;
}

type ImageAspectRatio = '1:1' | '3:4' | '4:3' | '9:16' | '16:9';
type ImageResolution = '1K' | '2K' | '4K';

const GPT_IMAGE_SIZES: Record<ImageResolution, Record<ImageAspectRatio, string>> = {
  '1K': {
    '1:1': '1024x1024',
    '3:4': '768x1024',
    '4:3': '1024x768',
    '9:16': '720x1280',
    '16:9': '1280x720',
  },
  '2K': {
    '1:1': '2048x2048',
    '3:4': '1536x2048',
    '4:3': '2048x1536',
    '9:16': '1152x2048',
    '16:9': '2048x1152',
  },
  '4K': {
    '1:1': '2880x2880',
    '3:4': '2448x3264',
    '4:3': '3264x2448',
    '9:16': '2160x3840',
    '16:9': '3840x2160',
  },
};

const isGptImageModel = (model: string) => /^gpt-image(?:-|$)/i.test(model.trim());
const isGptModel = (model: string) => /^gpt(?:-|$)/i.test(model.trim());
const isGeminiImageModel = (model: string) => /(?:^|\/)gemini-.*(?:image|imagen)(?:[-.:]|$)/i.test(model.trim());

const parseImageResultText = (value: string, allowRawBase64 = false) => {
  const text = value.trim();
  if (!text) return null;

  const markdownImage = text.match(/!\[[^\]]*\]\((data:image\/[^)]+|https?:\/\/[^)]+)\)/i);
  if (markdownImage) return markdownImage[1];

  const embeddedDataUrl = text.match(/data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/_=-]+/i);
  if (embeddedDataUrl) return embeddedDataUrl[0];

  if (/^https?:\/\//i.test(text) || /^data:image\//i.test(text)) return text;
  if (allowRawBase64 && text.length > 200) return `data:image/png;base64,${text}`;
  return null;
};

const extractOpenAiImageResult = (payload: any): string | null => {
  const visit = (value: any, depth = 0, allowRawBase64 = false): string | null => {
    if (value == null || depth > 5) return null;
    if (typeof value === 'string') return parseImageResultText(value, allowRawBase64);
    if (Array.isArray(value)) {
      for (const item of value) {
        const result = visit(item, depth + 1, allowRawBase64);
        if (result) return result;
      }
      return null;
    }
    if (typeof value !== 'object') return null;

    const base64Result = visit(value.b64_json, depth + 1, true)
      || visit(value.data, depth + 1, true);
    if (base64Result) return base64Result;

    const directResult = visit(value.url, depth + 1)
      || visit(value.image_url, depth + 1)
      || visit(value.inline_data, depth + 1, true)
      || visit(value.inlineData, depth + 1, true);
    if (directResult) return directResult;

    for (const key of ['images', 'image', 'content', 'text', 'parts']) {
      const result = visit(value[key], depth + 1);
      if (result) return result;
    }
    return null;
  };

  const topLevelResult = visit(payload?.data) || visit(payload?.b64_json, 0, true);
  if (topLevelResult) return topLevelResult;

  for (const choice of payload?.choices || []) {
    const result = visit(choice?.message) || visit(choice?.delta);
    if (result) return result;
  }
  return null;
};

const appendImageSizeRequirement = (
  prompt: string,
  resolution: ImageResolution,
  ratio: ImageAspectRatio,
  size: string
) => {
  const requirement = `Output size requirement: Generate the final image at ${resolution} resolution with a ${ratio} aspect ratio, exactly ${size} pixels.`;
  return `${prompt}\n\n${requirement}`;
};

const getOpenAiImageSize = (
  model: string,
  resolution: ImageResolution,
  ratio: ImageAspectRatio
) => {
  if (isGptModel(model)) {
    return GPT_IMAGE_SIZES[resolution][ratio];
  }

  if (ratio === '3:4' || ratio === '9:16') return '1024x1536';
  if (ratio === '4:3' || ratio === '16:9') return '1536x1024';
  return '1024x1024';
};

const getRandomPosition = () => ({
  x: Math.floor(Math.random() * 400) - 200,
  y: Math.floor(Math.random() * 400) - 200
});

const colorClassToCanvasColor = (className: string, fallback = '#ef4444') => {
  const colorMap: Record<string, string> = {
    gray: '#374151',
    red: '#ef4444',
    orange: '#f97316',
    yellow: '#eab308',
    green: '#22c55e',
    blue: '#2563eb',
    purple: '#9333ea',
    pink: '#ec4899',
    white: '#ffffff',
    black: '#111827',
  };
  const match = className.match(/(?:bg|text)-([a-z]+)-\d+/);
  return match ? colorMap[match[1]] || fallback : fallback;
};

const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error('Failed to load image for annotation attachment.'));
  img.src = src;
});

const getRotatedCorners = (el: CanvasElement): Point[] => {
  const rad = el.rotation * (Math.PI / 180);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const halfW = el.width / 2;
  const halfH = el.height / 2;

  return [
    { x: -halfW, y: -halfH },
    { x: halfW, y: -halfH },
    { x: halfW, y: halfH },
    { x: -halfW, y: halfH },
  ].map(corner => ({
    x: el.position.x + corner.x * cos - corner.y * sin,
    y: el.position.y + corner.x * sin + corner.y * cos,
  }));
};

const getBoundingBox = (elements: CanvasElement[]) => {
  const allCorners = elements.flatMap(getRotatedCorners);
  const minX = Math.min(...allCorners.map(c => c.x));
  const minY = Math.min(...allCorners.map(c => c.y));
  const maxX = Math.max(...allCorners.map(c => c.x));
  const maxY = Math.max(...allCorners.map(c => c.y));
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
};

const isPointInBounds = (point: Point, bounds: Bounds) => (
  point.x >= bounds.x
  && point.x <= bounds.x + bounds.width
  && point.y >= bounds.y
  && point.y <= bounds.y + bounds.height
);

const isElementInBounds = (element: CanvasElement, bounds: Bounds) => (
  isPointInBounds(element.position, bounds)
  || getRotatedCorners(element).some(corner => isPointInBounds(corner, bounds))
);

const getElementsInBounds = (elements: CanvasElement[], bounds: Bounds, excludedIds: string[] = []) => {
  const excludedSet = new Set(excludedIds);
  return elements.filter(el => !excludedSet.has(el.id) && isElementInBounds(el, bounds));
};

const drawArrow = (ctx: CanvasRenderingContext2D, el: ArrowElement) => {
  const strokeColor = colorClassToCanvasColor(el.color);
  const length = Math.max(el.width, 10);
  const height = Math.max(el.height, 30);
  const headLength = Math.min(22, Math.max(12, length * 0.18));

  ctx.save();
  ctx.translate(el.position.x, el.position.y);
  ctx.rotate(el.rotation * Math.PI / 180);
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const startX = -length / 2;
  const endX = length / 2;
  ctx.beginPath();
  ctx.moveTo(startX, 0);
  ctx.lineTo(endX - headLength * 0.55, 0);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(endX - headLength, -height / 3);
  ctx.lineTo(endX - 4, 0);
  ctx.lineTo(endX - headLength, height / 3);
  ctx.stroke();
  ctx.restore();
};

const drawLabel = (ctx: CanvasRenderingContext2D, el: LabelElement) => {
  ctx.save();
  ctx.translate(el.position.x, el.position.y);
  ctx.rotate(el.rotation * Math.PI / 180);

  const background = colorClassToCanvasColor(el.backgroundColor, 'transparent');
  if (el.backgroundColor !== 'transparent') {
    ctx.fillStyle = background;
    ctx.fillRect(-el.width / 2, -el.height / 2, el.width, el.height);
  }

  const fontSize = Math.max(10, el.fontSize || 24);
  ctx.fillStyle = colorClassToCanvasColor(el.textColor, '#ef4444');
  ctx.font = `600 ${fontSize}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const lines = el.content.split('\n');
  const lineHeight = fontSize * 1.25;
  const startY = -((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, index) => {
    ctx.fillText(line, 0, startY + index * lineHeight, el.width - 16);
  });
  ctx.restore();
};

const drawRoundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) => {
  const normalizedRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + normalizedRadius, y);
  ctx.lineTo(x + width - normalizedRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + normalizedRadius);
  ctx.lineTo(x + width, y + height - normalizedRadius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - normalizedRadius, y + height);
  ctx.lineTo(x + normalizedRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - normalizedRadius);
  ctx.lineTo(x, y + normalizedRadius);
  ctx.quadraticCurveTo(x, y, x + normalizedRadius, y);
  ctx.closePath();
};

const wrapCanvasText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
) => {
  const wrappedLines: string[] = [];
  text.split('\n').forEach(rawLine => {
    const words = rawLine.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      wrappedLines.push('');
      return;
    }

    let line = '';
    words.forEach(word => {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth || !line) {
        line = candidate;
      } else {
        wrappedLines.push(line);
        line = word;
      }
    });
    wrappedLines.push(line);
  });
  return wrappedLines;
};

const drawNote = (ctx: CanvasRenderingContext2D, el: NoteElement) => {
  ctx.save();
  ctx.translate(el.position.x, el.position.y);
  ctx.rotate(el.rotation * Math.PI / 180);

  const x = -el.width / 2;
  const y = -el.height / 2;
  drawRoundedRect(ctx, x, y, el.width, el.height, 8);
  ctx.fillStyle = colorClassToCanvasColor(el.color, '#2563eb');
  ctx.fill();

  const fontSize = 16;
  ctx.fillStyle = '#ffffff';
  ctx.font = `500 ${fontSize}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const lines = wrapCanvasText(ctx, el.content, Math.max(20, el.width - 28));
  const lineHeight = fontSize * 1.25;
  const maxLines = Math.max(1, Math.floor((el.height - 20) / lineHeight));
  const visibleLines = lines.slice(0, maxLines);
  const startY = -((visibleLines.length - 1) * lineHeight) / 2;
  visibleLines.forEach((line, index) => {
    ctx.fillText(line, 0, startY + index * lineHeight, el.width - 28);
  });
  ctx.restore();
};

const drawImageCover = (
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number
) => {
  const sourceRatio = img.width / img.height;
  const targetRatio = width / height;
  let sourceX = 0;
  let sourceY = 0;
  let sourceWidth = img.width;
  let sourceHeight = img.height;

  if (sourceRatio > targetRatio) {
    sourceWidth = img.height * targetRatio;
    sourceX = (img.width - sourceWidth) / 2;
  } else {
    sourceHeight = img.width / targetRatio;
    sourceY = (img.height - sourceHeight) / 2;
  }

  ctx.drawImage(img, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
};

const createAnnotationAttachment = async (selectedElements: CanvasElement[]) => {
  const hasAnnotationLayer = selectedElements.some(el => el.type === 'arrow' || el.type === 'label');
  if (!hasAnnotationLayer) return null;

  const compositableElements = selectedElements
    .filter(el => el.type === 'image' || el.type === 'drawing' || el.type === 'arrow' || el.type === 'label')
    .sort((a, b) => a.zIndex - b.zIndex);

  if (compositableElements.length === 0) return null;

  const bounds = getBoundingBox(compositableElements);
  const padding = 24;
  const targetWidth = Math.max(1, Math.ceil(bounds.width + padding * 2));
  const targetHeight = Math.max(1, Math.ceil(bounds.height + padding * 2));
  const scale = Math.min(1, 4096 / Math.max(targetWidth, targetHeight));

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(targetWidth * scale));
  canvas.height = Math.max(1, Math.round(targetHeight * scale));

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.scale(scale, scale);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, targetWidth, targetHeight);
  ctx.translate(-bounds.minX + padding, -bounds.minY + padding);

  for (const el of compositableElements) {
    if ((el.type === 'image' || el.type === 'drawing') && el.src) {
      const img = await loadImage(el.src);
      ctx.save();
      ctx.translate(el.position.x, el.position.y);
      ctx.rotate(el.rotation * Math.PI / 180);
      if (el.type === 'image') {
        drawImageCover(ctx, img, -el.width / 2, -el.height / 2, el.width, el.height);
      } else {
        ctx.drawImage(img, -el.width / 2, -el.height / 2, el.width, el.height);
      }
      ctx.restore();
    } else if (el.type === 'arrow') {
      drawArrow(ctx, el);
    } else if (el.type === 'label') {
      drawLabel(ctx, el);
    }
  }

  return canvas.toDataURL('image/png');
};

const canvasToBlob = (canvas: HTMLCanvasElement, type = 'image/png') => new Promise<Blob | null>(resolve => {
  canvas.toBlob(blob => resolve(blob), type);
});

const renderElementsToPngBlob = async (
  selectedElements: CanvasElement[],
  renderBounds?: Bounds | null
) => {
  const compositableElements = selectedElements
    .filter(el => el.type !== 'iframe')
    .sort((a, b) => a.zIndex - b.zIndex);

  if (compositableElements.length === 0) return null;

  const elementBounds = getBoundingBox(compositableElements);
  const padding = renderBounds ? 0 : 24;
  const bounds = renderBounds
    ? {
        minX: renderBounds.x,
        minY: renderBounds.y,
        maxX: renderBounds.x + renderBounds.width,
        maxY: renderBounds.y + renderBounds.height,
        width: renderBounds.width,
        height: renderBounds.height,
      }
    : elementBounds;
  const targetWidth = Math.max(1, Math.ceil(bounds.width + padding * 2));
  const targetHeight = Math.max(1, Math.ceil(bounds.height + padding * 2));
  const scale = Math.min(1, 4096 / Math.max(targetWidth, targetHeight));

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(targetWidth * scale));
  canvas.height = Math.max(1, Math.round(targetHeight * scale));

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.scale(scale, scale);
  ctx.clearRect(0, 0, targetWidth, targetHeight);
  ctx.translate(-bounds.minX + padding, -bounds.minY + padding);

  for (const el of compositableElements) {
    if ((el.type === 'image' || el.type === 'drawing') && el.src) {
      const img = await loadImage(el.src);
      ctx.save();
      ctx.translate(el.position.x, el.position.y);
      ctx.rotate(el.rotation * Math.PI / 180);
      if (el.type === 'image') {
        drawImageCover(ctx, img, -el.width / 2, -el.height / 2, el.width, el.height);
      } else {
        ctx.drawImage(img, -el.width / 2, -el.height / 2, el.width, el.height);
      }
      ctx.restore();
    } else if (el.type === 'note') {
      drawNote(ctx, el);
    } else if (el.type === 'arrow') {
      drawArrow(ctx, el);
    } else if (el.type === 'label') {
      drawLabel(ctx, el);
    }
  }

  return canvasToBlob(canvas, 'image/png');
};

const renderImageElementToPngBlob = async (el: ImageElement | DrawingElement) => {
  if (!el.src) return null;
  const img = await loadImage(el.src);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(el.width));
  canvas.height = Math.max(1, Math.round(el.height));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  if (el.type === 'image') {
    drawImageCover(ctx, img, 0, 0, el.width, el.height);
  } else {
    ctx.drawImage(img, 0, 0, el.width, el.height);
  }
  return canvasToBlob(canvas, 'image/png');
};

const writePngBlobToClipboard = async (blob: Blob) => {
  if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
    throw new Error('Image clipboard is not supported in this browser.');
  }
  await navigator.clipboard.write([
    new ClipboardItem({ 'image/png': blob })
  ]);
};

const isEditableTarget = (target: EventTarget | null) => {
  const element = target as HTMLElement | null;
  if (!element) return false;
  return element.tagName === 'INPUT'
    || element.tagName === 'TEXTAREA'
    || element.isContentEditable;
};

const getTextElementContent = (el: CanvasElement) => {
  if (el.type === 'note' || el.type === 'label') return el.content;
  if (el.type === 'iframe') return el.url;
  return '';
};

const App: React.FC = () => {
  const { language, setLanguage, t } = useI18n();
  const { 
    state: elements, 
    setState: setElements, 
    replaceState: replaceElements,
    undo, 
    redo, 
    canUndo, 
    canRedo 
  } = useHistoryState<CanvasElement[]>(INITIAL_ELEMENTS);

  const [sessionSummaries, setSessionSummaries] = useState<CanvasSessionSummary[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessionsReady, setSessionsReady] = useState(false);
  const [sessionError, setSessionError] = useState('');
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
  const [resetView, setResetView] = useState<() => void>(() => () => {});
  const [generationItems, setGenerationItems] = useState<GenerationItem[]>([]);
  const [workflowGroups, setWorkflowGroups] = useState<WorkflowGroup[]>([]);
  const [lastAnnotationPreview, setLastAnnotationPreview] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuData | null>(null);
  const [editingDrawing, setEditingDrawing] = useState<DrawingElement | null>(null);
  const [trashedElements, setTrashedElements] = useState<CanvasElement[]>([]);
  const [isTrashModalOpen, setIsTrashModalOpen] = useState(false);
  const [activeSelectionBounds, setActiveSelectionBounds] = useState<Bounds | null>(null);
  
  // Model and API Key State
  const [selectedModel, setSelectedModel] = useState<'gemini-2.5-flash-image' | 'gemini-3-pro-image-preview' | 'gemini-2.0-flash'>('gemini-2.5-flash-image');
  const [aspectRatio, setAspectRatio] = useState<ImageAspectRatio>('1:1');
  const [imageResolution, setImageResolution] = useState<ImageResolution>('1K');
  const [imageCount, setImageCount] = useState<number>(2);
  const [hasProKey, setHasProKey] = useState(false);

  // Custom API State
  const [apiProvider, setApiProvider] = useState<ApiProvider>(() => {
    const saved = localStorage.getItem('apiProvider');
    if (saved === 'gemini-custom' || saved === 'openai-custom') return saved;
    return 'server';
  });
  const [serverAiConfig, setServerAiConfig] = useState<ServerAiConfig>({
    configured: false,
    provider: 'gemini',
    model: '',
    models: [],
    stream: false,
  });
  const [serverSelectedModel, setServerSelectedModel] = useState('');
  const [serverAiConfigError, setServerAiConfigError] = useState('');
  const [customGeminiKey, setCustomGeminiKey] = useState(
    () => localStorage.getItem('customGeminiKey') || ''
  );
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState(
    () => localStorage.getItem('openaiBaseUrl') || 'https://api.openai.com/v1'
  );
  const [openaiModel, setOpenaiModel] = useState(
    () => localStorage.getItem('openaiModel') || 'gpt-4o'
  );
  const [openaiKey, setOpenaiKey] = useState(
    () => localStorage.getItem('openaiKey') || ''
  );
  const [openaiStream, setOpenaiStream] = useState(
    () => localStorage.getItem('openaiStream') === 'true'
  );
  const [openaiModelsList, setOpenaiModelsList] = useState<string[]>(() => {
    const saved = localStorage.getItem('openaiModelsList');
    return saved ? JSON.parse(saved) : ['gpt-4o', 'gpt-4-turbo', 'dall-e-3'];
  });
  const [isApiConfigOpen, setIsApiConfigOpen] = useState(false);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [isToolsPanelOpen, setIsToolsPanelOpen] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/ai/config')
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to load server AI configuration.');
        return data as ServerAiConfig;
      })
      .then(config => {
        if (!active) return;
        const models = config.models?.length ? config.models : [config.model].filter(Boolean);
        const normalizedConfig = { ...config, models };
        const savedModel = localStorage.getItem('serverAiModel');
        setServerAiConfig(normalizedConfig);
        setServerSelectedModel(savedModel && models.includes(savedModel) ? savedModel : config.model);
        setServerAiConfigError('');
      })
      .catch(error => {
        if (!active) return;
        setServerAiConfigError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('apiProvider', apiProvider);
    localStorage.setItem('customGeminiKey', customGeminiKey);
    localStorage.setItem('openaiBaseUrl', openaiBaseUrl);
    localStorage.setItem('openaiModel', openaiModel);
    localStorage.setItem('openaiKey', openaiKey);
    localStorage.setItem('openaiStream', openaiStream.toString());
    localStorage.setItem('openaiModelsList', JSON.stringify(openaiModelsList));
    if (serverSelectedModel) localStorage.setItem('serverAiModel', serverSelectedModel);
  }, [apiProvider, customGeminiKey, openaiBaseUrl, openaiModel, openaiKey, openaiStream, openaiModelsList, serverSelectedModel]);

  const handleCloseApiConfig = () => {
    if (apiProvider === 'openai-custom' && openaiModel && !openaiModelsList.includes(openaiModel)) {
      setOpenaiModelsList(prev => [...prev, openaiModel]);
    }
    setIsApiConfigOpen(false);
  };

  const handleDeleteModel = (e: React.MouseEvent, modelToDelete: string) => {
    e.stopPropagation();
    e.preventDefault();
    setOpenaiModelsList(prev => prev.filter(m => m !== modelToDelete));
    if (openaiModel === modelToDelete) {
        setOpenaiModel('');
    }
  };

  const handleModelSelect = (model: string) => {
    setOpenaiModel(model);
    setIsModelDropdownOpen(false);
  };

  const handleModelBlur = () => {
    setTimeout(() => {
        setIsModelDropdownOpen(false);
        if (openaiModel && !openaiModelsList.includes(openaiModel)) {
            setOpenaiModelsList(prev => [...prev, openaiModel]);
        }
    }, 200);
  };

  const imageInputRef = useRef<HTMLInputElement>(null);
  const canvasApiRef = useRef<CanvasApi>(null);
  const lastImagePosition = useRef<Point | null>(null);
  const lastPointerWorldPosition = useRef<Point | null>(null);
  const internalClipboardRef = useRef<InternalClipboardSnapshot | null>(null);
  const generationControllersRef = useRef<Map<string, AbortController>>(new Map());
  const zIndexCounter = useRef(INITIAL_ELEMENTS.length);
  const sessionIdentityRef = useRef<Pick<CanvasSession, 'id' | 'name' | 'createdAt'> | null>(null);

  const applyCanvasSession = useCallback((session: CanvasSession) => {
    generationControllersRef.current.forEach(controller => controller.abort());
    generationControllersRef.current.clear();
    const restoredElements = session.elements.map(element => (
      element.type === 'image' && element.workflowStatus === 'generating'
        ? { ...element, workflowStatus: 'failed' as const }
        : element
    ));
    const restoredGenerationItems = session.generationItems.map(item => (
      item.status === 'generating' ? { ...item, status: 'failed' as const } : item
    ));
    const restoredWorkflowGroups = session.workflowGroups.map(group => (
      group.status === 'generating' || group.status === 'waiting'
        ? { ...group, status: 'failed' as const }
        : group
    ));
    sessionIdentityRef.current = {
      id: session.id,
      name: session.name,
      createdAt: session.createdAt,
    };
    replaceElements(restoredElements);
    setGenerationItems(restoredGenerationItems);
    setWorkflowGroups(restoredWorkflowGroups);
    setTrashedElements(session.trashedElements);
    setLastAnnotationPreview(session.lastAnnotationPreview);
    setSelectedElementIds([]);
    setActiveSelectionBounds(null);
    setContextMenu(null);
    setEditingDrawing(null);
    setIsTrashModalOpen(false);
    zIndexCounter.current = restoredElements.reduce((max, element) => Math.max(max, element.zIndex), 0) + 1;
  }, [replaceElements]);

  const getCurrentSessionSnapshot = useCallback((): CanvasSession | null => {
    const identity = sessionIdentityRef.current;
    if (!identity || identity.id !== currentSessionId) return null;
    return {
      ...identity,
      elements,
      generationItems,
      workflowGroups,
      trashedElements,
      lastAnnotationPreview,
      updatedAt: Date.now(),
    };
  }, [currentSessionId, elements, generationItems, workflowGroups, trashedElements, lastAnnotationPreview]);

  useEffect(() => {
    let active = true;
    const initializeSessions = async () => {
      try {
        let summaries = await listCanvasSessions();
        let session: CanvasSession | undefined;
        const preferredId = getActiveSessionId();
        if (preferredId) session = await getCanvasSession(preferredId);
        if (!session && summaries.length > 0) session = await getCanvasSession(summaries[0].id);
        if (!session) {
          session = {
            ...createCanvasSession('会话 1', INITIAL_ELEMENTS),
            id: 'default',
          };
          await saveCanvasSession(session);
          summaries = [{
            id: session.id,
            name: session.name,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
          }];
        }
        if (!active) return;
        setSessionSummaries(summaries);
        setCurrentSessionId(session.id);
        persistActiveSessionId(session.id);
        applyCanvasSession(session);
        setSessionsReady(true);
      } catch (error) {
        if (!active) return;
        console.error('Failed to initialize canvas sessions:', error);
        setSessionError(error instanceof Error ? error.message : String(error));
        setSessionsReady(true);
      }
    };
    void initializeSessions();
    return () => {
      active = false;
    };
  }, [applyCanvasSession]);

  useEffect(() => {
    if (!sessionsReady || !currentSessionId) return;
    const timeout = window.setTimeout(() => {
      const session = getCurrentSessionSnapshot();
      if (!session) return;
      void saveCanvasSession(session)
        .then(() => {
          setSessionError('');
          setSessionSummaries(prev => prev
            .map(item => item.id === session.id ? {
              id: session.id,
              name: session.name,
              createdAt: session.createdAt,
              updatedAt: session.updatedAt,
            } : item)
            .sort((a, b) => b.updatedAt - a.updatedAt));
        })
        .catch(error => {
          console.error('Failed to save canvas session:', error);
          setSessionError(error instanceof Error ? error.message : String(error));
        });
    }, 150);
    return () => window.clearTimeout(timeout);
  }, [sessionsReady, currentSessionId, getCurrentSessionSnapshot]);

  useEffect(() => {
    const saveBeforeLeaving = () => {
      const session = getCurrentSessionSnapshot();
      if (session) void saveCanvasSession(session);
    };
    window.addEventListener('pagehide', saveBeforeLeaving);
    return () => window.removeEventListener('pagehide', saveBeforeLeaving);
  }, [getCurrentSessionSnapshot]);
  
  const checkProKey = useCallback(async () => {
    const hasKey = await window.aistudio.hasSelectedApiKey();
    setHasProKey(hasKey);
  }, []);

  useEffect(() => {
    checkProKey();
  }, [checkProKey]);

  const handleOpenKeySelector = async () => {
    await window.aistudio.openSelectKey();
    setHasProKey(true); // Assume success per guidelines
  };

  useEffect(() => {
    return () => {
      generationControllersRef.current.forEach(controller => controller.abort());
      generationControllersRef.current.clear();
    };
  }, []);

  const addElement = useCallback((newElement: Omit<NoteElement, 'id' | 'zIndex'> | Omit<ImageElement, 'id' | 'zIndex'> | Omit<ArrowElement, 'id' | 'zIndex'> | Omit<LabelElement, 'id' | 'zIndex'> | Omit<DrawingElement, 'id' | 'zIndex'> | Omit<IFrameElement, 'id' | 'zIndex'>) => {
    const elementWithId: CanvasElement = {
        ...newElement,
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        zIndex: zIndexCounter.current++,
    } as CanvasElement;
     setElements(prev => [...prev, elementWithId]);
  }, [setElements]);

  const addNote = useCallback((position?: Point) => {
    addElement({
      type: 'note',
      position: position || getRandomPosition(),
      width: 150,
      height: 100,
      rotation: 0,
      content: t('newNote'),
      color: COLORS[Math.floor(Math.random() * COLORS.length)].bg,
    });
  }, [addElement, t]);

  const addIFrame = useCallback((url: string, position?: Point) => {
    try {
        new URL(url);
    } catch (_) {
        alert(t('invalidUrl'));
        return;
    }

    addElement({
        type: 'iframe',
        position: position || getRandomPosition(),
        width: 500,
        height: 400,
        rotation: 0,
        url,
        isActivated: false,
        sourceMode: 'viewport',
    });
  }, [addElement, t]);
  
  const addDrawing = useCallback((position?: Point) => {
    addElement({
      type: 'drawing',
      position: position || getRandomPosition(),
      width: 400,
      height: 300,
      rotation: 0,
      src: '',
    });
  }, [addElement]);
  
  const handleEditDrawing = useCallback((elementId: string) => {
      const element = elements.find(el => el.id === elementId);
      if (element && element.type === 'drawing') {
          setEditingDrawing(element);
      }
  }, [elements]);
  
  const handleSaveDrawing = (elementId: string, dataUrl: string) => {
      setElements(prev => prev.map(el =>
          el.id === elementId ? { ...el, src: dataUrl } : el
      ));
      setEditingDrawing(null);
  };

  const addArrow = useCallback((position?: Point) => {
    const start = position || getRandomPosition();
    const end = { x: start.x + 150, y: start.y };

    const dx = end.x - start.x;
    const dy = end.y - start.y;

    const width = Math.sqrt(dx * dx + dy * dy);
    const rotation = Math.atan2(dy, dx) * (180 / Math.PI);
    const centerPosition = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };

    addElement({
      type: 'arrow',
      start,
      end,
      position: centerPosition,
      width,
      height: 30,
      rotation,
      color: 'text-red-500',
    });
  }, [addElement]);

  const addLabel = useCallback((position?: Point) => {
    addElement({
      type: 'label',
      position: position || getRandomPosition(),
      width: 220,
      height: 72,
      rotation: 0,
      content: t('newLabel'),
      textColor: 'text-red-500',
      backgroundColor: 'transparent',
      fontSize: 24,
    });
  }, [addElement, t]);
  
  const triggerImageUpload = (position?: Point) => {
    lastImagePosition.current = position || null;
    imageInputRef.current?.click();
  };
  
  const getCenterOfViewport = useCallback((): Point => {
    if (canvasApiRef.current) {
        const screenCenter: Point = {
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
        };
        return canvasApiRef.current.screenToWorld(screenCenter);
    }
    return getRandomPosition();
  }, []);

  const addImagesAtPosition = useCallback((files: FileList | File[], position: Point) => {
      const fileArray = Array.from(files);
      if (fileArray.length === 0) return;

      const imagePromises = fileArray
          .filter(file => file.type.startsWith('image/'))
          .map((file, index) => {
              return new Promise<Omit<ImageElement, 'id' | 'zIndex'> | null>((resolve) => {
                  const reader = new FileReader();
                  reader.onload = (e) => {
                      const src = e.target?.result as string;
                      if (!src) return resolve(null);

                      const img = new Image();
                      img.onload = () => {
                          const MAX_DIMENSION = 300;
                          let { width, height } = img;
                          if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
                              if (width > height) {
                                  height = (height / width) * MAX_DIMENSION;
                                  width = MAX_DIMENSION;
                              } else {
                                  width = (width / height) * MAX_DIMENSION;
                                  height = MAX_DIMENSION;
                              }
                          }
                          const imgPosition = { x: position.x + index * 20, y: position.y + index * 20 };
                          resolve({ type: 'image', position: imgPosition, src, width, height, rotation: 0 });
                      };
                      img.onerror = () => resolve(null);
                      img.src = src;
                  };
                  reader.onerror = () => resolve(null);
                  reader.readAsDataURL(file);
              });
          });

      Promise.all(imagePromises).then(results => {
          const newElements = results.filter((el): el is Omit<ImageElement, 'id' | 'zIndex'> => el !== null);
          if (newElements.length > 0) {
              setElements(prev => [
                  ...prev,
                  ...newElements.map(el => ({
                      ...el,
                      id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                      zIndex: zIndexCounter.current++,
                  } as CanvasElement))
              ]);
          }
      });
  }, [setElements]);

  const handleImageUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files || files.length === 0) return;
      const basePosition = lastImagePosition.current || getRandomPosition();
      addImagesAtPosition(files, basePosition);
      if (imageInputRef.current) {
          imageInputRef.current.value = "";
      }
  }, [addImagesAtPosition]);
  
  const handleImageDrop = useCallback((files: FileList, position: Point) => {
      addImagesAtPosition(files, position);
  }, [addImagesAtPosition]);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!canvasApiRef.current) return;
      lastPointerWorldPosition.current = canvasApiRef.current.screenToWorld({
        x: event.clientX,
        y: event.clientY,
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  useEffect(() => {
    const clearInternalClipboard = () => {
      internalClipboardRef.current = null;
    };

    window.addEventListener('blur', clearInternalClipboard);
    return () => {
      window.removeEventListener('blur', clearInternalClipboard);
    };
  }, []);

  const getPastePosition = useCallback((): Point => {
    return lastPointerWorldPosition.current || getCenterOfViewport();
  }, [getCenterOfViewport]);

  const getElementsForClipboard = useCallback(() => {
    const selectedElements = activeSelectionBounds
      ? elements.filter(el => isElementInBounds(el, activeSelectionBounds))
      : elements.filter(el => selectedElementIds.includes(el.id));

    return selectedElements.sort((a, b) => {
      if (Math.abs(a.position.y - b.position.y) > 12) return a.position.y - b.position.y;
      return a.position.x - b.position.x;
    });
  }, [activeSelectionBounds, elements, selectedElementIds]);

  const pasteInternalClipboard = useCallback((position: Point) => {
    const snapshot = internalClipboardRef.current;
    if (!snapshot || snapshot.elements.length === 0) return false;

    const center = {
      x: snapshot.bounds.minX + snapshot.bounds.width / 2,
      y: snapshot.bounds.minY + snapshot.bounds.height / 2,
    };
    const delta = {
      x: position.x - center.x,
      y: position.y - center.y,
    };
    const baseZIndex = zIndexCounter.current;

    const pastedElements = snapshot.elements
      .sort((a, b) => a.zIndex - b.zIndex)
      .map((el, index) => {
        const pasted = {
          ...el,
          id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          position: {
            x: el.position.x + delta.x,
            y: el.position.y + delta.y,
          },
          zIndex: baseZIndex + index,
        } as CanvasElement;

        if (pasted.type === 'arrow') {
          pasted.start = { x: pasted.start.x + delta.x, y: pasted.start.y + delta.y };
          pasted.end = { x: pasted.end.x + delta.x, y: pasted.end.y + delta.y };
        }

        return pasted;
      });

    zIndexCounter.current += pastedElements.length;
    setElements(prev => [...prev, ...pastedElements]);
    setSelectedElementIds(pastedElements.map(el => el.id));
    setActiveSelectionBounds(null);
    return true;
  }, [setElements]);

  const copySelectionToClipboard = useCallback(async (clipboardData?: DataTransfer | null) => {
    const selectedForCopy = getElementsForClipboard();
    if (selectedForCopy.length === 0) return false;

    internalClipboardRef.current = {
      elements: selectedForCopy.map(el => ({ ...el })),
      bounds: getBoundingBox(selectedForCopy),
    };
    try {
      clipboardData?.setData('application/x-banana-canvas-elements', JSON.stringify({
        copiedAt: Date.now(),
        elementCount: selectedForCopy.length,
      }));
    } catch (error) {
      console.warn('Custom canvas clipboard metadata could not be written:', error);
    }

    const textLikeElements = selectedForCopy.filter(el => el.type === 'note' || el.type === 'label' || el.type === 'iframe');
    const onlyTextLike = textLikeElements.length === selectedForCopy.length;
    const imageLikeElements = selectedForCopy.filter((el): el is ImageElement | DrawingElement => el.type === 'image' || el.type === 'drawing');
    const visualElements = selectedForCopy.filter(el => el.type === 'image' || el.type === 'drawing' || el.type === 'arrow');

    if (onlyTextLike) {
      const text = textLikeElements
        .map(getTextElementContent)
        .filter(Boolean)
        .join('\n');
      clipboardData?.setData('text/plain', text);
      if (!clipboardData && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      }
      return true;
    }

    if (selectedForCopy.length === 1 && imageLikeElements.length === 1) {
      const blob = await renderImageElementToPngBlob(imageLikeElements[0]);
      if (!blob) return false;
      await writePngBlobToClipboard(blob);
      return true;
    }

    if (imageLikeElements.length > 0 || visualElements.length > 0) {
      const blob = await renderElementsToPngBlob(selectedForCopy, activeSelectionBounds);
      if (!blob) return false;
      await writePngBlobToClipboard(blob);
      return true;
    }

    const text = selectedForCopy.map(getTextElementContent).filter(Boolean).join('\n');
    if (text) {
      clipboardData?.setData('text/plain', text);
      if (!clipboardData && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      }
      return true;
    }

    return false;
  }, [activeSelectionBounds, getElementsForClipboard]);

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
        if (isEditableTarget(event.target)) return;

        if (pasteInternalClipboard(getPastePosition())) {
            event.preventDefault();
            return;
        }

        const items = event.clipboardData?.items;
        if (!items) return;

        const imageFiles = Array.from(items)
            .filter(item => item.kind === 'file' && item.type.startsWith('image/'))
            .map(item => item.getAsFile() as File);
        
        if (imageFiles.length > 0) {
            const position = getPastePosition();
            addImagesAtPosition(imageFiles, position);
            event.preventDefault();
            return;
        }

        const textItem = Array.from(items).find(item => item.kind === 'string' && item.type.includes('text/plain'));
        if (textItem) {
            textItem.getAsString(pastedString => {
                if (!pastedString?.trim()) return;
                pastedString = pastedString.trim();
                
                try {
                    const url = new URL(pastedString);
                    if ((url.protocol === "http:" || url.protocol === "https:") && url.hostname.includes('.')) {
                         const position = getPastePosition();
                         addIFrame(pastedString, position);
                         event.preventDefault();
                    } else {
                        throw new Error("Not an embeddable URL");
                    }
                } catch (_) {
                    // Not a valid URL, create a note
                    const position = getPastePosition();
                    addElement({
                      type: 'note',
                      position: position,
                      width: 200,
                      height: 120,
                      rotation: 0,
                      content: pastedString,
                      color: COLORS[Math.floor(Math.random() * COLORS.length)].bg,
                    });
                    event.preventDefault();
                }
            });
        }
    };
    window.addEventListener('paste', handlePaste);
    return () => {
        window.removeEventListener('paste', handlePaste);
    };
  }, [addImagesAtPosition, getPastePosition, addIFrame, addElement, pasteInternalClipboard]);

  useEffect(() => {
    const handleCopy = (event: ClipboardEvent) => {
      if (isEditableTarget(event.target)) return;
      if (selectedElementIds.length === 0 && !activeSelectionBounds) return;

      event.preventDefault();
      void copySelectionToClipboard(event.clipboardData).catch(error => {
        console.error('Failed to copy selected canvas elements:', error);
      });
    };

    window.addEventListener('copy', handleCopy);
    return () => {
      window.removeEventListener('copy', handleCopy);
    };
  }, [activeSelectionBounds, copySelectionToClipboard, selectedElementIds.length]);
  
  const isAbortError = (error: unknown) => {
    return error instanceof DOMException && error.name === 'AbortError'
      || typeof error === 'object' && error !== null && (error as any).name === 'AbortError';
  };

  const handleCancelGeneration = useCallback((taskId: string) => {
    generationControllersRef.current.get(taskId)?.abort();
    generationControllersRef.current.delete(taskId);
    setGenerationItems(prev => prev.filter(item => item.id !== taskId));
  }, []);

 const handleGenerate = useCallback(async (
      selectedElements: CanvasElement[],
      workflowTarget?: { groupId: string; outputElementId: string }
    ) => {
      const imageElements = selectedElements.filter(el => el.type === 'image' || el.type === 'drawing') as (ImageElement | DrawingElement)[];
      const annotationElements = selectedElements.filter(el => el.type === 'image' || el.type === 'drawing' || el.type === 'arrow' || el.type === 'label');
      const textElements = selectedElements.filter(el => el.type === 'note' || el.type === 'label') as (NoteElement | LabelElement)[];
      const activeIframeElements = elements.filter(el => el.type === 'iframe' && el.isActivated) as IFrameElement[];

      if (annotationElements.length === 0 && textElements.length === 0 && activeIframeElements.length === 0) {
          alert(t('selectGenerationContext'));
          return;
      }

      if (apiProvider === 'server' && !serverAiConfig.configured) {
          alert(serverAiConfigError || t('serverKeyMissing'));
          return;
      }

      if (apiProvider === 'openai-custom' && !openaiKey) {
          alert(t('openAiKeyMissing'));
          return;
      }

      if (apiProvider === 'gemini-custom' && !customGeminiKey) {
          alert(t('geminiKeyMissing'));
          return;
      }

      const taskId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const controller = new AbortController();
      const { signal } = controller;
      generationControllersRef.current.set(taskId, controller);
      if (workflowTarget) {
        setWorkflowGroups(prev => prev.map(group => group.id === workflowTarget.groupId ? {
          ...group,
          status: 'generating',
          error: undefined,
        } : group));
        setElements(prev => prev.map(el => el.id === workflowTarget.outputElementId && el.type === 'image' ? {
          ...el,
          workflowStatus: 'generating',
        } : el), { addToHistory: false });
      } else {
        setGenerationItems(prev => [
          ...prev,
          {
            id: taskId,
            status: 'generating',
            images: [],
            requestedCount: imageCount,
            createdAt: Date.now(),
          },
        ]);
      }

      const completeGeneration = (validImages: string[]) => {
        if (workflowTarget) {
          const firstImage = validImages[0];
          setElements(prev => prev.map(el => el.id === workflowTarget.outputElementId && el.type === 'image' ? {
            ...el,
            src: firstImage,
            workflowStatus: 'completed',
          } : el), { addToHistory: true });
          setWorkflowGroups(prev => prev.map(group => group.id === workflowTarget.groupId ? {
            ...group,
            status: 'completed',
            error: validImages.length < imageCount ? 'Some images failed to generate.' : undefined,
          } : group));
          return;
        }

        setGenerationItems(prev => prev.map(item => item.id === taskId ? {
          ...item,
          status: 'completed',
          images: validImages,
          error: validImages.length < imageCount ? 'Some images failed to generate.' : undefined,
        } : item));
      };

      const failGeneration = (message: string) => {
        if (workflowTarget) {
          setElements(prev => prev.map(el => el.id === workflowTarget.outputElementId && el.type === 'image' ? {
            ...el,
            workflowStatus: 'failed',
          } : el), { addToHistory: false });
          setWorkflowGroups(prev => prev.map(group => group.id === workflowTarget.groupId ? {
            ...group,
            status: 'failed',
            error: message,
          } : group));
          return;
        }

        setGenerationItems(prev => prev.map(item => item.id === taskId ? {
          ...item,
          status: 'failed',
          error: message,
        } : item));
      };

      try {
        let instructions = textElements.map(element => element.content).join(' \n');
        const annotationAttachment = await createAnnotationAttachment(selectedElements);
        if (signal.aborted) return;
        setLastAnnotationPreview(annotationAttachment);

        if (activeIframeElements.length > 0) {
            const iframeContext = activeIframeElements.map(iframe => 
                `Analyze the content of the web page at this URL: ${iframe.url}. The user is interested in the ${iframe.sourceMode === 'viewport' ? 'currently visible content' : 'entire page content'}.`
            ).join('\n');
            instructions += `\n\n[Web Page Context]\n${iframeContext}\n(Note: You cannot access the web page directly, but use the URL and user's intent to inform the generation.)`;
        }

        const promptImageSize = GPT_IMAGE_SIZES[imageResolution][aspectRatio];

        const useServerOpenAi = apiProvider === 'server' && serverAiConfig.provider === 'openai-compatible';
        if (apiProvider === 'openai-custom' || useServerOpenAi) {
            const messages: any[] = [];
            const requestModel = useServerOpenAi ? serverSelectedModel : openaiModel;
            const requestStream = useServerOpenAi ? serverAiConfig.stream : openaiStream;
            const useImageApi = isGptImageModel(requestModel);
            const sourceImageUrls = imageElements.filter(el => el.src).map(el => el.src);
            const hasImageInputs = sourceImageUrls.length > 0;
            const inputImageUrls = annotationAttachment && hasImageInputs
                ? [...sourceImageUrls, annotationAttachment]
                : sourceImageUrls;
            const baseGenerationPrompt = `Generate a completely new image based on this description: "${instructions}"`;
            const baseEditPrompt = annotationAttachment
                ? `Using the clean source image(s) plus the annotated reference image, follow these instructions: "${instructions}". The annotated reference may contain arrows or visual text labels that indicate what area to edit; do not treat those markings as part of the desired final image unless the instructions explicitly say to keep them.`
                : `Using the source image(s) as references, follow these instructions: "${instructions}"`;
            const openaiSize = getOpenAiImageSize(
                requestModel,
                imageResolution,
                aspectRatio
            );
            const generationPrompt = appendImageSizeRequirement(
                baseGenerationPrompt,
                imageResolution,
                aspectRatio,
                promptImageSize
            );
            const editPrompt = appendImageSizeRequirement(
                baseEditPrompt,
                imageResolution,
                aspectRatio,
                promptImageSize
            );

            if (hasImageInputs || annotationAttachment) {
                const content: any[] = [
                    { type: "text", text: editPrompt }
                ];
                imageElements.filter(el => el.src).forEach(el => {
                    content.push({
                        type: "image_url",
                        image_url: { url: el.src }
                    });
                });
                if (annotationAttachment) {
                    content.push({
                        type: "image_url",
                        image_url: { url: annotationAttachment }
                    });
                }
                messages.push({ role: "user", content });
            } else {
                messages.push({ role: "user", content: generationPrompt });
            }


            const generateSingleImageOpenAI = async () => {
                const operation = hasImageInputs ? 'edits' : 'generations';
                const endpoint = useImageApi
                    ? (useServerOpenAi
                        ? '/api/ai/openai/images/' + operation
                        : openaiBaseUrl.replace(/\/$/, '') + '/images/' + operation)
                    : (useServerOpenAi
                        ? '/api/ai/openai/chat/completions'
                        : openaiBaseUrl.replace(/\/$/, '') + '/chat/completions');
                const requestBody = useImageApi
                    ? {
                        model: requestModel,
                        prompt: hasImageInputs ? editPrompt : generationPrompt,
                        ...(hasImageInputs ? {
                            images: inputImageUrls.map(imageUrl => ({ image_url: imageUrl })),
                        } : {}),
                        size: openaiSize,
                        n: 1,
                        stream: requestStream,
                    }
                    : {
                        model: requestModel,
                        messages,
                        ...(isGeminiImageModel(requestModel) ? {
                            modalities: ['image', 'text'],
                        } : {}),
                        size: openaiSize,
                        n: 1,
                        stream: requestStream,
                    };
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(!useServerOpenAi ? { 'Authorization': 'Bearer ' + openaiKey } : {}),
                        ...(requestStream ? { 'Accept': 'text/event-stream' } : {})
                    },
                    signal,
                    body: JSON.stringify(requestBody)
                });
                if (!response.ok) {
                    const errorText = await response.text();
                    let errorMessage = errorText || response.statusText;
                    try {
                        errorMessage = JSON.parse(errorText).error || errorMessage;
                    } catch {}
                    throw new Error('OpenAI API error: ' + errorMessage);
                }
                if (signal.aborted) return null;

                if (requestStream) {
                    const reader = response.body?.getReader();
                    const decoder = new TextDecoder("utf-8");
                    let contentStr = "";
                    let streamedImage: string | null = null;
                    if (reader) {
                        let done = false;
                        let buffer = "";
                        while (!done) {
                            if (signal.aborted) return null;
                            const { value, done: readerDone } = await reader.read();
                            done = readerDone;
                            if (value) {
                                buffer += decoder.decode(value, { stream: true });
                                const lines = buffer.split("\n");
                                buffer = lines.pop() || "";
                                for (const line of lines) {
                                    const eventData = line.startsWith('data:') ? line.slice(5).trimStart() : '';
                                    if (eventData && eventData.trim() !== '[DONE]') {
                                        try {
                                            const data = JSON.parse(eventData);
                                            streamedImage ||= extractOpenAiImageResult(data);
                                            if (data.choices?.[0]?.delta?.content) {
                                                const content = data.choices[0].delta.content;
                                                if (typeof content === 'string') contentStr += content;
                                            } else if (data.choices?.[0]?.delta?.image?.data) {
                                                contentStr += data.choices[0].delta.image.data;
                                            } else if (data.b64_json) {
                                                contentStr = data.b64_json;
                                            } else if (data.data?.[0]?.b64_json) {
                                                contentStr = data.data[0].b64_json;
                                            } else if (data.data?.[0]?.url) {
                                                contentStr = data.data[0].url;
                                            }
                                        } catch (e) {
                                            // Handle potential JSON parse errors on incomplete chunks safely
                                        }
                                    }
                                }
                            }
                        }
                    }
                    
                    return streamedImage || parseImageResultText(contentStr, true);
                }

                const data = await response.json();
                if (signal.aborted) return null;

                return extractOpenAiImageResult(data);
            };

            const results = await Promise.allSettled(Array.from({ length: imageCount }, () => generateSingleImageOpenAI()));
            if (signal.aborted) return;
            const validImages = results
                .filter((result): result is PromiseFulfilledResult<string | null> => result.status === 'fulfilled')
                .map(result => result.value)
                .filter((img): img is string => img !== null);
            if (validImages.length > 0) {
                completeGeneration(validImages);
            } else {
                throw new Error("Failed to parse image URL from OpenAI response.");
            }

        } else {
            // Server-managed or custom Gemini
            const genAI = apiProvider === 'gemini-custom'
                ? new GoogleGenAI({ apiKey: customGeminiKey })
                : null;

            const commonConfig = {
                responseModalities: [Modality.IMAGE, Modality.TEXT],
                imageConfig: {
                    aspectRatio: aspectRatio,
                    imageSize: imageResolution
                }
            };

            const generateGeminiContent = async (parts: any[]) => {
                if (apiProvider === 'server') {
                    const response = await fetch('/api/ai/gemini/generate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        signal,
                        body: JSON.stringify({
                            model: serverSelectedModel,
                            contents: { parts },
                            config: commonConfig,
                        }),
                    });
                    const data = await response.json();
                    if (!response.ok) throw new Error(data.error || 'Gemini server request failed.');
                    return data;
                }
                return genAI!.models.generateContent({
                    model: selectedModel,
                    contents: { parts },
                    config: { ...commonConfig, abortSignal: signal },
                });
            };

            if (imageElements.length > 0 || annotationAttachment) { // Editing/Reimagining with existing images
                const imageParts = imageElements.filter(el => el.src).map(el => {
                    const [header, data] = el.src.split(',');
                    const mimeType = header.match(/data:(.*);base64/)?.[1] || 'image/png';
                    return { inlineData: { data, mimeType } };
                });

                if (annotationAttachment) {
                    const [header, data] = annotationAttachment.split(',');
                    const mimeType = header.match(/data:(.*);base64/)?.[1] || 'image/png';
                    imageParts.push({ inlineData: { data, mimeType } });
                }

                const promptText = appendImageSizeRequirement(
                    `Using the clean source image(s) plus the annotated reference image, follow these instructions: "${instructions}". The annotated reference may contain arrows or visual text labels that indicate what area to edit; do not treat those markings as part of the desired final image unless the instructions explicitly say to keep them.`,
                    imageResolution,
                    aspectRatio,
                    promptImageSize
                );
                const parts = [...imageParts, { text: promptText }];
                
                const generateSingleImage = async () => {
                  const response = await generateGeminiContent(parts);
                  if (signal.aborted) return null;
                  for (const part of response.candidates?.[0]?.content?.parts || []) {
                      if (part.inlineData) {
                          return `data:image/png;base64,${part.inlineData.data}`;
                      }
                  }
                  return null;
                };

                const results = await Promise.allSettled(Array.from({ length: imageCount }, () => generateSingleImage()));
                if (signal.aborted) return;
                const validImages = results
                    .filter((result): result is PromiseFulfilledResult<string | null> => result.status === 'fulfilled')
                    .map(result => result.value)
                    .filter((img): img is string => img !== null);
                if (validImages.length > 0) {
                    completeGeneration(validImages);
                } else {
                    throw new Error("Failed to parse image data from Gemini response.");
                }

            } else { // Generating new image from text description
                const promptText = appendImageSizeRequirement(
                    `Generate a completely new image based on this description: "${instructions}"`,
                    imageResolution,
                    aspectRatio,
                    promptImageSize
                );

                const generateSingleImage = async () => {
                    const response = await generateGeminiContent([{ text: promptText }]);
                    if (signal.aborted) return null;
                    for (const part of response.candidates?.[0]?.content?.parts || []) {
                        if (part.inlineData) {
                            return `data:image/png;base64,${part.inlineData.data}`;
                        }
                    }
                    return null;
                };

                const results = await Promise.allSettled(Array.from({ length: imageCount }, () => generateSingleImage()));
                if (signal.aborted) return;
                const validImages = results
                    .filter((result): result is PromiseFulfilledResult<string | null> => result.status === 'fulfilled')
                    .map(result => result.value)
                    .filter((img): img is string => img !== null);
                if (validImages.length > 0) {
                    completeGeneration(validImages);
                } else {
                    throw new Error("Failed to parse image data from Gemini response.");
                }
            }
        }
      } catch (error: any) {
        if (isAbortError(error) || signal.aborted) {
            return;
        }
        console.error("Error generating image:", error);
        if (error?.message?.includes("Requested entity was not found.")) {
            failGeneration("Model access error. Please ensure you have a valid paid project API key selected.");
            setHasProKey(false);
        } else {
            failGeneration(error?.message || "Failed to generate image.");
        }
      } finally {
        generationControllersRef.current.delete(taskId);
      }
  }, [elements, selectedModel, aspectRatio, imageResolution, imageCount, apiProvider, serverAiConfig, serverSelectedModel, serverAiConfigError, customGeminiKey, openaiBaseUrl, openaiModel, openaiKey, openaiStream, setElements, t]);

  const handleCreateGroup = useCallback((bounds: Bounds, inputElementIds: string[]) => {
      const groupId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const outputElementId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const outputWidth = Math.max(96, Math.min(bounds.width * 0.5, 260));
      const outputHeight = Math.max(72, Math.min(bounds.height * 0.5, 260));
      const outputElement: ImageElement = {
          id: outputElementId,
          type: 'image',
          position: {
              x: bounds.x + bounds.width + 32 + outputWidth / 2,
              y: bounds.y + bounds.height / 2,
          },
          width: outputWidth,
          height: outputHeight,
          rotation: 0,
          zIndex: zIndexCounter.current++,
          src: '',
          isWorkflowOutput: true,
          workflowGroupId: groupId,
          workflowStatus: 'idle',
      };

      setElements(prev => [...prev, outputElement]);
      setWorkflowGroups(prev => [
          ...prev,
          {
              id: groupId,
              bounds,
              inputElementIds,
              outputElementId,
              status: 'idle',
          },
      ]);
  }, [setElements]);

  const handleUpdateGroupBounds = useCallback((groupId: string, bounds: Bounds, dragDelta?: Point) => {
      const group = workflowGroups.find(item => item.id === groupId);
      setWorkflowGroups(prev => prev.map(group => group.id === groupId ? { ...group, bounds } : group));
      if (!group || !dragDelta) return;

      setElements(prev => {
          const inputIds = new Set(getElementsInBounds(prev, group.bounds, [group.outputElementId]).map(input => input.id));
          return prev.map(el => {
          if (!inputIds.has(el.id)) return el;
          if (el.type === 'arrow') {
              return {
                  ...el,
                  position: { x: el.position.x + dragDelta.x, y: el.position.y + dragDelta.y },
                  start: { x: el.start.x + dragDelta.x, y: el.start.y + dragDelta.y },
                  end: { x: el.end.x + dragDelta.x, y: el.end.y + dragDelta.y },
              };
          }
          return {
              ...el,
              position: { x: el.position.x + dragDelta.x, y: el.position.y + dragDelta.y },
          };
          });
      }, { addToHistory: false });
  }, [workflowGroups, setElements]);

  const handleUngroup = useCallback((groupId: string) => {
      const group = workflowGroups.find(item => item.id === groupId);
      setWorkflowGroups(prev => prev.filter(item => item.id !== groupId));
      if (group) {
          setElements(prev => prev.filter(el => el.id !== group.outputElementId));
      }
  }, [workflowGroups, setElements]);

  const handleStartGroup = useCallback((groupId: string) => {
      const group = workflowGroups.find(item => item.id === groupId);
      if (!group || group.status === 'generating') return;

      const inputElements = getElementsInBounds(elements, group.bounds, [group.outputElementId]);
      const pendingInputs = inputElements.filter(el => el.type === 'image' && el.isWorkflowOutput && el.workflowStatus !== 'completed');
      if (pendingInputs.length > 0) {
          setWorkflowGroups(prev => prev.map(item => item.id === groupId ? { ...item, status: 'waiting' } : item));
          return;
      }

      void handleGenerate(inputElements, {
          groupId,
          outputElementId: group.outputElementId,
      });
  }, [elements, workflowGroups, handleGenerate]);

  useEffect(() => {
      const readyGroupIds = workflowGroups
          .filter(group => group.status === 'idle' || group.status === 'waiting')
          .filter(group => {
              const workflowInputs = getElementsInBounds(elements, group.bounds, [group.outputElementId])
                  .filter((el): el is ImageElement => el.type === 'image' && !!el.isWorkflowOutput);

              return workflowInputs.length > 0
                  && workflowInputs.every(el => el.workflowStatus === 'completed' && !!el.src);
          })
          .map(group => group.id);

      readyGroupIds.forEach(groupId => handleStartGroup(groupId));
  }, [elements, workflowGroups, handleStartGroup]);


  const handleSelectElement = useCallback((id: string | null, shiftKey: boolean) => {
    if (contextMenu) setContextMenu(null);

    if (id === null) {
      if (!shiftKey) {
        setSelectedElementIds([]);
        setActiveSelectionBounds(null);
      }
      return;
    }

    setActiveSelectionBounds(null);
    
    setSelectedElementIds(prevIds => {
      if (shiftKey) {
        return prevIds.includes(id) ? prevIds.filter(prevId => prevId !== id) : [...prevIds, id];
      } else {
        return prevIds.includes(id) ? prevIds : [id];
      }
    });
  }, [contextMenu]);

  const handleMarqueeSelect = useCallback((ids: string[], shiftKey: boolean) => {
    setSelectedElementIds(prevIds => {
      if (shiftKey) {
        const newIds = ids.filter(id => !prevIds.includes(id));
        return [...prevIds, ...newIds];
      } else {
        return ids;
      }
    });
  }, []);


  const updateElements = useCallback((updatedElement: CanvasElement, dragDelta?: Point) => {
    setElements(prevElements => {
      if (dragDelta && selectedElementIds.length > 1 && selectedElementIds.includes(updatedElement.id)) {
        const selectedSet = new Set(selectedElementIds);
        return prevElements.map(el => {
          if (el.id === updatedElement.id) {
            return updatedElement;
          }
          if (selectedSet.has(el.id)) {
             if (el.type === 'arrow') {
                return {
                    ...el,
                    position: { x: el.position.x + dragDelta.x, y: el.position.y + dragDelta.y },
                    start: { x: el.start.x + dragDelta.x, y: el.start.y + dragDelta.y },
                    end: { x: el.end.x + dragDelta.x, y: el.end.y + dragDelta.y },
                };
             }
             return { ...el, position: { x: el.position.x + dragDelta.x, y: el.position.y + dragDelta.y } };
          }
          return el;
        });
      } else {
        return prevElements.map(el => (el.id === updatedElement.id ? updatedElement : el));
      }
    }, { addToHistory: false });
  }, [selectedElementIds, setElements]);

  const handleInteractionEnd = useCallback(() => {
    setElements(currentElements => currentElements, { addToHistory: true });
  }, [setElements]);

  const trashElements = useCallback((ids: string[]) => {
      if (ids.length === 0) return;
      const idsSet = new Set(ids);
      const elementsToTrash: CanvasElement[] = [];

      setElements(prev => {
          const remainingElements = prev.filter(el => {
              if (idsSet.has(el.id)) {
                  elementsToTrash.push(el);
                  return false;
              }
              return true;
          });
          if (elementsToTrash.length > 0) {
              setTrashedElements(prevTrashed => [...prevTrashed, ...elementsToTrash]);
              setSelectedElementIds([]);
              const trashedSet = new Set(elementsToTrash.map(el => el.id));
              setWorkflowGroups(prevGroups => prevGroups.filter(group => !trashedSet.has(group.outputElementId)));
          }
          return remainingElements;
      });
  }, [setElements]);

  const deleteElement = useCallback(() => {
      trashElements(selectedElementIds);
  }, [selectedElementIds, trashElements]);

  const handleTrashElement = useCallback((elementId: string) => {
      trashElements([elementId]);
  }, [trashElements]);

  const handleRestoreElements = useCallback((ids: string[]) => {
      if (ids.length === 0) return;
      const idsSet = new Set(ids);
      const elementsToRestore: CanvasElement[] = [];

      setTrashedElements(prev => {
          const remainingTrashed = prev.filter(el => {
              if (idsSet.has(el.id)) {
                  elementsToRestore.push(el);
                  return false;
              }
              return true;
          });
          if (elementsToRestore.length > 0) {
              setElements(prevElements => [...prevElements, ...elementsToRestore]);
          }
          return remainingTrashed;
      });
  }, [setElements]);

  const handlePermanentlyDeleteElements = useCallback((ids: string[]) => {
      if (ids.length === 0) return;
      const idsSet = new Set(ids);
      setTrashedElements(prev => prev.filter(el => !idsSet.has(el.id)));
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isEditingText = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      if ((e.key === 'Delete' || e.key === 'Backspace') && !isEditingText) {
        e.preventDefault();
        deleteElement();
        return;
      }

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const isCtrlOrCmd = isMac ? e.metaKey : e.ctrlKey;

      if (isCtrlOrCmd && !isEditingText) {
        if (e.key.toLowerCase() === 'z') {
          e.preventDefault();
          if (e.shiftKey) {
            redo();
          } else {
            undo();
          }
        } else if (e.key.toLowerCase() === 'y') {
          e.preventDefault();
          redo();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [deleteElement, undo, redo]);

  const bringToFront = useCallback(() => {
    if (selectedElementIds.length === 0) return;
    const maxZ = Math.max(...elements.map(el => el.zIndex), 0);
    const selectedSet = new Set(selectedElementIds);
    setElements(prev => prev.map(el => selectedSet.has(el.id) ? { ...el, zIndex: maxZ + 1 } : el));
    zIndexCounter.current = maxZ + 2;
  }, [selectedElementIds, elements, setElements]);

  const sendToBack = useCallback(() => {
    if (selectedElementIds.length === 0) return;
    const minZ = Math.min(...elements.map(el => el.zIndex), 0);
    const selectedSet = new Set(selectedElementIds);
    setElements(prev => prev.map(el => selectedSet.has(el.id) ? { ...el, zIndex: minZ - 1 } : el));
  }, [selectedElementIds, elements, setElements]);

  const getResetViewCallback = useCallback((callback: () => void) => {
    setResetView(() => callback);
  }, []);

  const selectedElements = elements.filter(el => selectedElementIds.includes(el.id));
  const canChangeColor = selectedElements.some(el => el.type === 'note' || el.type === 'arrow' || el.type === 'label');
  const canChangeLabelBackground = selectedElements.some(el => el.type === 'label');

  const handleColorChange = (newColor: string) => {
      if (!canChangeColor) return;
      const selectedSet = new Set(selectedElementIds);
      setElements(prev => prev.map(el => {
          if (selectedSet.has(el.id)) {
              if (el.type === 'note') return { ...el, color: newColor };
              if (el.type === 'arrow') {
                const newTextColor = newColor.replace('bg-', 'text-');
                return { ...el, color: newTextColor };
              }
              if (el.type === 'label') {
                  return {
                      ...el,
                      textColor: newColor.replace('bg-', 'text-'),
                  };
              }
          }
          return el;
      }));
  };

  const handleLabelBackgroundChange = (newColor: string) => {
      const selectedSet = new Set(selectedElementIds);
      setElements(prev => prev.map(el => {
          if (selectedSet.has(el.id) && el.type === 'label') {
              return { ...el, backgroundColor: newColor };
          }
          return el;
      }));
  };

  const addGeneratedImageToCanvas = useCallback((imageUrl: string) => {
    if (!imageUrl) return;

    const src = imageUrl;
    const img = new Image();
    img.onload = () => {
      const MAX_DIMENSION = 400;
      let { width, height } = img;
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        if (width > height) {
          height = (height / width) * MAX_DIMENSION;
          width = MAX_DIMENSION;
        } else {
          width = (width / height) * MAX_DIMENSION;
          height = MAX_DIMENSION;
        }
      }
      addElement({
        type: 'image',
        position: getCenterOfViewport(),
        src,
        width,
        height,
        rotation: 0,
      });
    };
    img.src = src;
  }, [addElement, getCenterOfViewport]);
  
  const handleDeleteGeneratedImage = (taskId: string, imageIndex: number) => {
      setGenerationItems(prev => prev
        .map(item => item.id === taskId ? {
            ...item,
            images: item.images.filter((_, index) => index !== imageIndex),
        } : item)
        .filter(item => item.status !== 'completed' || item.images.length > 0)
      );
  };

  const downloadImage = useCallback((elementId: string) => {
    if (!elementId) return;
    const element = elements.find(el => el.id === elementId);
    if (element && (element.type === 'image' || element.type === 'drawing') && element.src) {
        const link = document.createElement('a');
        link.href = element.src;
        const mimeType = element.src.match(/data:(.*);base64/)?.[1] || 'image/png';
        const extension = mimeType.split('/')[1] || 'png';
        link.download = `canvas-image-${Date.now()}.${extension}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
  }, [elements]);

  const handleCopySelectionClick = useCallback(() => {
    void copySelectionToClipboard().catch(error => {
      console.error('Failed to copy selected canvas elements:', error);
      alert(t('copySelectionFailed'));
    });
  }, [copySelectionToClipboard, t]);

  const handleSwitchSession = useCallback(async (nextSessionId: string) => {
    if (!nextSessionId || nextSessionId === currentSessionId) return;
    try {
      const currentSession = getCurrentSessionSnapshot();
      if (currentSession) await saveCanvasSession(currentSession);
      const nextSession = await getCanvasSession(nextSessionId);
      if (!nextSession) throw new Error(t('sessionNotFound'));
      setCurrentSessionId(nextSession.id);
      persistActiveSessionId(nextSession.id);
      applyCanvasSession(nextSession);
      setSessionError('');
    } catch (error) {
      console.error('Failed to switch canvas session:', error);
      setSessionError(error instanceof Error ? error.message : String(error));
    }
  }, [currentSessionId, getCurrentSessionSnapshot, applyCanvasSession, t]);

  const handleCreateSession = useCallback(async () => {
    try {
      const currentSession = getCurrentSessionSnapshot();
      if (currentSession) await saveCanvasSession(currentSession);
      const sessionPrefix = language === 'zh' ? '会话' : 'Session';
      let sessionNumber = 1;
      const usedNames = new Set(sessionSummaries.map(item => item.name));
      while (usedNames.has(`${sessionPrefix} ${sessionNumber}`)) sessionNumber += 1;
      const sessionName = `${sessionPrefix} ${sessionNumber}`;
      const session = createCanvasSession(sessionName, getInitialElements(language));
      await saveCanvasSession(session);
      setSessionSummaries(prev => [{
        id: session.id,
        name: session.name,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      }, ...prev]);
      setCurrentSessionId(session.id);
      persistActiveSessionId(session.id);
      applyCanvasSession(session);
      setSessionError('');
    } catch (error) {
      console.error('Failed to create canvas session:', error);
      setSessionError(error instanceof Error ? error.message : String(error));
    }
  }, [getCurrentSessionSnapshot, sessionSummaries, applyCanvasSession, language]);

  const handleRenameSession = useCallback(async () => {
    const identity = sessionIdentityRef.current;
    if (!identity || identity.id !== currentSessionId) return;
    const nextName = prompt(t('renameSessionPrompt'), identity.name)?.trim();
    if (!nextName || nextName === identity.name) return;
    sessionIdentityRef.current = { ...identity, name: nextName };
    const session = getCurrentSessionSnapshot();
    if (!session) return;
    try {
      await saveCanvasSession(session);
      setSessionSummaries(prev => prev.map(item => item.id === session.id ? {
        ...item,
        name: nextName,
        updatedAt: session.updatedAt,
      } : item));
      setSessionError('');
    } catch (error) {
      console.error('Failed to rename canvas session:', error);
      setSessionError(error instanceof Error ? error.message : String(error));
    }
  }, [currentSessionId, getCurrentSessionSnapshot, t]);

  const handleDeleteSession = useCallback(async () => {
    if (!currentSessionId || sessionSummaries.length <= 1) return;
    const identity = sessionIdentityRef.current;
    const sessionName = identity?.name ?? t('fallbackCurrentSession');
    if (!confirm(t('confirmDeleteSession', { name: sessionName }))) return;
    try {
      const nextSummary = sessionSummaries.find(item => item.id !== currentSessionId);
      if (!nextSummary) return;
      const nextSession = await getCanvasSession(nextSummary.id);
      if (!nextSession) throw new Error(t('sessionNotFound'));
      await deleteCanvasSession(currentSessionId);
      setSessionSummaries(prev => prev.filter(item => item.id !== currentSessionId));
      setCurrentSessionId(nextSession.id);
      persistActiveSessionId(nextSession.id);
      applyCanvasSession(nextSession);
      setSessionError('');
    } catch (error) {
      console.error('Failed to delete canvas session:', error);
      setSessionError(error instanceof Error ? error.message : String(error));
    }
  }, [currentSessionId, sessionSummaries, applyCanvasSession, t]);

  const handleContextMenu = useCallback((e: React.MouseEvent, worldPoint: Point, elementId: string | null) => {
      e.preventDefault();
      
      if (elementId && !selectedElementIds.includes(elementId)) {
        handleSelectElement(elementId, false);
      }
      
      setContextMenu({ x: e.clientX, y: e.clientY, worldPoint, elementId });
  }, [selectedElementIds, handleSelectElement]);

  const contextMenuElement = contextMenu?.elementId ? elements.find(el => el.id === contextMenu.elementId) : null;

  return (
    <main className="relative w-screen h-[100dvh] overflow-hidden bg-gray-100 font-sans" onClick={() => setContextMenu(null)}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsToolsPanelOpen(true);
        }}
        className="fixed left-3 top-3 z-30 md:hidden inline-flex h-11 items-center gap-2 rounded-lg border border-gray-200 bg-white/90 px-3 text-sm font-semibold text-gray-700 shadow-lg backdrop-blur-sm"
        aria-label={t('openTools')}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16">
          <path fillRule="evenodd" d="M2.5 12a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5m0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5m0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5"/>
        </svg>
        {t('tools')}
      </button>

      {isToolsPanelOpen && (
        <button
          type="button"
          className="fixed inset-0 z-10 bg-black/20 md:hidden"
          aria-label={t('closeTools')}
          onClick={(e) => {
            e.stopPropagation();
            setIsToolsPanelOpen(false);
          }}
        />
      )}

      <div className={`fixed md:absolute top-0 left-0 md:top-4 md:left-4 z-20 p-4 bg-white/90 md:bg-white/80 backdrop-blur-sm md:rounded-lg shadow-lg border-r md:border border-gray-200 w-[min(20rem,calc(100vw-2rem))] md:w-64 h-[100dvh] md:h-auto md:max-h-[90vh] flex flex-col gap-4 overflow-y-auto overscroll-contain transition-transform duration-300 ${isToolsPanelOpen ? 'translate-x-0' : '-translate-x-[calc(100%+1rem)] md:translate-x-0'}`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
          <h1 className="text-xl font-bold text-gray-800">Banana Canvas</h1>
          <p className="text-sm text-gray-600 mt-1">Ver 3.0 • {t('creativeSpace')}</p>
          <div className="mt-2 flex rounded-md border border-gray-200 bg-gray-100 p-0.5" role="group" aria-label={t('language')}>
            <button
              type="button"
              onClick={() => setLanguage('zh')}
              className={`flex-1 rounded px-2 py-1 text-xs font-medium transition-colors ${language === 'zh' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
              aria-pressed={language === 'zh'}
            >
              {t('chinese')}
            </button>
            <button
              type="button"
              onClick={() => setLanguage('en')}
              className={`flex-1 rounded px-2 py-1 text-xs font-medium transition-colors ${language === 'en' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
              aria-pressed={language === 'en'}
            >
              {t('english')}
            </button>
          </div>
          <button 
            onClick={() => setIsApiConfigOpen(true)}
            className="mt-2 w-full px-2 py-1.5 text-xs bg-gray-100 text-gray-700 rounded border border-gray-200 hover:bg-gray-200 transition-colors flex items-center justify-center gap-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            {t('apiConfiguration')}
          </button>
          </div>
          <button
            type="button"
            onClick={() => setIsToolsPanelOpen(false)}
            className="md:hidden -mr-1 -mt-1 inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            aria-label={t('closeTools')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16">
              <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708"/>
            </svg>
          </button>
        </div>

        <section className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3" aria-label={t('sessions')}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-gray-700">{t('sessions')}</h2>
            {!sessionsReady && <span className="text-[10px] text-gray-400">…</span>}
          </div>
          <select
            value={currentSessionId ?? ''}
            onChange={(event) => void handleSwitchSession(event.target.value)}
            disabled={!sessionsReady || sessionSummaries.length === 0}
            className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:bg-gray-100"
            aria-label={t('sessions')}
          >
            {!currentSessionId && <option value="">{t('sessions')}</option>}
            {sessionSummaries.map(session => (
              <option key={session.id} value={session.id}>{session.name}</option>
            ))}
          </select>
          <div className="grid grid-cols-3 gap-1">
            <button
              type="button"
              onClick={() => void handleCreateSession()}
              disabled={!sessionsReady}
              className="rounded-md border border-gray-300 bg-white px-1 py-1.5 text-[10px] font-medium text-gray-700 hover:border-purple-400 hover:text-purple-700 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
            >
              {t('newSession')}
            </button>
            <button
              type="button"
              onClick={() => void handleRenameSession()}
              disabled={!sessionsReady || !currentSessionId}
              className="rounded-md border border-gray-300 bg-white px-1 py-1.5 text-[10px] font-medium text-gray-700 hover:border-purple-400 hover:text-purple-700 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
            >
              {t('renameSession')}
            </button>
            <button
              type="button"
              onClick={() => void handleDeleteSession()}
              disabled={!sessionsReady || sessionSummaries.length <= 1}
              className="rounded-md border border-gray-300 bg-white px-1 py-1.5 text-[10px] font-medium text-gray-700 hover:border-red-400 hover:text-red-600 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
            >
              {t('deleteSession')}
            </button>
          </div>
          {sessionError && (
            <p className="text-[10px] leading-4 text-red-600" title={sessionError}>
              {t('sessionPersistenceError')}: {sessionError}
            </p>
          )}
        </section>

        {/* Model Selection */}
        <div className="flex flex-col gap-2 p-3 bg-gray-50 rounded-lg border border-gray-100">
            <h2 className="text-sm font-bold text-gray-700 mb-1">{t('aiModel')}</h2>
            {apiProvider === 'server' ? (
                <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2">
                        <select
                            value={serverSelectedModel}
                            onChange={(event) => setServerSelectedModel(event.target.value)}
                            disabled={serverAiConfig.models.length === 0}
                            aria-label={t('serverAiModel')}
                            className="min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:bg-gray-100"
                        >
                            {serverAiConfig.models.length === 0 ? (
                                <option value="">{t('notConfigured')}</option>
                            ) : serverAiConfig.models.map(model => (
                                <option key={model} value={model}>{model}</option>
                            ))}
                        </select>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${serverAiConfig.configured ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                            {serverAiConfig.configured ? t('serverReady') : t('needsEnv')}
                        </span>
                    </div>
                    <span className="text-[10px] text-gray-500">
                        {serverAiConfig.provider === 'openai-compatible' ? 'OpenAI-compatible' : 'Gemini'} · {t('modelsAvailable', { count: serverAiConfig.models.length })}
                    </span>
                    {serverAiConfigError && (
                        <span className="text-[10px] text-red-600">{serverAiConfigError}</span>
                    )}
                </div>
            ) : apiProvider === 'openai-custom' ? (
                <div className="flex flex-col gap-1">
                    <select 
                        value={openaiModel}
                        onChange={(e) => setOpenaiModel(e.target.value)}
                        className="w-full px-2 py-1.5 text-xs rounded-md border bg-white text-gray-700 border-gray-300 focus:outline-none focus:ring-1 focus:ring-purple-500"
                    >
                        {openaiModelsList.map(model => (
                            <option key={model} value={model}>{model}</option>
                        ))}
                    </select>
                </div>
            ) : (
                <>
                    <div className="flex gap-1">
                        <button 
                            onClick={() => setSelectedModel('gemini-2.0-flash')}
                            className={`flex-1 px-1 py-1.5 text-[10px] rounded-md border transition-all ${selectedModel === 'gemini-2.0-flash' ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 border-gray-300 hover:border-purple-400'}`}
                        >
                            Banana 2
                        </button>
                        <button 
                            onClick={() => setSelectedModel('gemini-2.5-flash-image')}
                            className={`flex-1 px-1 py-1.5 text-[10px] rounded-md border transition-all ${selectedModel === 'gemini-2.5-flash-image' ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 border-gray-300 hover:border-purple-400'}`}
                        >
                            Banana
                        </button>
                        <button 
                            onClick={() => setSelectedModel('gemini-3-pro-image-preview')}
                            className={`flex-1 px-1 py-1.5 text-[10px] rounded-md border transition-all ${selectedModel === 'gemini-3-pro-image-preview' ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 border-gray-300 hover:border-purple-400'}`}
                        >
                            Banana Pro
                        </button>
                    </div>
                    
                    {selectedModel === 'gemini-3-pro-image-preview' && (
                        <div className="flex flex-col gap-3 mt-1">
                            {/* API Key Section */}
                            <div className="pt-2 border-t border-gray-200">
                                {hasProKey ? (
                                    <div className="flex items-center gap-1.5 text-[10px] text-green-600 font-medium">
                                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                        {t('proKeyConnected')}
                                        <button onClick={handleOpenKeySelector} className="ml-auto text-blue-500 hover:underline">{t('switch')}</button>
                                    </div>
                                ) : (
                                    <button 
                                        onClick={handleOpenKeySelector}
                                        className="w-full px-3 py-1.5 text-xs bg-amber-500 text-white rounded-md hover:bg-amber-600 transition-colors flex items-center justify-center gap-1"
                                    >
                                        <span>🔑 {t('connectProKey')}</span>
                                    </button>
                                )}
                                <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="text-[10px] text-gray-400 mt-1 block hover:underline text-center">{t('billingInfo')}</a>
                            </div>
                        </div>
                    )}
                </>
            )}

            <div className="mt-2">
                <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-semibold text-gray-600">{t('resolution')}</span>
                </div>
                <div className="grid grid-cols-3 gap-1">
                    {(['1K', '2K', '4K'] as const).map(res => (
                        <button
                            key={res}
                            onClick={() => setImageResolution(res)}
                            className={`px-1 py-1 text-[10px] rounded-md border transition-all ${imageResolution === res ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 border-gray-300 hover:border-purple-400'}`}
                        >
                            {res}
                        </button>
                    ))}
                </div>
            </div>
        </div>

        {/* Aspect Ratio Selection */}
        <div className="flex flex-col gap-2 p-3 bg-gray-50 rounded-lg border border-gray-100">
            <h2 className="text-sm font-bold text-gray-700 mb-1">{t('aspectRatio')}</h2>
            <div className="grid grid-cols-3 gap-1">
                {['1:1', '3:4', '4:3', '9:16', '16:9'].map(ratio => (
                    <button
                        key={ratio}
                        onClick={() => setAspectRatio(ratio as ImageAspectRatio)}
                        className={`px-2 py-1.5 text-xs rounded-md border transition-all ${aspectRatio === ratio ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'}`}
                    >
                        {ratio}
                    </button>
                ))}
            </div>

            {/* Image Count Selection */}
            <div className="mt-2">
                <h2 className="text-sm font-bold text-gray-700 mb-1">{t('numberOfImages')}</h2>
                <div className="grid grid-cols-4 gap-1">
                    {[1, 2, 3, 4].map(count => (
                        <button 
                            key={count}
                            onClick={() => setImageCount(count)}
                            className={`px-2 py-1.5 text-xs rounded-md border transition-all ${imageCount === count ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'}`}
                        >
                            {count}
                        </button>
                    ))}
                </div>
            </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
            <button onClick={() => addNote()} className="px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-colors">{t('addNote')}</button>
            <button onClick={() => addArrow()} className="px-3 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50 transition-colors">{t('addArrow')}</button>
            <button onClick={() => addLabel()} className="px-3 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50 transition-colors">{t('addLabel')}</button>
            <button onClick={() => addDrawing()} className="px-3 py-2 text-sm bg-purple-600 text-white rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-50 transition-colors">{t('addDrawing')}</button>
            <button onClick={() => {
                const url = prompt(t('enterWebUrl'), "https://");
                if (url) addIFrame(url);
              }} className="px-3 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-50 transition-colors col-span-2">{t('addWebPage')}</button>
            <label className="cursor-pointer px-3 py-2 text-sm text-center bg-orange-500 text-white rounded-md hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-opacity-50 transition-colors col-span-2">
                {t('addImages')}
                <input type="file" accept="image/*" ref={imageInputRef} className="hidden" onChange={handleImageUpload} multiple />
            </label>
        </div>

        {selectedElementIds.length > 0 && canChangeColor && (
            <div className="border-t pt-3 mt-1">
                <h2 className="text-md font-semibold text-gray-700 mb-2">{t('color')}</h2>
                <div className="grid grid-cols-8 gap-1.5">
                    {COLORS.map(color => {
                        const finalColor = color.bg;
                        return (
                            <button
                                key={color.name}
                                onClick={() => handleColorChange(finalColor)}
                                className={`w-6 h-6 rounded-full border-2 ${color.bg} border-white`}
                                aria-label={t('changeColorTo', { color: color.name })}
                            />
                        )
                    })}
                </div>
                {canChangeLabelBackground && (
                    <div className="mt-3">
                        <h3 className="text-xs font-semibold text-gray-600 mb-2">{t('labelBackground')}</h3>
                        <div className="grid grid-cols-8 gap-1.5">
                            <button
                                onClick={() => handleLabelBackgroundChange('transparent')}
                                className="w-6 h-6 rounded-full border-2 border-dashed border-gray-400 bg-white"
                                aria-label={t('transparentBackground')}
                            />
                            {COLORS.map(color => (
                                <button
                                    key={color.name}
                                    onClick={() => handleLabelBackgroundChange(color.bg)}
                                    className={`w-6 h-6 rounded-full border-2 ${color.bg} border-white`}
                                    aria-label={t('labelBackgroundColor', { color: color.name })}
                                />
                            ))}
                        </div>
                    </div>
                )}
            </div>
        )}

         <div className="flex flex-col gap-2 border-t pt-3 mt-3">
            <h2 className="text-md font-semibold text-gray-700">{t('controls')}</h2>
             <div className="grid grid-cols-2 gap-2">
                <button onClick={undo} disabled={!canUndo} className="px-3 py-2 text-sm bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors">{t('undo')}</button>
                <button onClick={redo} disabled={!canRedo} className="px-3 py-2 text-sm bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors">{t('redo')}</button>
            </div>
             <button onClick={bringToFront} disabled={selectedElementIds.length === 0} className="px-3 py-2 text-sm bg-gray-700 text-white rounded-md hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors">{t('bringToFront')}</button>
             <button onClick={sendToBack} disabled={selectedElementIds.length === 0} className="px-3 py-2 text-sm bg-gray-500 text-white rounded-md hover:bg-gray-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors">{t('sendToBack')}</button>
             <button onClick={handleCopySelectionClick} disabled={selectedElementIds.length === 0 && !activeSelectionBounds} className="px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors">{t('copy')}</button>
             <button onClick={deleteElement} disabled={selectedElementIds.length === 0} className="px-3 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors">{t('delete')}</button>
            <button onClick={resetView} className="px-3 py-2 text-sm bg-gray-600 text-white rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50 transition-colors">{t('resetView')}</button>
            <button 
                onClick={() => setIsTrashModalOpen(true)} 
                className="relative mt-2 px-3 py-2 text-sm bg-gray-600 text-white rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50 transition-colors flex items-center justify-center gap-2"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0z"/>
                    <path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4zM2.5 3h11V2h-11z"/>
                </svg>
                <span>{t('trash')}</span>
                {trashedElements.length > 0 && (
                    <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                        {trashedElements.length}
                    </span>
                )}
            </button>
        </div>
      </div>

      <GenerationPanel
          generationItems={generationItems}
          annotationPreview={lastAnnotationPreview}
          onAddToCanvas={addGeneratedImageToCanvas}
          onDelete={handleDeleteGeneratedImage}
          onCancelTask={handleCancelGeneration}
      />
      
      <InfiniteCanvas 
        ref={canvasApiRef}
        elements={elements} 
        selectedElementIds={selectedElementIds}
        onSelectElement={handleSelectElement}
        onMarqueeSelect={handleMarqueeSelect}
        onUpdateElement={updateElements}
        onInteractionEnd={handleInteractionEnd}
        setResetViewCallback={getResetViewCallback} 
        onGenerate={handleGenerate}
        workflowGroups={workflowGroups}
        onCreateGroup={handleCreateGroup}
        onStartGroup={handleStartGroup}
        onUngroup={handleUngroup}
        onUpdateGroupBounds={handleUpdateGroupBounds}
        onSelectionBoundsChange={setActiveSelectionBounds}
        onContextMenu={handleContextMenu}
        onEditDrawing={handleEditDrawing}
        onImageDrop={handleImageDrop}
        onUrlDrop={addIFrame}
        onCanvasDoubleClick={(position) => addNote(position)}
        onTrashElement={handleTrashElement}
      />
      
      {editingDrawing && (
        <DrawingModal 
          element={editingDrawing}
          onSave={handleSaveDrawing}
          onClose={() => setEditingDrawing(null)}
        />
      )}

      {contextMenu && (
        <ContextMenu
          menuData={contextMenu}
          onClose={() => setContextMenu(null)}
          actions={{
            addNote,
            addArrow,
            addLabel,
            addDrawing,
            editDrawing: handleEditDrawing,
            addImage: triggerImageUpload,
            deleteElement,
            bringToFront,
            sendToBack,
            copySelection: handleCopySelectionClick,
            changeColor: handleColorChange,
            downloadImage,
          }}
          canChangeColor={canChangeColor}
          elementType={contextMenuElement?.type || null}
        />
      )}

      {isTrashModalOpen && (
        <TrashModal
            elements={trashedElements}
            onClose={() => setIsTrashModalOpen(false)}
            onRestore={handleRestoreElements}
            onDelete={handlePermanentlyDeleteElements}
        />
      )}

      {isApiConfigOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-[400px] max-w-[90vw]">
            <h2 className="text-xl font-bold text-gray-800 mb-4">{t('apiConfiguration')}</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('apiProvider')}</label>
                <select 
                  value={apiProvider}
                  onChange={(e) => setApiProvider(e.target.value as any)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="server">{t('serverApi')}</option>
                  <option value="gemini-custom">{t('customGeminiApi')}</option>
                  <option value="openai-custom">{t('customOpenAiApi')}</option>
                </select>
              </div>

              {apiProvider === 'server' && (
                <div className={`rounded-lg border p-3 text-sm ${serverAiConfig.configured ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
                  <div className="font-medium text-gray-800">
                    {serverAiConfig.configured ? t('serverAiReady') : t('serverAiNeedsConfig')}
                  </div>
                  <div className="mt-1 text-xs text-gray-600">
                    {t('channel')}: {serverAiConfig.provider || t('unknown')}<br />
                    {t('defaultModel')}: {serverAiConfig.model || t('notSet')}<br />
                    {t('availableModels')}: {serverAiConfig.models.join(', ') || t('none')}
                  </div>
                  <div className="mt-2 text-xs text-gray-500">
                    {t('serverConfigHelp')}
                  </div>
                  {serverAiConfigError && (
                    <div className="mt-2 text-xs text-red-600">{serverAiConfigError}</div>
                  )}
                </div>
              )}

              {apiProvider === 'gemini-custom' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('geminiApiKey')}</label>
                  <input 
                    type="password"
                    value={customGeminiKey}
                    onChange={(e) => setCustomGeminiKey(e.target.value)}
                    placeholder="AIzaSy..."
                    autoComplete="new-password"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              )}

              {apiProvider === 'openai-custom' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('baseUrl')}</label>
                    <input 
                      type="text"
                      value={openaiBaseUrl}
                      onChange={(e) => setOpenaiBaseUrl(e.target.value)}
                      placeholder="https://api.openai.com/v1"
                      autoComplete="off"
                      data-lpignore="true"
                      data-1p-ignore="true"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div className="relative">
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('modelName')}</label>
                    <div className="relative">
                        <input 
                            type="text"
                            value={openaiModel}
                            onChange={(e) => setOpenaiModel(e.target.value)}
                            onFocus={() => setIsModelDropdownOpen(true)}
                            onBlur={handleModelBlur}
                            placeholder="e.g. gpt-4o"
                            autoComplete="off"
                            data-lpignore="true"
                            data-1p-ignore="true"
                            spellCheck="false"
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                        <button 
                            type="button"
                            onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                            className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-500 hover:text-gray-700"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                                <path fillRule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/>
                            </svg>
                        </button>
                    </div>
                    {isModelDropdownOpen && openaiModelsList.length > 0 && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto">
                            {openaiModelsList.map(model => (
                                <div 
                                    key={model} 
                                    className="flex justify-between items-center px-3 py-2 hover:bg-gray-100 cursor-pointer"
                                    onMouseDown={(e) => {
                                        e.preventDefault();
                                        handleModelSelect(model);
                                    }}
                                >
                                    <span className="text-sm text-gray-800">{model}</span>
                                    <button
                                        type="button"
                                        onMouseDown={(e) => handleDeleteModel(e, model)}
                                        className="text-gray-400 hover:text-red-500 p-1 rounded-full hover:bg-gray-200 transition-colors"
                                        title={t('deleteSavedModel')}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
                                            <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
                                        </svg>
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('apiKey')}</label>
                    <input 
                      type="password"
                      value={openaiKey}
                      onChange={(e) => setOpenaiKey(e.target.value)}
                      placeholder="sk-..."
                      autoComplete="new-password"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      type="checkbox"
                      id="openai-stream-toggle"
                      checked={openaiStream}
                      onChange={(e) => setOpenaiStream(e.target.checked)}
                      className="w-4 h-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500"
                    />
                    <label htmlFor="openai-stream-toggle" className="text-sm font-medium text-gray-700">
                      {t('enableStream')}
                    </label>
                  </div>
                </>
              )}
            </div>

            <div className="mt-6 flex justify-end">
              <button 
                onClick={handleCloseApiConfig}
                className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors"
              >
                {t('done')}
              </button>
            </div>
          </div>
        </div>
      )}

    </main>
  );
};

export default App;
