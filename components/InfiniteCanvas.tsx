
import React, { useState, useRef, useCallback, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react';
import type { Point, CanvasElement } from '../types';
import { TransformableElement } from './TransformableElement';

interface InfiniteCanvasProps {
  elements: CanvasElement[];
  selectedElementIds: string[];
  onSelectElement: (id: string | null, shiftKey: boolean) => void;
  onMarqueeSelect: (ids: string[], shiftKey: boolean) => void;
  onUpdateElement: (element: CanvasElement, dragDelta?: Point) => void;
  onInteractionEnd: () => void;
  setResetViewCallback: (callback: () => void) => void;
  onGenerate: (selectedElements: CanvasElement[]) => void;
  onContextMenu: (e: React.MouseEvent, worldPoint: Point, elementId: string | null) => void;
  onEditDrawing: (elementId: string) => void;
  onImageDrop: (files: FileList, position: Point) => void;
  onUrlDrop: (url: string, position: Point) => void;
  onCanvasDoubleClick: (position: Point) => void;
  onTrashElement: (elementId: string) => void;
}

interface MarqueeRect {
  start: Point;
  end: Point;
}

interface BoundingBox {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
}

export interface CanvasApi {
  screenToWorld: (screenPoint: Point) => Point;
}

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;

export const InfiniteCanvas = forwardRef<CanvasApi, InfiniteCanvasProps>(({ 
  elements, 
  selectedElementIds, 
  onSelectElement,
  onMarqueeSelect, 
  onUpdateElement, 
  onInteractionEnd,
  setResetViewCallback,
  onGenerate,
  onContextMenu,
  onEditDrawing,
  onImageDrop,
  onUrlDrop,
  onCanvasDoubleClick,
  onTrashElement
}, ref) => {
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState<Point>({ x: 0, y: 0 });
  const [isSpacebarPressed, setIsSpacebarPressed] = useState(false);
  const [marqueeRect, setMarqueeRect] = useState<MarqueeRect | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);
  
  const screenToWorld = useCallback((screenPoint: Point): Point => {
    return {
      x: (screenPoint.x - pan.x) / zoom,
      y: (screenPoint.y - pan.y) / zoom,
    };
  }, [pan, zoom]);

  useImperativeHandle(ref, () => ({
    screenToWorld,
  }), [screenToWorld]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        const target = e.target as HTMLElement;
        if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.isContentEditable) {
            return; // Don't prevent default for text inputs
        }
        e.preventDefault();
        setIsSpacebarPressed(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacebarPressed(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('.transform-handle, .element-body, .generate-btn')) return;

    const isPanTrigger = isSpacebarPressed || e.button === 1;

    if (isPanTrigger) {
        e.preventDefault();
        setIsPanning(true);
        setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    } else if (e.button === 0) { // Only start marquee on left click
        onSelectElement(null, e.shiftKey);
        setMarqueeRect({ start: { x: e.clientX, y: e.clientY }, end: { x: e.clientX, y: e.clientY } });
    }
  }, [isSpacebarPressed, pan, onSelectElement]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    setIsPanning(false);
    if (marqueeRect) {
        const startWorld = screenToWorld(marqueeRect.start);
        const endWorld = screenToWorld(marqueeRect.end);

        const selectionBox = {
            minX: Math.min(startWorld.x, endWorld.x),
            maxX: Math.max(startWorld.x, endWorld.x),
            minY: Math.min(startWorld.y, endWorld.y),
            maxY: Math.max(startWorld.y, endWorld.y),
        };

        const selectedIds = elements.filter(el => 
            el.position.x >= selectionBox.minX &&
            el.position.x <= selectionBox.maxX &&
            el.position.y >= selectionBox.minY &&
            el.position.y <= selectionBox.maxY
        ).map(el => el.id);

        if (selectedIds.length > 0) {
            onMarqueeSelect(selectedIds, e.shiftKey);
        }
        setMarqueeRect(null);
    }
  }, [marqueeRect, screenToWorld, elements, onMarqueeSelect]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (isPanning) {
      setPan({ x: e.clientX - startPan.x, y: e.clientY - startPan.y });
    } else if (marqueeRect) {
      setMarqueeRect(prev => prev ? { ...prev, end: { x: e.clientX, y: e.clientY } } : null);
    }
  }, [isPanning, startPan, marqueeRect]);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const worldX = (mouseX - pan.x) / zoom;
    const worldY = (mouseY - pan.y) / zoom;

    const zoomFactor = 1 - e.deltaY * 0.001;
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * zoomFactor));

    const newPanX = mouseX - worldX * newZoom;
    const newPanY = mouseY - worldY * newZoom;

    setZoom(newZoom);
    setPan({ x: newPanX, y: newPanY });
  }, [pan, zoom]);

  const resetView = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      setPan({ x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 });
    } else {
      setPan({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    }
    setZoom(1);
  }, []);
  
  useEffect(() => {
    resetView();
  }, [resetView]);

  useEffect(() => {
    setResetViewCallback(resetView);
  }, [resetView, setResetViewCallback]);
  
  const getRotatedCorners = (el: CanvasElement): Point[] => {
    const { x, y } = el.position;
    const { width, height, rotation } = el;
    const rad = rotation * (Math.PI / 180);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const halfW = width / 2;
    const halfH = height / 2;

    const corners = [
        { x: -halfW, y: -halfH }, { x: halfW, y: -halfH },
        { x: halfW, y: halfH },   { x: -halfW, y: halfH }
    ];

    return corners.map(corner => ({
        x: x + corner.x * cos - corner.y * sin,
        y: y + corner.x * sin + corner.y * cos,
    }));
  };
  
  const selectionBbox = useMemo((): BoundingBox | null => {
      const selectedElements = elements.filter(el => selectedElementIds.includes(el.id));
      if (selectedElements.length === 0) return null;

      const allCorners = selectedElements.flatMap(getRotatedCorners);

      const minX = Math.min(...allCorners.map(c => c.x));
      const minY = Math.min(...allCorners.map(c => c.y));
      const maxX = Math.max(...allCorners.map(c => c.x));
      const maxY = Math.max(...allCorners.map(c => c.y));
      
      return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  }, [elements, selectedElementIds]);
  
  const handleGenerateClick = useCallback(() => {
    const selectedElements = elements.filter(el => selectedElementIds.includes(el.id));
    if (selectedElements.length > 0) {
      onGenerate(selectedElements);
    }
  }, [elements, selectedElementIds, onGenerate]);

  const sortedElements = [...elements].sort((a, b) => a.zIndex - b.zIndex);

  let cursorClass = 'cursor-default';
  if (isSpacebarPressed || isPanning) {
    cursorClass = isPanning ? 'cursor-grabbing' : 'cursor-grab';
  }
  
  const handleCanvasContextMenu = (e: React.MouseEvent) => {
    const worldPoint = screenToWorld({x: e.clientX, y: e.clientY});
    onContextMenu(e, worldPoint, null);
  }

  const handleCanvasDoubleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement) !== canvasRef.current) return;
      const worldPoint = screenToWorld({ x: e.clientX, y: e.clientY });
      onCanvasDoubleClick(worldPoint);
  }, [screenToWorld, onCanvasDoubleClick]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDraggingOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
      setIsDraggingOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDraggingOver(false);
      
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
          const worldPoint = screenToWorld({ x: e.clientX, y: e.clientY });
          onImageDrop(files, worldPoint);
          return;
      }
      
      const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
      if (url) {
        try {
            new URL(url);
            const worldPoint = screenToWorld({ x: e.clientX, y: e.clientY });
            onUrlDrop(url, worldPoint);
        } catch (_) {
            // Not a valid URL
        }
      }
  }, [screenToWorld, onImageDrop, onUrlDrop]);

  return (
    <div
      ref={canvasRef}
      className={`relative w-full h-full overflow-hidden bg-gray-50 
        bg-[radial-gradient(#d1d5db_1px,transparent_1px)] [background-size:24px_24px]
        ${cursorClass}`}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onMouseMove={handleMouseMove}
      onWheel={handleWheel}
      onContextMenu={handleCanvasContextMenu}
      onDoubleClick={handleCanvasDoubleClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div
        className="transform-gpu select-none"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
        }}
      >
        {sortedElements.map((el) => (
          <TransformableElement
            key={el.id}
            element={el}
            zoom={zoom}
            isSelected={selectedElementIds.includes(el.id)}
            onSelect={onSelectElement}
            onUpdate={onUpdateElement}
            onInteractionEnd={onInteractionEnd}
            onContextMenu={(e) => {
              const worldPoint = screenToWorld({x: e.clientX, y: e.clientY});
              onContextMenu(e, worldPoint, el.id);
            }}
            onEditDrawing={onEditDrawing}
            onTrashElement={onTrashElement}
          />
        ))}
        {selectionBbox && (
             <div className="absolute border-2 border-blue-500/50 border-dashed pointer-events-none"
                style={{
                    left: selectionBbox.minX,
                    top: selectionBbox.minY,
                    width: selectionBbox.width,
                    height: selectionBbox.height
                }}
             />
        )}
      </div>

      {selectionBbox && (
          <div
            className="absolute z-10 generate-btn"
            style={{
                left: (selectionBbox.maxX * zoom + pan.x + 10),
                top: (selectionBbox.maxY * zoom + pan.y + 10),
            }}
          >
             <button 
                onClick={handleGenerateClick}
                className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg shadow-lg hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-50 transition-all transform hover:scale-105 disabled:bg-gray-400 disabled:scale-100 disabled:cursor-wait"
            >
                Generate ✨
            </button>
          </div>
      )}

      {marqueeRect && (
        <div 
          className="absolute border-2 border-dashed border-blue-500 bg-blue-500/10 pointer-events-none"
          style={{
            left: Math.min(marqueeRect.start.x, marqueeRect.end.x),
            top: Math.min(marqueeRect.start.y, marqueeRect.end.y),
            width: Math.abs(marqueeRect.start.x - marqueeRect.end.x),
            height: Math.abs(marqueeRect.start.y - marqueeRect.end.y)
          }}
        />
      )}

      {isDraggingOver && (
          <div className="absolute inset-0 bg-blue-500/10 border-4 border-dashed border-blue-500 pointer-events-none z-50 flex items-center justify-center">
              <div className="text-blue-500 text-2xl font-bold bg-white/80 p-4 rounded-lg shadow-lg">
                  Drop images or URLs to add
              </div>
          </div>
      )}
    </div>
  );
});

InfiniteCanvas.displayName = "InfiniteCanvas";