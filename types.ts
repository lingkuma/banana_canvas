export interface Point {
  x: number;
  y: number;
}

export type ElementType = 'note' | 'image' | 'arrow' | 'drawing' | 'iframe';

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
}

export interface ArrowElement extends BaseElement {
  type: 'arrow';
  start: Point;
  end: Point;
  color: string;
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

export type CanvasElement = NoteElement | ImageElement | ArrowElement | DrawingElement | IFrameElement;