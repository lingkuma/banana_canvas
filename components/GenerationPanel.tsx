import React, { useState } from 'react';
import type { GenerationItem } from '../types';

interface GenerationPanelProps {
    generationItems: GenerationItem[];
    annotationPreview: string | null;
    onAddToCanvas: (imageUrl: string) => void;
    onDelete: (taskId: string, imageIndex: number) => void;
    onCancelTask: (taskId: string) => void;
}

export const GenerationPanel: React.FC<GenerationPanelProps> = ({ generationItems, annotationPreview, onAddToCanvas, onDelete, onCancelTask }) => {
    const [isOpen, setIsOpen] = useState(() => (
        typeof window === 'undefined' ? true : window.matchMedia('(min-width: 768px)').matches
    ));

    return (
        <>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`fixed md:absolute right-3 top-3 z-30 md:z-20 bg-white/90 md:bg-white/80 backdrop-blur-sm inline-flex h-11 md:h-auto items-center gap-2 px-3 md:px-2 py-2 rounded-lg md:rounded-l-lg shadow-lg border border-gray-200 md:border-y md:border-l md:border-r-0 text-sm font-semibold text-gray-700 transition-all duration-300 md:top-1/2 md:-translate-y-1/2 ${isOpen ? 'md:right-80' : 'md:right-0'}`}
                aria-label={isOpen ? 'Close generation panel' : 'Open generation panel'}
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} viewBox="0 0 16 16">
                    <path fillRule="evenodd" d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z" />
                </svg>
                History
            </button>
            <div
                className={`fixed md:absolute right-0 bottom-0 md:top-0 h-[70dvh] md:h-full z-20 p-4 bg-white/90 md:bg-white/80 backdrop-blur-sm shadow-lg border-t md:border-t-0 md:border-l border-gray-200 rounded-t-2xl md:rounded-none w-full md:w-80 flex flex-col gap-4 transition-transform duration-300 overscroll-contain ${isOpen ? 'translate-y-0 md:translate-x-0' : 'translate-y-full md:translate-y-0 md:translate-x-full'}`}
            >
                <div>
                    <h1 className="text-xl font-bold text-gray-800">Generation History</h1>
                    <p className="text-sm text-gray-600 mt-1">Tasks and generated images appear here.</p>
                </div>

                <div className="flex-grow overflow-y-auto pr-2 -mr-2 space-y-4">
                    {annotationPreview && (
                        <div className="border rounded-lg p-2 bg-gray-100/50 shadow-sm">
                            <div className="text-xs font-semibold text-gray-600 mb-2">Latest annotation attachment</div>
                            <img src={annotationPreview} alt="Latest annotation attachment" className="w-full h-auto object-contain rounded-md" />
                        </div>
                    )}

                    {generationItems.length === 0 && (
                         <div className="flex flex-col items-center justify-center text-gray-500 p-4 h-full text-center">
                             <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" fill="currentColor" className="opacity-50 mb-4" viewBox="0 0 16 16">
                                <path d="M6.002 5.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0"/>
                                <path d="M2.002 1a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V3a2 2 0 0 0-2-2h-12zm12 1a1 1 0 0 1 1 1v6.5l-3.777-1.947a.5.5 0 0 0-.577.093l-3.71 3.71-2.66-1.772a.5.5 0 0 0-.63.062L1.002 12V3a1 1 0 0 1 1-1h12"/>
                             </svg>
                            <p>Select elements on the canvas and click "Generate" to create images.</p>
                        </div>
                    )}

                    {generationItems.map(item => (
                        <div key={item.id} className="border rounded-lg p-2 flex flex-col gap-2 bg-gray-100/50 shadow-sm">
                            <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                    <div className="text-sm font-semibold text-gray-800 truncate">
                                        {item.status === 'generating' ? 'Generating' : item.status === 'failed' ? 'Failed' : 'Completed'}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                        {item.images.length > 0 ? `${item.images.length} image(s)` : `${item.requestedCount} request(s)`}
                                    </div>
                                </div>
                                {item.status === 'generating' && (
                                    <button
                                        onClick={() => onCancelTask(item.id)}
                                        className="px-2 py-1 text-xs rounded-md border border-red-300 text-red-700 bg-white hover:bg-red-50"
                                    >
                                        Cancel
                                    </button>
                                )}
                            </div>

                            {item.status === 'generating' && (
                                <div className="flex flex-col items-center justify-center text-gray-700 p-4 border border-dashed rounded-lg bg-white/60">
                                    <svg className="animate-spin h-8 w-8 text-purple-600 mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    <p className="text-sm font-semibold">Generating...</p>
                                    <p className="text-xs text-gray-500">This task can run alongside others.</p>
                                </div>
                            )}

                            {item.status === 'failed' && item.error && (
                                <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md p-2">
                                    {item.error}
                                </div>
                            )}

                            {item.images.map((imgSrc, index) => (
                                <div key={`${item.id}-${index}`} className="group relative border rounded-lg p-2 flex flex-col gap-2 bg-white shadow-sm">
                                    <img src={imgSrc} alt={`Generated by AI ${index + 1}`} className="w-full h-auto object-contain rounded-md" />
                                    <button
                                        onClick={() => onAddToCanvas(imgSrc)}
                                        className="w-full mt-1 px-3 py-1.5 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50 transition-colors"
                                    >
                                        Add to Canvas
                                    </button>
                                    <button
                                        onClick={() => onDelete(item.id, index)}
                                        className="absolute top-1 right-1 bg-black/50 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                                        aria-label="Delete image"
                                    >
                                        &times;
                                    </button>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            </div>
        </>
    );
};
