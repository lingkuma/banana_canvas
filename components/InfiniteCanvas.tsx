
import React, { useState, useRef, useCallback, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react';
import type { Point, CanvasElement, Bounds, WorkflowGroup } from '../types';
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
  workflowGroups: WorkflowGroup[];
  onCreateGroup: (bounds: Bounds, inputElementIds: string[]) => void;
  onStartGroup: (groupId: string) => void;
  onUngroup: (groupId: string) => void;
  onUpdateGroupBounds: (groupId: string, bounds: Bounds, dragDelta?: Point) => void;
  onSelectionBoundsChange: (bounds: Bounds | null) => void;
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

type GroupInteractionType = 'move' | 'resize-nw' | 'resize-n' | 'resize-ne' | 'resize-e' | 'resize-se' | 'resize-s' | 'resize-sw' | 'resize-w';

type GroupInteraction = {
  type: GroupInteractionType;
  groupId: string;
  pointerId: number;
  lastPoint: Point;
  currentBounds: Bounds;
} | null;

export interface CanvasApi {
  screenToWorld: (screenPoint: Point) => Point;
}

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;
const MIN_GROUP_WIDTH = 80;
const MIN_GROUP_HEIGHT = 60;
const TAP_MOVE_THRESHOLD = 8;
const DOUBLE_TAP_DELAY = 320;

const resizeGroupBounds = (bounds: Bounds, type: GroupInteractionType, dx: number, dy: number): Bounds => {
  const handle = type.replace('resize-', '');
  let nextX = bounds.x;
  let nextY = bounds.y;
  let nextWidth = bounds.width;
  let nextHeight = bounds.height;

  if (handle.includes('e')) nextWidth += dx;
  if (handle.includes('s')) nextHeight += dy;
  if (handle.includes('w')) {
    nextX += dx;
    nextWidth -= dx;
  }
  if (handle.includes('n')) {
    nextY += dy;
    nextHeight -= dy;
  }

  if (nextWidth < MIN_GROUP_WIDTH) {
    if (handle.includes('w')) nextX = bounds.x + bounds.width - MIN_GROUP_WIDTH;
    nextWidth = MIN_GROUP_WIDTH;
  }
  if (nextHeight < MIN_GROUP_HEIGHT) {
    if (handle.includes('n')) nextY = bounds.y + bounds.height - MIN_GROUP_HEIGHT;
    nextHeight = MIN_GROUP_HEIGHT;
  }

  return {
    x: nextX,
    y: nextY,
    width: nextWidth,
    height: nextHeight,
  };
};

const getGroupResizeHandleStyle = (handle: string): React.CSSProperties => {
  const style: React.CSSProperties = { width: 16, height: 16 };
  if (handle.includes('n')) style.top = -8;
  if (handle.includes('s')) style.bottom = -8;
  if (handle.includes('w')) style.left = -8;
  if (handle.includes('e')) style.right = -8;
  if (handle === 'n' || handle === 's') { style.left = '50%'; style.transform = 'translateX(-50%)'; }
  if (handle === 'w' || handle === 'e') { style.top = '50%'; style.transform = 'translateY(-50%)'; }
  return style;
};

const getGroupResizeHandleCursor = (handle: string): string => {
  switch (handle) {
    case 'n':
    case 's':
      return 'cursor-ns-resize';
    case 'w':
    case 'e':
      return 'cursor-ew-resize';
    case 'nw':
    case 'se':
      return 'cursor-nwse-resize';
    case 'ne':
    case 'sw':
      return 'cursor-nesw-resize';
    default:
      return '';
  }
};

export const InfiniteCanvas = forwardRef<CanvasApi, InfiniteCanvasProps>(({ 
  elements, 
  selectedElementIds, 
  onSelectElement,
  onMarqueeSelect, 
  onUpdateElement, 
  onInteractionEnd,
  setResetViewCallback,
  onGenerate,
  workflowGroups,
  onCreateGroup,
  onStartGroup,
  onUngroup,
  onUpdateGroupBounds,
  onSelectionBoundsChange,
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
  const [selectionBounds, setSelectionBounds] = useState<Bounds | null>(null);
  const [activeGroupInteraction, setActiveGroupInteraction] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);
  const groupInteractionRef = useRef<GroupInteraction>(null);
  const activePointersRef = useRef<Map<number, Point>>(new Map());
  const canvasPointerModeRef = useRef<'mouse-pan' | 'mouse-marquee' | 'touch-pan' | null>(null);
  const touchStartPointRef = useRef<Point | null>(null);
  const lastTouchTapRef = useRef<{ time: number; point: Point } | null>(null);
  const pinchGestureRef = useRef<{
    startDistance: number;
    startZoom: number;
    worldAtMidpoint: Point;
  } | null>(null);
  
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

  const getPointerDistance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
  const getPointerMidpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  const beginPinchGesture = useCallback(() => {
    const points = Array.from(activePointersRef.current.values());
    if (points.length < 2) return;
    const [first, second] = points;
    const midpoint = getPointerMidpoint(first, second);
    pinchGestureRef.current = {
      startDistance: Math.max(1, getPointerDistance(first, second)),
      startZoom: zoom,
      worldAtMidpoint: screenToWorld(midpoint),
    };
  }, [screenToWorld, zoom]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('.transform-handle, .element-body, .generate-btn, .workflow-group')) return;
    canvasRef.current?.setPointerCapture(e.pointerId);

    if (e.pointerType !== 'mouse') {
      e.preventDefault();
      const point = { x: e.clientX, y: e.clientY };
      activePointersRef.current.set(e.pointerId, point);

      if (activePointersRef.current.size >= 2) {
        setIsPanning(false);
        setMarqueeRect(null);
        canvasPointerModeRef.current = null;
        beginPinchGesture();
        return;
      }

      onSelectElement(null, e.shiftKey);
      setSelectionBounds(null);
      touchStartPointRef.current = point;
      canvasPointerModeRef.current = 'touch-pan';
      setIsPanning(true);
      setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      return;
    }

    const isPanTrigger = isSpacebarPressed || e.button === 1;

    if (isPanTrigger) {
        e.preventDefault();
        canvasPointerModeRef.current = 'mouse-pan';
        setIsPanning(true);
        setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    } else if (e.button === 0) {
        canvasPointerModeRef.current = 'mouse-marquee';
        onSelectElement(null, e.shiftKey);
        if (!e.shiftKey) setSelectionBounds(null);
        setMarqueeRect({ start: { x: e.clientX, y: e.clientY }, end: { x: e.clientX, y: e.clientY } });
    }
  }, [beginPinchGesture, isSpacebarPressed, onSelectElement, pan]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') {
      const point = { x: e.clientX, y: e.clientY };
      const touchStartPoint = touchStartPointRef.current;
      const wasTap = activePointersRef.current.size === 1
        && canvasPointerModeRef.current === 'touch-pan'
        && touchStartPoint
        && getPointerDistance(touchStartPoint, point) <= TAP_MOVE_THRESHOLD;

      activePointersRef.current.delete(e.pointerId);
      if (canvasRef.current?.hasPointerCapture(e.pointerId)) {
        canvasRef.current.releasePointerCapture(e.pointerId);
      }

      if (wasTap) {
        const lastTap = lastTouchTapRef.current;
        const now = Date.now();
        if (lastTap && now - lastTap.time <= DOUBLE_TAP_DELAY && getPointerDistance(lastTap.point, point) <= 30) {
          onCanvasDoubleClick(screenToWorld(point));
          lastTouchTapRef.current = null;
        } else {
          lastTouchTapRef.current = { time: now, point };
        }
      }

      if (activePointersRef.current.size === 0) {
        setIsPanning(false);
        pinchGestureRef.current = null;
        touchStartPointRef.current = null;
        canvasPointerModeRef.current = null;
        return;
      }

      if (activePointersRef.current.size === 1) {
        const remainingPoint = Array.from(activePointersRef.current.values())[0];
        pinchGestureRef.current = null;
        touchStartPointRef.current = remainingPoint;
        canvasPointerModeRef.current = 'touch-pan';
        setIsPanning(true);
        setStartPan({ x: remainingPoint.x - pan.x, y: remainingPoint.y - pan.y });
      }
      return;
    }

    setIsPanning(false);
    canvasPointerModeRef.current = null;
    if (marqueeRect) {
        const startWorld = screenToWorld(marqueeRect.start);
        const endWorld = screenToWorld(marqueeRect.end);

        const selectionBox = normalizeBounds(startWorld, endWorld);
        const selectedIds = elements.filter(el => isElementInBounds(el, selectionBox)).map(el => el.id);

        if (selectedIds.length > 0) {
            onMarqueeSelect(selectedIds, e.shiftKey);
        }
        if (selectionBox.width > 4 && selectionBox.height > 4) {
            setSelectionBounds(selectionBox);
        }
        setMarqueeRect(null);
    }
  }, [marqueeRect, screenToWorld, elements, onMarqueeSelect, onCanvasDoubleClick, pan]);

  const handlePointerCancel = useCallback((e: React.PointerEvent) => {
    activePointersRef.current.delete(e.pointerId);
    if (activePointersRef.current.size === 0) {
      setIsPanning(false);
      setMarqueeRect(null);
      pinchGestureRef.current = null;
      touchStartPointRef.current = null;
      canvasPointerModeRef.current = null;
    }
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse') {
      if (!activePointersRef.current.has(e.pointerId)) return;
      e.preventDefault();
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      const points = Array.from(activePointersRef.current.values());
      if (points.length >= 2) {
        if (!pinchGestureRef.current) {
          beginPinchGesture();
          return;
        }

        const [first, second] = points;
        const midpoint = getPointerMidpoint(first, second);
        const nextZoom = Math.max(
          MIN_ZOOM,
          Math.min(MAX_ZOOM, pinchGestureRef.current.startZoom * (getPointerDistance(first, second) / pinchGestureRef.current.startDistance))
        );

        setZoom(nextZoom);
        setPan({
          x: midpoint.x - pinchGestureRef.current.worldAtMidpoint.x * nextZoom,
          y: midpoint.y - pinchGestureRef.current.worldAtMidpoint.y * nextZoom,
        });
        return;
      }

      if (isPanning && canvasPointerModeRef.current === 'touch-pan') {
        setPan({ x: e.clientX - startPan.x, y: e.clientY - startPan.y });
      }
      return;
    }

    if (isPanning) {
      setPan({ x: e.clientX - startPan.x, y: e.clientY - startPan.y });
    } else if (marqueeRect) {
      setMarqueeRect(prev => prev ? { ...prev, end: { x: e.clientX, y: e.clientY } } : null);
    }
  }, [beginPinchGesture, isPanning, startPan, marqueeRect]);

  useEffect(() => {
    if (!activeGroupInteraction) return;

    const handleMove = (e: PointerEvent) => {
      const interaction = groupInteractionRef.current;
      if (!interaction) return;
      if (e.pointerId !== interaction.pointerId) return;

      const dx = (e.clientX - interaction.lastPoint.x) / zoom;
      const dy = (e.clientY - interaction.lastPoint.y) / zoom;
      if (dx === 0 && dy === 0) return;

      const nextBounds = interaction.type === 'move'
        ? {
            ...interaction.currentBounds,
            x: interaction.currentBounds.x + dx,
            y: interaction.currentBounds.y + dy,
          }
        : resizeGroupBounds(interaction.currentBounds, interaction.type, dx, dy);

      groupInteractionRef.current = {
        ...interaction,
        lastPoint: { x: e.clientX, y: e.clientY },
        currentBounds: nextBounds,
      };

      onUpdateGroupBounds(
        interaction.groupId,
        nextBounds,
        interaction.type === 'move' ? { x: dx, y: dy } : undefined
      );
    };

    const handleEnd = () => {
      groupInteractionRef.current = null;
      setActiveGroupInteraction(false);
      onInteractionEnd();
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleEnd);
    window.addEventListener('pointercancel', handleEnd);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleEnd);
      window.removeEventListener('pointercancel', handleEnd);
    };
  }, [activeGroupInteraction, zoom, onUpdateGroupBounds, onInteractionEnd]);

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

  useEffect(() => {
    onSelectionBoundsChange(selectionBounds);
  }, [onSelectionBoundsChange, selectionBounds]);
  
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

  const normalizeBounds = (start: Point, end: Point): Bounds => ({
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(start.x - end.x),
    height: Math.abs(start.y - end.y),
  });

  const boundsToBbox = (bounds: Bounds): BoundingBox => ({
    minX: bounds.x,
    minY: bounds.y,
    maxX: bounds.x + bounds.width,
    maxY: bounds.y + bounds.height,
    width: bounds.width,
    height: bounds.height,
  });

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
  
  const selectionBbox = useMemo((): BoundingBox | null => {
      return selectionBounds ? boundsToBbox(selectionBounds) : null;
  }, [selectionBounds]);
  
  const handleGenerateClick = useCallback(() => {
    const selectedElements = selectionBounds
      ? elements.filter(el => isElementInBounds(el, selectionBounds))
      : elements.filter(el => selectedElementIds.includes(el.id));
    if (selectedElements.length > 0) {
      onGenerate(selectedElements);
    }
  }, [elements, selectedElementIds, selectionBounds, onGenerate]);

  const handleCreateGroupClick = useCallback(() => {
    if (!selectionBounds) return;
    const inputElementIds = elements
      .filter(el => isElementInBounds(el, selectionBounds))
      .map(el => el.id);
    onCreateGroup(selectionBounds, inputElementIds);
    setSelectionBounds(null);
  }, [elements, selectionBounds, onCreateGroup]);

  const sortedElements = [...elements].sort((a, b) => a.zIndex - b.zIndex);
  const elementById = useMemo(() => new Map(elements.map(el => [el.id, el])), [elements]);
  const connectors = workflowGroups
    .map(group => {
      const output = elementById.get(group.outputElementId);
      if (!output) return null;
      return {
        groupId: group.id,
        status: group.status,
        from: { x: group.bounds.x + group.bounds.width, y: group.bounds.y + group.bounds.height / 2 },
        to: { x: output.position.x - output.width / 2, y: output.position.y },
      };
    })
    .filter((connector): connector is NonNullable<typeof connector> => connector !== null);

  const startGroupInteraction = (e: React.PointerEvent, group: WorkflowGroup, type: GroupInteractionType) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setSelectionBounds(null);
    groupInteractionRef.current = {
      type,
      groupId: group.id,
      pointerId: e.pointerId,
      lastPoint: { x: e.clientX, y: e.clientY },
      currentBounds: group.bounds,
    };
    setActiveGroupInteraction(true);
  };

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
        ${cursorClass} [touch-action:none]`}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onPointerLeave={handlePointerUp}
      onPointerMove={handlePointerMove}
      onWheel={handleWheel}
      onContextMenu={handleCanvasContextMenu}
      onDoubleClick={handleCanvasDoubleClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div
        className="transform-gpu select-none [touch-action:none]"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
        }}
      >
        <svg className="absolute overflow-visible pointer-events-none" style={{ left: 0, top: 0, width: 1, height: 1, zIndex: -1000 }}>
          {connectors.map(connector => {
            const midX = (connector.from.x + connector.to.x) / 2;
            const color = connector.status === 'completed'
              ? '#16a34a'
              : connector.status === 'generating' || connector.status === 'waiting'
                ? '#d97706'
                : '#2563eb';
            return (
              <path
                key={connector.groupId}
                d={`M ${connector.from.x} ${connector.from.y} C ${midX} ${connector.from.y}, ${midX} ${connector.to.y}, ${connector.to.x} ${connector.to.y}`}
                fill="none"
                stroke={color}
                strokeWidth={2}
                strokeDasharray={connector.status === 'completed' ? undefined : '8 6'}
              />
            );
          })}
        </svg>
        {workflowGroups.map(group => (
          <div
            key={`${group.id}-border`}
            className="absolute border-2 border-blue-600/70 bg-blue-50/10 pointer-events-none"
            style={{
              left: group.bounds.x,
              top: group.bounds.y,
              width: group.bounds.width,
              height: group.bounds.height,
              zIndex: -999,
            }}
          />
        ))}
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
        {workflowGroups.map(group => (
          <div
            key={`${group.id}-controls`}
            className="workflow-group absolute pointer-events-none"
            style={{
              left: group.bounds.x,
              top: group.bounds.y,
              width: group.bounds.width,
              height: group.bounds.height,
              zIndex: 10000,
            }}
          >
            <div className="absolute -top-8 right-0 flex items-center gap-1 pointer-events-auto">
              <button
                title="Move group"
                className="w-7 h-7 text-xs font-semibold bg-white text-gray-700 border border-gray-300 rounded shadow hover:bg-gray-100 cursor-move flex items-center justify-center"
                onPointerDown={(e) => startGroupInteraction(e, group, 'move')}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
                  <path d="M8 0 5.5 2.5h2v3h-3v-2L2 6l2.5 2.5v-2h3v3h-2L8 12l2.5-2.5h-2v-3h3v2L14 6l-2.5-2.5v2h-3v-3h2z"/>
                </svg>
              </button>
              <button
                className="px-2 py-1 text-[11px] font-semibold bg-green-600 text-white rounded shadow hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-wait"
                onClick={(e) => {
                  e.stopPropagation();
                  onStartGroup(group.id);
                }}
                disabled={group.status === 'generating' || group.status === 'waiting'}
              >
                Start
              </button>
              <button
                className="px-2 py-1 text-[11px] font-semibold bg-white text-gray-700 border border-gray-300 rounded shadow hover:bg-gray-100"
                onClick={(e) => {
                  e.stopPropagation();
                  onUngroup(group.id);
                }}
              >
                Ungroup
              </button>
            </div>
            {(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const).map(handle => (
              <div
                key={handle}
                className={`absolute bg-white border-2 border-blue-600 pointer-events-auto ${getGroupResizeHandleCursor(handle)}`}
                style={getGroupResizeHandleStyle(handle)}
                onPointerDown={(e) => startGroupInteraction(e, group, `resize-${handle}` as GroupInteractionType)}
              />
            ))}
          </div>
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
                Generate
            </button>
            <button
                onClick={handleCreateGroupClick}
                className="ml-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg shadow-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-all transform hover:scale-105"
            >
                Group
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
