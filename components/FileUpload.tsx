
import React, { useState, useCallback, useRef } from 'react';

interface FileUploadProps {
    onFileUpload: (file: File) => void;
    isLoading: boolean;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onFileUpload, isLoading }) => {
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = (files: FileList | null) => {
        if (files && files.length > 0) {
            const file = files[0];
            if (file.type === 'application/pdf') {
                onFileUpload(file);
            } else {
                alert('Please upload a valid PDF file.');
            }
        }
    };

    const handleDrag = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
    }, []);

    const handleDragIn = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        handleDrag(e);
        if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
            setIsDragging(true);
        }
    }, [handleDrag]);

    const handleDragOut = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        handleDrag(e);
        setIsDragging(false);
    }, [handleDrag]);

    const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        handleDrag(e);
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFileSelect(e.dataTransfer.files);
            e.dataTransfer.clearData();
        }
    }, [handleDrag, onFileUpload]);

    const onButtonClick = () => {
        fileInputRef.current?.click();
    };

    const dragDropClasses = isDragging
        ? 'border-indigo-600 bg-indigo-50'
        : 'border-slate-300 bg-slate-50';
        
    const buttonDisabledClasses = isLoading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-indigo-700';

    return (
        <div className="bg-white p-6 rounded-xl shadow-md">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Upload Paper</h2>
            <div
                className={`flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg transition-colors duration-200 ${dragDropClasses}`}
                onDragEnter={handleDragIn}
                onDragLeave={handleDragOut}
                onDragOver={handleDrag}
                onDrop={handleDrop}
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={(e) => handleFileSelect(e.target.files)}
                    disabled={isLoading}
                />
                <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-slate-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <p className="text-slate-500 text-center mb-4">
                    Drag & drop your PDF here or
                </p>
                <button
                    type="button"
                    onClick={onButtonClick}
                    disabled={isLoading}
                    className={`w-full px-4 py-2 text-white font-semibold bg-indigo-600 rounded-md transition-colors duration-200 ${buttonDisabledClasses}`}
                >
                    {isLoading ? 'Processing...' : 'Upload Research Paper'}
                </button>
            </div>
        </div>
    );
};
