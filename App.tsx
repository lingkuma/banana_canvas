
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { GoogleGenAI, Modality } from "@google/genai";
import { InfiniteCanvas, CanvasApi } from './components/InfiniteCanvas';
import { ContextMenu } from './components/ContextMenu';
import { DrawingModal } from './components/DrawingModal';
import { TrashModal } from './components/TrashModal';
import { GenerationPanel } from './components/GenerationPanel';
import type { CanvasElement, NoteElement, ImageElement, ArrowElement, DrawingElement, Point, ElementType, IFrameElement } from './types';
import { useHistoryState } from './useHistoryState';

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

const INITIAL_ELEMENTS: CanvasElement[] = [
  { id: '1', type: 'note', position: { x: 100, y: 100 }, width: 180, height: 100, rotation: 0, zIndex: 1, content: 'Welcome! 👋\nCopyright: Prompt_case', color: 'bg-blue-600' },
  { id: '2', type: 'note', position: { x: 350, y: 250 }, width: 200, height: 100, rotation: -10, zIndex: 2, content: 'Hold [SPACE] or Middle Mouse to Pan', color: 'bg-green-500' },
  { id: '3', type: 'note', position: { x: -50, y: 350 }, width: 220, height: 100, rotation: 5, zIndex: 0, content: 'Right-click for options!\nDouble-click canvas to add a note.', color: 'bg-yellow-500' },
];

interface ContextMenuData {
    x: number;
    y: number;
    worldPoint: Point;
    elementId: string | null;
}

const getRandomPosition = () => ({
  x: Math.floor(Math.random() * 400) - 200,
  y: Math.floor(Math.random() * 400) - 200
});

