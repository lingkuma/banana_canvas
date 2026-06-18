export interface Point {
  x: number;
  y: number;
}

export type ElementType = 'note' | 'image' | 'arrow' | 'label' | 'drawing' | 'iframe';

interface BaseElement {
  id: string;
  position: Point;
  width: number;
  height: number;
  rotation: number; // in degrees
  zIndex: number;
}

export interface NoteElement extends BaseElement {
  type: 'note';
  content: string;
  color: string;
}

export interface ImageElement extends BaseElement {
  type: 'image';
  src: string;
  isWorkflowOutput?: boolean;
  workflowGroupId?: string;
  workflowStatus?: 'idle' | 'generating' | 'completed' | 'failed';
}

export interface ArrowElement extends BaseElement {
  type: 'arrow';
  start: Point;
  end: Point;
  color: string;
}

export interface LabelElement extends BaseElement {
  type: 'label';
  content: string;
  textColor: string;
  backgroundColor: string;
  fontSize: number;
}

export interface DrawingElement extends BaseElement {
  type: 'drawing';
  src: string; // base64 data URL
}

export interface IFrameElement extends BaseElement {
  type: 'iframe';
  url: string;
  isActivated: boolean;
  sourceMode: 'viewport' | 'fullpage';
}

export type CanvasElement = NoteElement | ImageElement | ArrowElement | LabelElement | DrawingElement | IFrameElement;

export type GenerationStatus = 'generating' | 'completed' | 'failed';

export interface GenerationItem {
  id: string;
  status: GenerationStatus;
  images: string[];
  requestedCount: number;
  createdAt: number;
  error?: string;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type WorkflowGroupStatus = 'idle' | 'waiting' | 'generating' | 'completed' | 'failed';

export interface WorkflowGroup {
  id: string;
  bounds: Bounds;
  inputElementIds: string[];
  outputElementId: string;
  status: WorkflowGroupStatus;
  error?: string;
}
