
import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { CanvasElement, Point, ArrowElement } from '../types';

interface TransformableElementProps {
  element: CanvasElement;
  isSelected: boolean;
  zoom: number;
  onSelect: (id: string, shiftKey: boolean) => void;
  onUpdate: (element: CanvasElement, dragDelta?: Point) => void;
  onInteractionEnd: () => void;
  onContextMenu: (e: React.MouseEvent, elementId: string) => void;
  onEditDrawing: (elementId: string) => void;
  onTrashElement: (elementId: string) => void;
}

type InteractionType = 'drag' | 'rotate' | 'resize-arrow-start' | 'resize-arrow-end' |
  'resize-nw' | 'resize-n' | 'resize-ne' | 'resize-e' | 'resize-se' | 'resize-s' | 'resize-sw' | 'resize-w';

type Interaction = {
  type: InteractionType;
  startPoint: Point;
  startElement: CanvasElement;
  startAngle?: number;
  center?: Point;
} | null;

const getResizeHandleStyle = (handle: string): React.CSSProperties => {
  const style: React.CSSProperties = { width: 12, height: 12, zIndex: 10 };
  if (handle.includes('n')) style.top = -6;
  if (handle.includes('s')) style.bottom = -6;
  if (handle.includes('w')) style.left = -6;
  if (handle.includes('e')) style.right = -6;
  if (handle === 'n' || handle === 's') { style.left = '50%'; style.transform = 'translateX(-50%)'; }
  if (handle === 'w' || handle === 'e') { style.top = '50%'; style.transform = 'translateY(-50%)'; }
  return style;
};

const getResizeHandleCursor = (handle: string): string => {
  switch (handle) {
    case 'n': case 's': return 'cursor-ns-resize';
    case 'w': case 'e': return 'cursor-ew-resize';
    case 'nw': case 'se': return 'cursor-nwse-resize';
    case 'ne': case 'sw': return 'cursor-nesw-resize';
    default: return '';
  }
};