const App: React.FC = () => {
  const { 
    state: elements, 
    setState: setElements, 
    undo, 
    redo, 
    canUndo, 
    canRedo 
  } = useHistoryState<CanvasElement[]>(INITIAL_ELEMENTS);

  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
  const [resetView, setResetView] = useState<() => void>(() => () => {});
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationHistory, setGenerationHistory] = useState<string[]>([]);
  const [contextMenu, setContextMenu] = useState<ContextMenuData | null>(null);
  const [editingDrawing, setEditingDrawing] = useState<DrawingElement | null>(null);
  const [trashedElements, setTrashedElements] = useState<CanvasElement[]>([]);
  const [isTrashModalOpen, setIsTrashModalOpen] = useState(false);
  
  // Model and API Key State
  const [selectedModel, setSelectedModel] = useState<'gemini-2.5-flash-image' | 'gemini-3-pro-image-preview' | 'gemini-2.0-flash'>('gemini-2.5-flash-image');
  const [aspectRatio, setAspectRatio] = useState<'1:1' | '3:4' | '4:3' | '9:16' | '16:9'>('1:1');
  const [imageResolution, setImageResolution] = useState<'1K' | '2K' | '4K'>('1K');
  const [imageCount, setImageCount] = useState<number>(2);
  const [hasProKey, setHasProKey] = useState(false);

  // Custom API State
  const [apiProvider, setApiProvider] = useState<'default' | 'gemini-custom' | 'openai-custom'>(
    () => (localStorage.getItem('apiProvider') as any) || 'default'
  );
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
  const [openaiModelsList, setOpenaiModelsList] = useState<string[]>(() => {
    const saved = localStorage.getItem('openaiModelsList');
    return saved ? JSON.parse(saved) : ['gpt-4o', 'gpt-4-turbo', 'dall-e-3'];
  });
  const [isApiConfigOpen, setIsApiConfigOpen] = useState(false);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem('apiProvider', apiProvider);
    localStorage.setItem('customGeminiKey', customGeminiKey);
    localStorage.setItem('openaiBaseUrl', openaiBaseUrl);
    localStorage.setItem('openaiModel', openaiModel);
    localStorage.setItem('openaiKey', openaiKey);
    localStorage.setItem('openaiModelsList', JSON.stringify(openaiModelsList));
  }, [apiProvider, customGeminiKey, openaiBaseUrl, openaiModel, openaiKey, openaiModelsList]);

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
  const zIndexCounter = useRef(INITIAL_ELEMENTS.length);
  
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

  const addElement = useCallback((newElement: Omit<NoteElement, 'id' | 'zIndex'> | Omit<ImageElement, 'id' | 'zIndex'> | Omit<ArrowElement, 'id' | 'zIndex'> | Omit<DrawingElement, 'id' | 'zIndex'> | Omit<IFrameElement, 'id' | 'zIndex'>) => {
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
      content: 'New Note',
      color: COLORS[Math.floor(Math.random() * COLORS.length)].bg,
    });
  }, [addElement]);

  const addIFrame = useCallback((url: string, position?: Point) => {
    try {
        new URL(url);
    } catch (_) {
        alert('Invalid URL provided.');
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
  }, [addElement]);
  
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
    const handlePaste = (event: ClipboardEvent) => {
        const items = event.clipboardData?.items;
        if (!items) return;

        const imageFiles = Array.from(items)
            .filter(item => item.kind === 'file' && item.type.startsWith('image/'))
            .map(item => item.getAsFile() as File);
        
        if (imageFiles.length > 0) {
            const position = getCenterOfViewport();
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
                         const position = getCenterOfViewport();
                         addIFrame(pastedString, position);
                         event.preventDefault();
                    } else {
                        throw new Error("Not an embeddable URL");
                    }
                } catch (_) {
                    // Not a valid URL, create a note
                    const position = getCenterOfViewport();
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
  }, [addImagesAtPosition, getCenterOfViewport, addIFrame, addElement]);
  
 const handleGenerate = useCallback(async (selectedElements: CanvasElement[]) => {
      const imageElements = selectedElements.filter(el => el.type === 'image' || el.type === 'drawing') as (ImageElement | DrawingElement)[];
      const noteElements = selectedElements.filter(el => el.type === 'note') as NoteElement[];
      const activeIframeElements = elements.filter(el => el.type === 'iframe' && el.isActivated) as IFrameElement[];

      if (imageElements.length === 0 && noteElements.length === 0 && activeIframeElements.length === 0) {
          alert("Please select at least one element or activate a web page to provide context for generation.");
          return;
      }

      setIsGenerating(true);

      try {
        let instructions = noteElements.map(note => note.content).join(' \n');

        if (activeIframeElements.length > 0) {
            const iframeContext = activeIframeElements.map(iframe => 
                `Analyze the content of the web page at this URL: ${iframe.url}. The user is interested in the ${iframe.sourceMode === 'viewport' ? 'currently visible content' : 'entire page content'}.`
            ).join('\n');
            instructions += `\n\n[Web Page Context]\n${iframeContext}\n(Note: You cannot access the web page directly, but use the URL and user's intent to inform the generation.)`;
        }

        if (apiProvider === 'openai-custom') {
            if (!openaiKey) {
                alert("OpenAI API key not available.");
                setIsGenerating(false);
                return;
            }

            const messages: any[] = [];
            if (imageElements.length > 0) {
                const content: any[] = [
                    { type: "text", text: `Using the provided image(s) as a base, follow these instructions: "${instructions}". If no specific instructions are given, creatively reimagine and enhance the image(s).` }
                ];
                imageElements.filter(el => el.src).forEach(el => {
                    content.push({
                        type: "image_url",
                        image_url: { url: el.src }
                    });
                });
                messages.push({ role: "user", content });
            } else {
                messages.push({ role: "user", content: `Generate a completely new image based on this description: "${instructions}"` });
            }

            let openaiSize = "1024x1024";
            if (imageResolution === '2K') openaiSize = "2048x2048";
            if (imageResolution === '4K') openaiSize = "4096x4096";

            const generateSingleImageOpenAI = async () => {
                const response = await fetch(`${openaiBaseUrl.replace(/\/$/, '')}/chat/completions`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${openaiKey}`
                    },
                    body: JSON.stringify({
                        model: openaiModel,
                        messages: messages,
                        size: openaiSize,
                        n: 1, // Explicitly request 1 image per call to handle custom endpoints better
                    })
                });
                if (!response.ok) {
                    throw new Error(`OpenAI API error: ${response.statusText}`);
                }
                const data = await response.json();
                
                const formatBase64 = (b64: string) => b64.startsWith('data:') ? b64 : `data:image/jpeg;base64,${b64}`;

                // 1. Check data.data[0].b64_json
                if (data.data?.[0]?.b64_json) {
                    return formatBase64(data.data[0].b64_json);
                }
                
                // 2. Check data.data[0].url
                if (data.data?.[0]?.url) {
                    return data.data[0].url;
                }

                if (data.choices?.[0]?.message) {
                    const message = data.choices[0].message;

                    // 3. Check choices[0].message.image.data
                    if (message.image?.data) {
                        return formatBase64(message.image.data);
                    }

                    // 4. Check choices[0].message.content.image.data (if content is an object)
                    if (message.content?.image?.data) {
                        return formatBase64(message.content.image.data);
                    }

                    // 5. Check choices[0].message.content as string (markdown or raw URL)
                    if (typeof message.content === 'string') {
                        const match = message.content.match(/!\[.*?\]\((.*?)\)/);
                        if (match) {
                            return match[1];
                        }
                        if (message.content.startsWith('http') || message.content.startsWith('data:image')) {
                            return message.content;
                        }
                    }
                }
                
                // Fallback
                return null;
            };

            const promises = Array.from({ length: imageCount }, () => generateSingleImageOpenAI());
            const images = await Promise.all(promises);
            const validImages = images.filter((img): img is string => img !== null);
            if (validImages.length > 0) {
                setGenerationHistory(prev => [...validImages, ...prev]);
            } else {
                alert("Failed to parse image URL from OpenAI response.");
            }

        } else {
            // Default or Custom Gemini
            const apiKey = apiProvider === 'gemini-custom' ? customGeminiKey : process.env.API_KEY;
            if (!apiKey) {
                alert("Gemini API key not available.");
                setIsGenerating(false);
                return;
            }
            const genAI = new GoogleGenAI({ apiKey });

            const commonConfig = {
                responseModalities: [Modality.IMAGE, Modality.TEXT],
                imageConfig: {
                    aspectRatio: aspectRatio,
                    imageSize: imageResolution
                }
            };

            if (imageElements.length > 0) { // Editing/Reimagining with existing images
                const imageParts = imageElements.filter(el => el.src).map(el => {
                    const [header, data] = el.src.split(',');
                    const mimeType = header.match(/data:(.*);base64/)?.[1] || 'image/png';
                    return { inlineData: { data, mimeType } };
                });

                const promptText = `Using the provided image(s) as a base, follow these instructions: "${instructions}". If no specific instructions are given, creatively reimagine and enhance the image(s).`;
                const parts = [...imageParts, { text: promptText }];
                
                const generateSingleImage = async () => {
                  const response = await genAI.models.generateContent({
                      model: selectedModel,
                      contents: { parts },
                      config: commonConfig,
                  });
                  for (const part of response.candidates[0].content.parts) {
                      if (part.inlineData) {
                          return `data:image/png;base64,${part.inlineData.data}`;
                      }
                  }
                  return null;
                };

                const promises = Array.from({ length: imageCount }, () => generateSingleImage());
                const images = await Promise.all(promises);
                const validImages = images.filter((img): img is string => img !== null);
                if (validImages.length > 0) {
                    setGenerationHistory(prev => [...validImages, ...prev]);
                }

            } else { // Generating new image from text description
                const promptText = `Generate a completely new image based on this description: "${instructions}"`;

                const generateSingleImage = async () => {
                    const response = await genAI.models.generateContent({
                        model: selectedModel,
                        contents: { parts: [{ text: promptText }] },
                        config: commonConfig,
                    });
                    for (const part of response.candidates[0].content.parts) {
                        if (part.inlineData) {
                            return `data:image/png;base64,${part.inlineData.data}`;
                        }
                    }
                    return null;
                };

                const promises = Array.from({ length: imageCount }, () => generateSingleImage());
                const images = await Promise.all(promises);
                const validImages = images.filter((img): img is string => img !== null);
                if (validImages.length > 0) {
                    setGenerationHistory(prev => [...validImages, ...prev]);
                }
            }
        }
      } catch (error: any) {
        console.error("Error generating image:", error);
        if (error?.message?.includes("Requested entity was not found.")) {
            alert("Model access error. Please ensure you have a valid paid project API key selected.");
            setHasProKey(false);
        } else {
            alert("Failed to generate image. Please check the console for details.");
        }
      } finally {
        setIsGenerating(false);
      }
  }, [elements, selectedModel, aspectRatio, imageResolution, imageCount, apiProvider, customGeminiKey, openaiBaseUrl, openaiModel, openaiKey]);


  const handleSelectElement = useCallback((id: string | null, shiftKey: boolean) => {
    if (contextMenu) setContextMenu(null);

    if (id === null) {
      if (!shiftKey) setSelectedElementIds([]);
      return;
    }
    
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
  const canChangeColor = selectedElements.some(el => el.type === 'note' || el.type === 'arrow');

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
  
  const handleDeleteGeneratedImage = (indexToDelete: number) => {
      setGenerationHistory(prev => prev.filter((_, index) => index !== indexToDelete));
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

  const handleContextMenu = useCallback((e: React.MouseEvent, worldPoint: Point, elementId: string | null) => {
      e.preventDefault();
      
      if (elementId && !selectedElementIds.includes(elementId)) {
        handleSelectElement(elementId, false);
      }
      
      setContextMenu({ x: e.clientX, y: e.clientY, worldPoint, elementId });
  }, [selectedElementIds, handleSelectElement]);

  const contextMenuElement = contextMenu?.elementId ? elements.find(el => el.id === contextMenu.elementId) : null;

  return (
    <main className="relative w-screen h-screen bg-gray-100 font-sans" onClick={() => setContextMenu(null)}>
      <div className="absolute top-4 left-4 z-20 p-4 bg-white/80 backdrop-blur-sm rounded-lg shadow-lg border border-gray-200 w-64 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Banana Canvas</h1>
          <p className="text-sm text-gray-600 mt-1">Ver 3.0 • Creative Space</p>
          <button 
            onClick={() => setIsApiConfigOpen(true)}
            className="mt-2 w-full px-2 py-1.5 text-xs bg-gray-100 text-gray-700 rounded border border-gray-200 hover:bg-gray-200 transition-colors flex items-center justify-center gap-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            API Configuration
          </button>
        </div>

        {/* Model Selection */}
        <div className="flex flex-col gap-2 p-3 bg-gray-50 rounded-lg border border-gray-100">
            <h2 className="text-sm font-bold text-gray-700 mb-1">AI Model</h2>
            {apiProvider === 'openai-custom' ? (
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
                                        Pro Key Connected
                                        <button onClick={handleOpenKeySelector} className="ml-auto text-blue-500 hover:underline">Switch</button>
                                    </div>
                                ) : (
                                    <button 
                                        onClick={handleOpenKeySelector}
                                        className="w-full px-3 py-1.5 text-xs bg-amber-500 text-white rounded-md hover:bg-amber-600 transition-colors flex items-center justify-center gap-1"
                                    >
                                        <span>🔑 Connect Pro Key</span>
                                    </button>
                                )}
                                <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="text-[10px] text-gray-400 mt-1 block hover:underline text-center">Billing Info</a>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Resolution Selector - Now available for all models */}
            <div className="mt-2">
                 <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-semibold text-gray-600">Resolution</span>
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
            <h2 className="text-sm font-bold text-gray-700 mb-1">Aspect Ratio</h2>
            <div className="grid grid-cols-3 gap-1">
                {['1:1', '3:4', '4:3', '9:16', '16:9'].map(ratio => (
                    <button 
                        key={ratio}
                        onClick={() => setAspectRatio(ratio as any)}
                        className={`px-2 py-1.5 text-xs rounded-md border transition-all ${aspectRatio === ratio ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'}`}
                    >
                        {ratio}
                    </button>
                ))}
            </div>

            {/* Image Count Selection */}
            <div className="mt-2">
                <h2 className="text-sm font-bold text-gray-700 mb-1">Number of Images</h2>
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
            <button onClick={() => addNote()} className="px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-colors">Add Note</button>
            <button onClick={() => addArrow()} className="px-3 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50 transition-colors">Add Arrow</button>
            <button onClick={() => addDrawing()} className="px-3 py-2 text-sm bg-purple-600 text-white rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-50 transition-colors">Add Drawing</button>
            <button onClick={() => {
                const url = prompt("Enter a web page URL to embed:", "https://");
                if (url) addIFrame(url);
              }} className="px-3 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-50 transition-colors">Add Web Page</button>
            <label className="cursor-pointer px-3 py-2 text-sm text-center bg-orange-500 text-white rounded-md hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-opacity-50 transition-colors col-span-2">
                Add Image(s)
                <input type="file" accept="image/*" ref={imageInputRef} className="hidden" onChange={handleImageUpload} multiple />
            </label>
        </div>

        {selectedElementIds.length > 0 && canChangeColor && (
            <div className="border-t pt-3 mt-1">
                <h2 className="text-md font-semibold text-gray-700 mb-2">Color</h2>
                <div className="grid grid-cols-8 gap-1.5">
                    {COLORS.map(color => {
                        const isNoteSelected = selectedElements.some(el => el.type === 'note');
                        const finalColor = color.bg;
                        return (
                            <button
                                key={color.name}
                                onClick={() => handleColorChange(finalColor)}
                                className={`w-6 h-6 rounded-full border-2 ${color.bg} border-white`}
                                aria-label={`Change color to ${color.name}`}
                            />
                        )
                    })}
                </div>
            </div>
        )}

         <div className="flex flex-col gap-2 border-t pt-3 mt-3">
            <h2 className="text-md font-semibold text-gray-700">Controls</h2>
             <div className="grid grid-cols-2 gap-2">
                <button onClick={undo} disabled={!canUndo} className="px-3 py-2 text-sm bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors">Undo</button>
                <button onClick={redo} disabled={!canRedo} className="px-3 py-2 text-sm bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors">Redo</button>
            </div>
             <button onClick={bringToFront} disabled={selectedElementIds.length === 0} className="px-3 py-2 text-sm bg-gray-700 text-white rounded-md hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors">↑ Bring to Front</button>
             <button onClick={sendToBack} disabled={selectedElementIds.length === 0} className="px-3 py-2 text-sm bg-gray-500 text-white rounded-md hover:bg-gray-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors">↓ Send to Back</button>
             <button onClick={deleteElement} disabled={selectedElementIds.length === 0} className="px-3 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors">Delete</button>
            <button onClick={resetView} className="px-3 py-2 text-sm bg-gray-600 text-white rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50 transition-colors">Reset View</button>
            <button 
                onClick={() => setIsTrashModalOpen(true)} 
                className="relative mt-2 px-3 py-2 text-sm bg-gray-600 text-white rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50 transition-colors flex items-center justify-center gap-2"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0z"/>
                    <path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4zM2.5 3h11V2h-11z"/>
                </svg>
                <span>Trash</span>
                {trashedElements.length > 0 && (
                    <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                        {trashedElements.length}
                    </span>
                )}
            </button>
        </div>
      </div>

      <GenerationPanel
          isGenerating={isGenerating}
          images={generationHistory}
          onAddToCanvas={addGeneratedImageToCanvas}
          onDelete={handleDeleteGeneratedImage}
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
            addDrawing,
            editDrawing: handleEditDrawing,
            addImage: triggerImageUpload,
            deleteElement,
            bringToFront,
            sendToBack,
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
            <h2 className="text-xl font-bold text-gray-800 mb-4">API Configuration</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">API Provider</label>
                <select 
                  value={apiProvider}
                  onChange={(e) => setApiProvider(e.target.value as any)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="default">Built-in API (Default)</option>
                  <option value="gemini-custom">Custom Gemini API</option>
                  <option value="openai-custom">Custom OpenAI API</option>
                </select>
              </div>

              {apiProvider === 'gemini-custom' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Gemini API Key</label>
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">Base URL</label>
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">Model Name</label>
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
                                        title="Delete saved model"
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
                    <input 
                      type="password"
                      value={openaiKey}
                      onChange={(e) => setOpenaiKey(e.target.value)}
                      placeholder="sk-..."
                      autoComplete="new-password"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="mt-6 flex justify-end">
              <button 
                onClick={handleCloseApiConfig}
                className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

    </main>
  );
};

export default App;
