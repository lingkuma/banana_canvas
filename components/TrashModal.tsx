
import React, { useState, useMemo } from 'react';
import type { CanvasElement } from '../types';

interface ElementPreviewProps {
    element: CanvasElement;
    isSelected: boolean;
    onSelect: () => void;
}

const ElementPreview: React.FC<ElementPreviewProps> = ({ element, isSelected, onSelect }) => {
    const baseClasses = "relative w-full h-32 rounded-lg border-2 cursor-pointer transition-all duration-150 flex items-center justify-center p-2 overflow-hidden bg-white";
    const selectedClasses = "border-blue-500 ring-2 ring-blue-500 ring-offset-2";
    const unselectedClasses = "border-gray-300 hover:border-blue-400";

    const renderContent = () => {
        switch (element.type) {
            case 'note':
                return <div className={`w-full h-full rounded-md ${element.color} p-2 text-white text-xs overflow-hidden text-ellipsis`}>{element.content}</div>;
            case 'image':
            case 'drawing':
                return <img src={element.src} alt={element.type} className="max-w-full max-h-full object-contain" />;
            case 'arrow':
                return <div className={`text-3xl ${element.color}`}>&rarr;</div>
            case 'iframe':
                 return (
                    <div className="w-full h-full flex flex-col items-center justify-center text-gray-500 gap-1">
                         <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 16 16"><path d="M16 8.049c0-4.446-3.582-8.05-8-8.05C3.58 0-.002 3.603-.002 8.05c0 4.017 2.926 7.347 6.75 7.951v-5.625h-2.03V8.05H6.75V6.275c0-2.017 1.195-3.131 3.022-3.131.876 0 1.791.157 1.791.157v1.98h-1.009c-.993 0-1.303.621-1.303 1.258v1.51h2.218l-.354 2.326H9.25V16c3.824-.604 6.75-3.934 6.75-7.951"/></svg>
                        <p className="text-xs text-center break-all">{element.url}</p>
                    </div>
                );
            default:
                return <div className="text-gray-400 text-sm">Unknown Element</div>;
        }
    };

    return (
        <div onClick={onSelect} className={`${baseClasses} ${isSelected ? selectedClasses : unselectedClasses}`}>
            {renderContent()}
        </div>
    );
};


interface TrashModalProps {
    elements: CanvasElement[];
    onClose: () => void;
    onRestore: (ids: string[]) => void;
    onDelete: (ids: string[]) => void;
}

export const TrashModal: React.FC<TrashModalProps> = ({ elements, onClose, onRestore, onDelete }) => {
    const [selectedIds, setSelectedIds] = useState<string[]>([]);

    const handleSelect = (id: string) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const handleRestore = () => {
        onRestore(selectedIds);
        setSelectedIds([]);
    };

    const handleDelete = () => {
        onDelete(selectedIds);
        setSelectedIds([]);
    };
    
    const handleEmptyTrash = () => {
        if (window.confirm(`Are you sure you want to permanently delete all ${elements.length} items? This action cannot be undone.`)) {
            onDelete(elements.map(el => el.id));
            setSelectedIds([]);
        }
    };
    
    const sortedElements = useMemo(() => [...elements].reverse(), [elements]);

    return (
        <div className="absolute inset-0 z-40 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-lg flex-shrink-0">
                    <h2 className="text-xl font-bold text-gray-800">Trash ({elements.length})</h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-800 text-2xl leading-none">&times;</button>
                </div>

                <div className="flex-grow p-4 bg-gray-100 overflow-y-auto">
                    {sortedElements.length > 0 ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                            {sortedElements.map(el => (
                                <ElementPreview
                                    key={el.id}
                                    element={el}
                                    isSelected={selectedIds.includes(el.id)}
                                    onSelect={() => handleSelect(el.id)}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-gray-500">
                             <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" fill="currentColor" className="mb-4 opacity-50" viewBox="0 0 16 16">
                                <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0z"/>
                                <path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4zM2.5 3h11V2h-11z"/>
                            </svg>
                            <p className="text-lg font-semibold">Trash is empty</p>
                        </div>
                    )}
                </div>

                <div className="p-4 border-t flex justify-between items-center bg-gray-50 rounded-b-lg flex-shrink-0">
                    <div className="text-sm text-gray-600">
                       {selectedIds.length > 0 ? `${selectedIds.length} item(s) selected` : 'Select items to restore or delete'}
                    </div>
                    <div className="flex gap-2">
                        <button onClick={handleRestore} disabled={selectedIds.length === 0} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed">Restore</button>
                        <button onClick={handleDelete} disabled={selectedIds.length === 0} className="px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed">Delete Permanently</button>
                        <button onClick={handleEmptyTrash} disabled={elements.length === 0} className="px-4 py-2 text-sm bg-gray-700 text-white rounded-md hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed">Empty Trash</button>
                    </div>
                </div>
            </div>
        </div>
    );
};