export const TransformableElement: React.FC<TransformableElementProps> = ({ element, isSelected, zoom, onSelect, onUpdate, onInteractionEnd, onContextMenu, onEditDrawing, onTrashElement }) => {
  const [interaction, setInteraction] = useState<Interaction>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const elementRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isSelected) {
      setIsEditing(false);
    }
  }, [isSelected]);

  const handleInteractionStart = useCallback((e: React.MouseEvent, type: InteractionType) => {
      if (e.button !== 0) return; // Ignore right/middle clicks
      e.stopPropagation();
      onSelect(element.id, e.shiftKey);

      const startPoint = { x: e.clientX, y: e.clientY };
      let interactionDetails: Interaction = { type, startPoint, startElement: element };

      if (type === 'rotate' && elementRef.current) {
          const rect = elementRef.current.getBoundingClientRect();
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;
          interactionDetails.center = { x: centerX, y: centerY };
          interactionDetails.startAngle = Math.atan2(startPoint.y - centerY, startPoint.x - centerX);
      }
      
      setInteraction(interactionDetails);

    }, [element, onSelect]);
    
    const handleInteractionMove = useCallback((e: MouseEvent) => {
        if (!interaction) return;

        const { type, startPoint, startElement } = interaction;
        const dx = (e.clientX - startPoint.x) / zoom;
        const dy = (e.clientY - startPoint.y) / zoom;

        if (type === 'drag') {
            const newPosition = { x: startElement.position.x + dx, y: startElement.position.y + dy };
            const delta = { x: newPosition.x - element.position.x, y: newPosition.y - element.position.y };
            
            let updatedElement: CanvasElement;

            if (startElement.type === 'arrow') {
                updatedElement = {
                    ...startElement,
                    position: newPosition,
                    start: { x: startElement.start.x + dx, y: startElement.start.y + dy },
                    end: { x: startElement.end.x + dx, y: startElement.end.y + dy },
                };
            } else {
                updatedElement = { ...startElement, position: newPosition };
            }

            onUpdate(updatedElement, delta);
        } else if (type.startsWith('resize') && startElement.type !== 'arrow') {
            const rad = startElement.rotation * (Math.PI / 180);
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);

            const rotDx = dx * cos + dy * sin;
            const rotDy = -dx * sin + dy * cos;

            let { width, height, position } = startElement;
            let { x, y } = position;

            let dw = 0, dh = 0, dpx = 0, dpy = 0; 
            const handle = type.replace('resize-', '');
            
            if (handle.includes('e')) { dw = rotDx; dpx = dw / 2; }
            if (handle.includes('w')) { dw = -rotDx; dpx = -dw / 2; }
            if (handle.includes('s')) { dh = rotDy; dpy = dh / 2; }
            if (handle.includes('n')) { dh = -rotDy; dpy = -dh / 2; }

            const minWidth = element.type === 'iframe' ? 200 : 20;
            const minHeight = element.type === 'iframe' ? 150 : 20;

            const newWidth = Math.max(minWidth, width + dw);
            const newHeight = Math.max(minHeight, height + dh);

            const posDx = dpx * cos - dpy * sin;
            const posDy = dpx * sin + dpy * cos;

            onUpdate({
                ...startElement,
                width: newWidth,
                height: newHeight,
                position: { x: x + posDx, y: y + posDy }
            });

        } else if (type === 'rotate' && interaction.center && interaction.startAngle !== undefined) {
             const { center, startAngle } = interaction;
             const currentAngle = Math.atan2(e.clientY - center.y, e.clientX - center.x);
             const angleDiff = currentAngle - startAngle;
             onUpdate({ ...startElement, rotation: startElement.rotation + angleDiff * (180 / Math.PI) });
        } else if ((type === 'resize-arrow-start' || type === 'resize-arrow-end') && startElement.type === 'arrow') {
            const arrowElement = startElement as ArrowElement;
            let { start, end } = arrowElement;

            if (type === 'resize-arrow-start') {
                start = { x: arrowElement.start.x + dx, y: arrowElement.start.y + dy };
            } else {
                end = { x: arrowElement.end.x + dx, y: arrowElement.end.y + dy };
            }
            
            const newDx = end.x - start.x;
            const newDy = end.y - start.y;
            
            const newWidth = Math.max(10, Math.sqrt(newDx * newDx + newDy * newDy));
            const newRotation = Math.atan2(newDy, newDx) * (180 / Math.PI);
            const newPosition = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };

            onUpdate({
                ...arrowElement,
                start,
                end,
                position: newPosition,
                width: newWidth,
                rotation: newRotation,
            });
        }
    }, [interaction, onUpdate, zoom, element.position.x, element.position.y, element.type]);

    const handleInteractionEnd = useCallback(() => {
        if (interaction) {
          onInteractionEnd();
        }
        setInteraction(null);
    }, [interaction, onInteractionEnd]);

    const handleDoubleClick = useCallback((e: React.MouseEvent) => {
        if (element.type === 'note') {
            e.stopPropagation();
            setIsEditing(true);
            setTimeout(() => {
                textareaRef.current?.focus();
                textareaRef.current?.select();
            }, 0);
        } else if (element.type === 'drawing') {
            e.stopPropagation();
            onEditDrawing(element.id);
        }
    }, [element, onEditDrawing]);
    
    const handleContextMenu = (e: React.MouseEvent) => {
        e.stopPropagation();
        onContextMenu(e, element.id);
    };

    useEffect(() => {
        if (interaction) {
            window.addEventListener('mousemove', handleInteractionMove);
            window.addEventListener('mouseup', handleInteractionEnd);
        }
        return () => {
            window.removeEventListener('mousemove', handleInteractionMove);
            window.removeEventListener('mouseup', handleInteractionEnd);
        };
    }, [interaction, handleInteractionMove, handleInteractionEnd]);
    
    const handleCopyContent = useCallback((e: React.MouseEvent) => {
        if (element.type !== 'iframe') return;
        e.stopPropagation();
        const contentToCopy = `[Web Page Content for AI]\nSource Mode: ${element.sourceMode}\nURL: ${element.url}`;
        navigator.clipboard.writeText(contentToCopy).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }).catch(err => {
            console.error('Failed to copy content: ', err);
            alert('Failed to copy content.');
        });
    }, [element]);

    return (
        <div
            ref={elementRef}
            className="absolute"
            style={{
                left: element.position.x,
                top: element.position.y,
                width: element.width,
                height: element.height,
                transform: `translate(-50%, -50%) rotate(${element.rotation}deg)`,
                cursor: 'move',
                zIndex: element.zIndex
            }}
            onMouseDown={(e) => handleInteractionStart(e, 'drag')}
            onDoubleClick={handleDoubleClick}
            onContextMenu={handleContextMenu}
        >
            <div className="element-body w-full h-full">
              {(() => {
                const el = element;
                const style: React.CSSProperties = {
                    width: '100%',
                    height: '100%',
                };

                switch (el.type) {
                    case 'note':
                        return (
                           <div style={style} className={`rounded-lg shadow-md text-white font-medium flex items-center justify-center ${el.color}`}>
                                <textarea
                                    ref={textareaRef}
                                    value={el.content}
                                    readOnly={!isEditing}
                                    onChange={(e) => onUpdate({ ...el, content: e.target.value })}
                                    onBlur={() => setIsEditing(false)}
                                    onMouseDown={(e) => {
                                      if (e.button !== 0) return;
                                      onSelect(element.id, e.shiftKey);
                                      if (isEditing) {
                                        e.stopPropagation();
                                      }
                                    }}
                                    className={`w-full h-full bg-transparent text-white text-center p-4 resize-none border-none focus:outline-none placeholder-gray-200/70 ${isEditing ? 'cursor-text' : 'cursor-move'}`}
                                    style={{ fontFamily: 'inherit', fontSize: 'inherit' }}
                                    placeholder="Write..."
                                />
                            </div>
                        );
                    case 'image':
                        return (
                            <img src={el.src} alt="User upload" style={style} className="shadow-lg rounded-md object-cover" draggable="false" />
                        );
                    case 'drawing':
                        return (
                            <div style={style} className="bg-white shadow-md rounded-lg flex items-center justify-center border border-gray-200">
                                {el.src ? (
                                    <img src={el.src} alt="User drawing" style={style} className="rounded-lg object-contain" draggable="false" />
                                ) : (
                                    <span className="text-gray-400 p-2 text-center">Double-click to draw</span>
                                )}
                            </div>
                        );
                    case 'iframe':
                        return (
                            <div style={style} className="shadow-lg rounded-md bg-gray-200 flex flex-col overflow-hidden">
                                <div onMouseDown={(e) => { e.stopPropagation(); handleInteractionStart(e, 'drag'); }} className="bg-gray-700 text-white py-1 px-2 rounded-t-md flex items-center gap-2 text-xs cursor-move flex-shrink-0">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" className="opacity-50" viewBox="0 0 16 16"><path d="M16 8.049c0-4.446-3.582-8.05-8-8.05C3.58 0-.002 3.603-.002 8.05c0 4.017 2.926 7.347 6.75 7.951v-5.625h-2.03V8.05H6.75V6.275c0-2.017 1.195-3.131 3.022-3.131.876 0 1.791.157 1.791.157v1.98h-1.009c-.993 0-1.303.621-1.303 1.258v1.51h2.218l-.354 2.326H9.25V16c3.824-.604 6.75-3.934 6.75-7.951"/></svg>
                                    <span className="truncate flex-grow">{el.url}</span>
                                    <button
                                        title={`AI Source: ${el.sourceMode}`}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onUpdate({ ...el, sourceMode: el.sourceMode === 'viewport' ? 'fullpage' : 'viewport' });
                                        }}
                                        className="p-1 rounded hover:bg-gray-600 flex items-center justify-center"
                                    >
                                        {el.sourceMode === 'viewport' 
                                            ? <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 16 16"><path d="M1.5 0A1.5 1.5 0 0 0 0 1.5v7A1.5 1.5 0 0 0 1.5 10H8v2H1.5A1.5 1.5 0 0 0 0 13.5v1A1.5 1.5 0 0 0 1.5 16h13A1.5 1.5 0 0 0 16 14.5v-1A1.5 1.5 0 0 0 14.5 12H8v-2h6.5A1.5 1.5 0 0 0 16 8.5v-7A1.5 1.5 0 0 0 14.5 0zM15 1.5a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-.5.5H1.5a.5.5 0 0 1-.5-.5v-7a.5.5 0 0 1 .5-.5z"/></svg>
                                            : <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 16 16"><path d="M4 0h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2m0 1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1z"/><path d="M4.5 3h7a.5.5 0 0 1 0 1h-7a.5.5 0 0 1 0-1m0 2h7a.5.5 0 0 1 0 1h-7a.5.5 0 0 1 0-1m0 2h7a.5.5 0 0 1 0 1h-7a.5.5 0 0 1 0-1m0 2h7a.5.5 0 0 1 0 1h-7a.5.5 0 0 1 0-1m0 2h7a.5.5 0 0 1 0 1h-7a.5.5 0 0 1 0-1"/></svg>
                                        }
                                    </button>
                                    <button
                                        title={el.isActivated ? "Deactivate for AI" : "Activate for AI"}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onUpdate({ ...el, isActivated: !el.isActivated });
                                        }}
                                        className={`p-1 rounded transition-colors ${el.isActivated ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-500 hover:bg-gray-400'}`}
                                    >
                                       <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 16 16"><path d="M6 .278a.77.77 0 0 1 .08.858 7.2 7.2 0 0 0-.878 3.46c0 4.021 3.278 7.277 7.318 7.277q.792-.001 1.567-.123a.77.77 0 0 1 .81.316.77.77 0 0 1-.031.893A8.7 8.7 0 0 1 8.942 16a8.7 8.7 0 0 1-8.6-9.43L1.24 2.27a.77.77 0 0 1 .632-.676l2.84-1.135a.77.77 0 0 1 .805.106zM8 15A7 7 0 0 0 8 1s1.095 1.248 1.597 2.458A6.9 6.9 0 0 1 8 15"/></svg>
                                    </button>
                                    <button
                                        title="Copy AI Context"
                                        onClick={handleCopyContent}
                                        className="p-1 rounded hover:bg-gray-600"
                                    >
                                        {copied ? (
                                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" className="text-green-400" viewBox="0 0 16 16"><path d="M12.736 3.97a.733.733 0 0 1 1.047 0c.286.289.29.756.01 1.05L7.88 12.01a.733.733 0 0 1-1.065.02L3.217 8.384a.757.757 0 0 1 0-1.06.733.733 0 0 1 1.047 0l3.052 3.093 5.4-6.425z"/></svg>
                                        ) : (
                                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 16 16"><path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1z"/><path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5zM9 1.5H7v1h2z"/></svg>
                                        )}
                                    </button>
                                    <button
                                        title="Close"
                                        onClick={(e) => { e.stopPropagation(); onTrashElement(el.id); }}
                                        className="p-1 rounded hover:bg-red-500"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 16 16"><path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708"/></svg>
                                    </button>
                                </div>
                                <div className="w-full h-full flex-grow bg-white">
                                    <iframe
                                        src={el.url}
                                        className="w-full h-full border-none"
                                        style={{ pointerEvents: interaction ? 'none' : 'auto' }}
                                        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                                        title="Embedded Web Page"
                                    />
                                </div>
                            </div>
                        );
                    case 'arrow':
                        const viewBoxWidth = 150;
                        const viewBoxHeight = 30;
                        return (
                            <div style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center' }} className={el.color}>
                                <svg width="100%" height={viewBoxHeight} viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`} preserveAspectRatio="none" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d={`M0 ${viewBoxHeight / 2} H${viewBoxWidth - 10}`} stroke="currentColor" strokeWidth="4" />
                                    <path d={`M${viewBoxWidth - 20} ${viewBoxHeight / 2 - 10} L${viewBoxWidth - 5} ${viewBoxHeight / 2} L${viewBoxWidth - 20} ${viewBoxHeight / 2 + 10}`} stroke="currentColor" strokeWidth="4" fill="none" />
                                </svg>
                            </div>
                        );
                    default:
                        return null;
                }
              })()}
            </div>

            {isSelected && (
                <>
                    <div className="absolute -inset-1 border-2 border-blue-500 border-dashed rounded-lg pointer-events-none" />
                    
                    {element.type === 'arrow' ? (
                        <>
                            <div className="absolute top-1/2 -left-2 -translate-y-1/2 w-4 h-4 bg-white border-2 border-blue-500 rounded-full cursor-grab transform-handle"
                                onMouseDown={(e) => handleInteractionStart(e, 'resize-arrow-start')} />
                            <div className="absolute top-1/2 -right-2 -translate-y-1/2 w-4 h-4 bg-white border-2 border-blue-500 rounded-full cursor-grab transform-handle"
                                onMouseDown={(e) => handleInteractionStart(e, 'resize-arrow-end')} />
                        </>
                    ) : (
                        <>
                            <div className="absolute -top-8 left-1/2 -translate-x-1/2 w-5 h-5 bg-blue-500 rounded-full cursor-alias transform-handle"
                                onMouseDown={(e) => handleInteractionStart(e, 'rotate')} />
                            <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-0.5 h-3 bg-blue-500 pointer-events-none" />

                            {['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map(handle => (
                                <div
                                    key={handle}
                                    className={`absolute bg-white border-2 border-blue-500 transform-handle ${getResizeHandleCursor(handle)}`}
                                    style={getResizeHandleStyle(handle)}
                                    onMouseDown={(e) => handleInteractionStart(e, `resize-${handle}` as InteractionType)}
                                />
                            ))}
                        </>
                    )}
                </>
            )}
        </div>
    );
};
