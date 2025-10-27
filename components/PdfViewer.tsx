import React, { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react';

declare const pdfjsLib: any;

interface PdfViewerProps {
    pdfUrl: string;
    onTextSelect: (text: string, rect: DOMRect | null) => void;
    onAreaSelect: (imageData: string, rect: DOMRect) => void;
}

export interface PdfViewerRef {
    clearSelection: () => void;
}

interface SelectionRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

const LoadingState: React.FC = () => (
    <div className="flex items-center justify-center h-full text-slate-500">
        <svg className="animate-spin h-8 w-8 text-slate-500 mr-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span>Loading PDF...</span>
    </div>
);

const ErrorState: React.FC<{ message: string }> = ({ message }) => (
    <div className="flex flex-col items-center justify-center h-full text-red-500 p-4">
        <p className="font-semibold">Failed to load PDF</p>
        <p className="text-sm text-center">{message}</p>
    </div>
);

export const PdfViewer = forwardRef<PdfViewerRef, PdfViewerProps>(({ pdfUrl, onTextSelect, onAreaSelect }, ref) => {
    const viewerRef = useRef<HTMLDivElement>(null);
    const [pdfDoc, setPdfDoc] = useState<any>(null);
    const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
    const [errorMessage, setErrorMessage] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [zoom, setZoom] = useState(1.2);

    const [isSelectingArea, setIsSelectingArea] = useState(false);
    const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null);
    const selectionStartPoint = useRef<{ x: number, y: number }>({ x: 0, y: 0 });

    useImperativeHandle(ref, () => ({
        clearSelection: () => {
            setSelectionRect(null);
        }
    }));

    const renderPdf = useCallback(async () => {
        if (!pdfDoc || !viewerRef.current) return;

        const container = viewerRef.current;
        container.innerHTML = ''; // Clear previous renders

        for (let i = 1; i <= pdfDoc.numPages; i++) {
            const page = await pdfDoc.getPage(i);
            const viewport = page.getViewport({ scale: zoom });

            const pageDiv = document.createElement('div');
            pageDiv.className = "mb-4 bg-white shadow-md relative";
            pageDiv.style.width = `${viewport.width}px`;
            pageDiv.style.height = `${viewport.height}px`;

            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            if (!context) continue;

            const outputScale = window.devicePixelRatio || 1;
            canvas.width = Math.floor(viewport.width * outputScale);
            canvas.height = Math.floor(viewport.height * outputScale);
            canvas.style.width = `${viewport.width}px`;
            canvas.style.height = `${viewport.height}px`;
            canvas.setAttribute('data-page-number', String(i));
            
            const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;

            const renderContext = {
                canvasContext: context,
                transform: transform,
                viewport: viewport,
            };
            
            const textLayerDiv = document.createElement('div');
            textLayerDiv.className = 'textLayer';

            pageDiv.appendChild(canvas);
            pageDiv.appendChild(textLayerDiv);
            container.appendChild(pageDiv);
            
            await page.render(renderContext).promise;

            const textContent = await page.getTextContent();
            pdfjsLib.renderTextLayer({
                textContentSource: textContent,
                container: textLayerDiv,
                viewport: viewport,
                textDivs: [],
            });
        }
    }, [pdfDoc, zoom]);


    useEffect(() => {
        if (pdfDoc) {
            renderPdf();
        }
    }, [pdfDoc, zoom, renderPdf]);
    
    useEffect(() => {
        const loadPdf = async () => {
            if (!pdfUrl) return;
            setStatus('loading');
            try {
                const doc = await pdfjsLib.getDocument(pdfUrl).promise;
                setPdfDoc(doc);
                setStatus('success');
            } catch (error: any) {
                console.error("Error loading PDF:", error);
                setErrorMessage(error.message || 'Unknown error');
                setStatus('error');
            }
        };
        loadPdf();
    }, [pdfUrl]);

    const handleTextSelection = useCallback(() => {
        const selection = window.getSelection();
        const text = selection?.toString().trim() ?? '';
        if (text && selection) {
             const range = selection.getRangeAt(0);
             onTextSelect(text, range.getBoundingClientRect());
        } else {
             onTextSelect('', null);
        }
    }, [onTextSelect]);

    const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        // Clear any previous selection (text or area) when starting a new action
        setSelectionRect(null);
        onTextSelect('', null);

        if (e.altKey) {
            e.preventDefault();
            const viewerBounds = viewerRef.current!.getBoundingClientRect();
            selectionStartPoint.current = {
                x: e.clientX - viewerBounds.left + viewerRef.current!.scrollLeft,
                y: e.clientY - viewerBounds.top + viewerRef.current!.scrollTop,
            };
            setIsSelectingArea(true);
        }
    }, [onTextSelect]);

    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!isSelectingArea || !viewerRef.current) return;
        const viewerBounds = viewerRef.current.getBoundingClientRect();
        const currentX = e.clientX - viewerBounds.left + viewerRef.current.scrollLeft;
        const currentY = e.clientY - viewerBounds.top + viewerRef.current.scrollTop;

        const x = Math.min(selectionStartPoint.current.x, currentX);
        const y = Math.min(selectionStartPoint.current.y, currentY);
        const width = Math.abs(currentX - selectionStartPoint.current.x);
        const height = Math.abs(currentY - selectionStartPoint.current.y);

        setSelectionRect({ x, y, width, height });
    }, [isSelectingArea]);

    const handleMouseUp = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (isSelectingArea && selectionRect && viewerRef.current) {
            // Find the page canvas the selection is on
            for (const pageDiv of Array.from(viewerRef.current.children) as HTMLElement[]) {
                const pageBounds = pageDiv.getBoundingClientRect();
                const viewerBounds = viewerRef.current.getBoundingClientRect();
                const pageTop = pageBounds.top - viewerBounds.top + viewerRef.current.scrollTop;
                const pageBottom = pageTop + pageBounds.height;
                
                if (selectionRect.y < pageBottom && (selectionRect.y + selectionRect.height) > pageTop) {
                    const sourceCanvas = pageDiv.querySelector('canvas');
                    if (sourceCanvas) {
                        const outputScale = window.devicePixelRatio || 1;
                        const sx = (selectionRect.x - (pageBounds.left - viewerBounds.left + viewerRef.current.scrollLeft)) * outputScale;
                        const sy = (selectionRect.y - pageTop) * outputScale;
                        const sWidth = selectionRect.width * outputScale;
                        const sHeight = selectionRect.height * outputScale;

                        if (sWidth > 0 && sHeight > 0) {
                            const tempCanvas = document.createElement('canvas');
                            tempCanvas.width = sWidth;
                            tempCanvas.height = sHeight;
                            const ctx = tempCanvas.getContext('2d');
                            if (ctx) {
                                ctx.drawImage(sourceCanvas, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight);
                                const imageDataUrl = tempCanvas.toDataURL('image/png');
                                
                                const viewerBounds = viewerRef.current.getBoundingClientRect();
                                const viewportRect = new DOMRect(
                                    viewerBounds.left + selectionRect.x - viewerRef.current.scrollLeft,
                                    viewerBounds.top + selectionRect.y - viewerRef.current.scrollTop,
                                    selectionRect.width,
                                    selectionRect.height
                                );
                                onAreaSelect(imageDataUrl, viewportRect);
                            }
                        }
                        break; 
                    }
                }
            }
        }
        
        // This is for text selection
        if (!e.altKey && !isSelectingArea) {
             handleTextSelection();
             setSelectionRect(null); // If user was text-selecting, clear any old area rect
        }

        setIsSelectingArea(false); // Stop dragging mode, but keep the rect for now if it was an area selection
    }, [isSelectingArea, selectionRect, onAreaSelect, handleTextSelection]);


    const handlePageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseInt(e.target.value, 10);
        if (pdfDoc && val >= 1 && val <= pdfDoc.numPages) {
            setCurrentPage(val);
            const page = viewerRef.current?.children[val - 1];
            page?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };
    
    return (
        <div className="w-full h-full flex flex-col bg-[#F0F0F0]">
            <div className="flex-shrink-0 bg-white/80 backdrop-blur-sm border-b border-slate-200 p-2 flex items-center justify-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                    <button disabled={currentPage <= 1} onClick={() => handlePageInputChange({ target: { value: String(currentPage - 1) } } as any)} className="p-1 rounded-md hover:bg-slate-200 disabled:opacity-50"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" /></svg></button>
                    <input type="number" value={currentPage} onChange={handlePageInputChange} className="w-12 text-center border border-slate-300 rounded-md py-0.5" />
                    <span>/ {pdfDoc?.numPages || '...'}</span>
                    <button disabled={!pdfDoc || currentPage >= pdfDoc.numPages} onClick={() => handlePageInputChange({ target: { value: String(currentPage + 1) } } as any)} className="p-1 rounded-md hover:bg-slate-200 disabled:opacity-50"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg></button>
                </div>
                <div className="w-px h-5 bg-slate-300"></div>
                 <div className="flex items-center gap-2">
                    <button onClick={() => setZoom(z => Math.max(0.5, z - 0.1))} className="p-1 rounded-md hover:bg-slate-200"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" /><path fillRule="evenodd" d="M5 8a1 1 0 011-1h4a1 1 0 110 2H6a1 1 0 01-1-1z" clipRule="evenodd" /></svg></button>
                    <span className="w-16 text-center">{Math.round(zoom * 100)}%</span>
                    <button onClick={() => setZoom(z => Math.min(3, z + 0.1))} className="p-1 rounded-md hover:bg-slate-200"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" /><path fillRule="evenodd" d="M8 4a1 1 0 011 1v3h3a1 1 0 110 2H9v3a1 1 0 11-2 0V9H4a1 1 0 110-2h3V5a1 1 0 011-1z" clipRule="evenodd" /></svg></button>
                </div>
                <div className="w-px h-5 bg-slate-300"></div>
                <div className="flex items-center gap-1 text-slate-500" title="Hold Alt (Windows) or Option (Mac) and drag to select a figure or table to analyze.">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>
                    <span className="font-semibold">Alt/Option + Drag</span> to select figure
                </div>
            </div>
            <div 
                className={`flex-grow overflow-y-auto pdf-viewer-container relative ${isSelectingArea ? 'cursor-crosshair' : ''}`}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
            >
                {status === 'loading' && <LoadingState />}
                {status === 'error' && <ErrorState message={errorMessage} />}
                <div ref={viewerRef} className="p-4 flex flex-col items-center"></div>
                 {selectionRect && (
                    <div 
                        className="absolute border-2 border-[#FF6B00] bg-orange-400/20 pointer-events-none"
                        style={{
                            left: `${selectionRect.x}px`,
                            top: `${selectionRect.y}px`,
                            width: `${selectionRect.width}px`,
                            height: `${selectionRect.height}px`,
                        }}
                    />
                )}
            </div>
        </div>
    );
});