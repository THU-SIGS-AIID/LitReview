import React, { useState, useCallback, useRef, useEffect } from 'react';
import { LoadingSpinner } from './components/LoadingSpinner';
import { ChatWindow } from './components/ChatWindow';
import { PdfViewer, type PdfViewerRef } from './components/PdfViewer';
import { ReferencesList } from './components/ReferencesList';
import { NotesList } from './components/NotesList';
import { extractReferences, createChatSession, generateSummary, analyzeReference, synthesizeNotes, explainImageSelection, validateApiKey } from './services/geminiService';
import type { ChatMessage, Note } from './types';
import type { Chat } from '@google/genai';
import { SUMMARIZE_SELECTION_PROMPT_TEMPLATE, EXPLAIN_SELECTION_PROMPT_TEMPLATE } from './constants';

// pdfjs types are not readily available in this environment, so we declare it.
declare const pdfjsLib: any;
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.3.136/pdf.worker.min.mjs';

interface SelectedText {
    text: string;
    x: number;
    y: number;
}

interface SelectedArea {
    imageData: string;
    x: number;
    y: number;
}

const App: React.FC = () => {
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [loadingMessage, setLoadingMessage] = useState<string>('');
    const [loadingDescription, setLoadingDescription] = useState<string>('');
    const [error, setError] = useState<string | null>(null);
    const [apiKey, setApiKey] = useState<string>('');

    const [pdfFile, setPdfFile] = useState<File | null>(null);
    const [pdfUrl, setPdfUrl] = useState<string | null>(null);
    const [textContent, setTextContent] = useState<string>('');
    const [references, setReferences] = useState<string[]>([]);
    const [notes, setNotes] = useState<Note[]>([]);
    const [isSynthesizing, setIsSynthesizing] = useState<boolean>(false);
    const [synthesizedNoteForAnimation, setSynthesizedNoteForAnimation] = useState<Note | null>(null);
    
    const [leftPaneView, setLeftPaneView] = useState<'document' | 'references' | 'notes'>('document');
    
    const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
    const [isSendingMessage, setIsSendingMessage] = useState(false);
    const [chatLoadingMessage, setChatLoadingMessage] = useState<string | null>(null);
    const chatSessionRef = useRef<Chat | null>(null);
    const loadingTimeoutRef = useRef<number | null>(null);
    const chatLoadingTimeoutRef = useRef<number | null>(null);
    
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const pdfPaneRef = useRef<HTMLDivElement>(null);
    const pdfViewerRef = useRef<PdfViewerRef>(null);

    const [selectedText, setSelectedText] = useState<SelectedText | null>(null);
    const [selectedArea, setSelectedArea] = useState<SelectedArea | null>(null);

    useEffect(() => {
        return () => {
            if (loadingTimeoutRef.current) {
                clearTimeout(loadingTimeoutRef.current);
            }
            if (chatLoadingTimeoutRef.current) {
                clearTimeout(chatLoadingTimeoutRef.current);
            }
        };
    }, []);


    const handleTextSelect = useCallback((text: string, rect: DOMRect | null) => {
        if (text && rect && pdfPaneRef.current) {
             const pdfPaneBounds = pdfPaneRef.current.getBoundingClientRect();
             setSelectedText({
                text: text,
                x: rect.left - pdfPaneBounds.left,
                y: rect.bottom - pdfPaneBounds.top + window.scrollY,
            });
            setSelectedArea(null); // Clear area selection if text is selected
        } else {
            setSelectedText(null);
            setSelectedArea(null); // Also clear area selection if text selection is cleared
        }
    }, []);

    const handleAreaSelect = useCallback((imageData: string, rect: DOMRect) => {
        if (imageData && rect && pdfPaneRef.current) {
            const pdfPaneBounds = pdfPaneRef.current.getBoundingClientRect();
            setSelectedArea({
                imageData,
                x: rect.left - pdfPaneBounds.left,
                y: rect.top - pdfPaneBounds.top,
            });
            setSelectedText(null); // Clear text selection if area is selected
        } else {
            setSelectedArea(null);
        }
    }, []);

    const handleSummarizeSelection = () => {
        if (selectedText) {
            const message = SUMMARIZE_SELECTION_PROMPT_TEMPLATE.replace('{selection}', selectedText.text);
            handleSendMessage(message);
            setSelectedText(null);
        }
    };
    
    const handleExplainSelection = () => {
        if (selectedText) {
            const message = EXPLAIN_SELECTION_PROMPT_TEMPLATE.replace('{selection}', selectedText.text);
            handleSendMessage(message);
            setSelectedText(null);
        }
    };

    const handleExplainArea = async () => {
        if (!selectedArea) return;

        const { imageData } = selectedArea;
        setSelectedArea(null);
        pdfViewerRef.current?.clearSelection(); // Clear persistent rectangle in child
        
        const userMessage: ChatMessage = {
            role: 'user',
            content: `Please explain the content of this selected figure.`,
            image: imageData, // Include the captured image
        };
        setChatHistory(prev => [...prev, userMessage]);
        setIsSendingMessage(true);

        try {
            const explanation = await explainImageSelection(apiKey, imageData);
            setChatHistory(prev => [...prev, { role: 'model', content: explanation }]);
        } catch(e: any) {
            console.error("Error explaining figure:", e);
            setChatHistory(prev => [...prev, { role: 'model', content: `Sorry, I encountered an error explaining the figure. ${e.message}` }]);
        } finally {
            setIsSendingMessage(false);
        }
    };


    const handleFileSelect = (files: FileList | null) => {
        if (files && files.length > 0) {
            const file = files[0];
            if (file.type === 'application/pdf') {
                handleFileUpload(file);
            } else {
                setError('Please upload a valid PDF file.');
                setTimeout(() => setError(null), 3000);
            }
        }
    };

    const handleFileUpload = useCallback(async (file: File) => {
        if (!file) return;

        if (!apiKey.trim()) {
            setError('Please enter your Google Gemini API Key before uploading.');
            return;
        }

        setIsLoading(true);
        setError(null);

        setLoadingMessage('Validating API Key...');
        setLoadingDescription('Please wait while we check your credentials.');
        
        const isKeyValid = await validateApiKey(apiKey);
        if (!isKeyValid) {
            setError('API Key is invalid or has insufficient permissions. Please check your key and try again.');
            setIsLoading(false);
            return;
        }
        
        setPdfFile(file);
        
        const url = URL.createObjectURL(file);
        setPdfUrl(url);

        try {
            const fileReader = new FileReader();
            fileReader.onload = async (event) => {
                if (event.target?.result) {
                    try {
                        const initialMessage = { title: "Preparing PDF...", description: "Getting your document ready for analysis." };
                        setLoadingMessage(initialMessage.title);
                        setLoadingDescription(initialMessage.description);
                        
                        const typedArray = new Uint8Array(event.target.result as ArrayBuffer);
                        const pdf = await pdfjsLib.getDocument(typedArray).promise;
                        let fullText = '';
                        for (let i = 1; i <= pdf.numPages; i++) {
                            const page = await pdf.getPage(i);
                            const textContent = await page.getTextContent();
                            fullText += textContent.items.map((item: any) => item.str).join(' ') + '\n';
                        }
                        setTextContent(fullText);

                        const analysisMessages = [
                            { title: "Initializing AI assistant...", description: "Warming up the neural networks for analysis.", duration: 3000 },
                            { title: "Scanning document structure...", description: "Identifying headings, paragraphs, and sections.", duration: 4000 },
                            { title: "Analyzing introduction & abstract...", description: "Grasping the core purpose and summary of the paper.", duration: 3000 },
                            { title: "Deconstructing the methodology...", description: "Understanding how the research was conducted.", duration: 4000 },
                            { title: "Extracting key findings & results...", description: "Pinpointing the most important data and outcomes.", duration: 4000 },
                            { title: "Identifying core arguments...", description: "Following the logical flow of the author's claims.", duration: 3000 },
                            { title: "Cross-referencing bibliography...", description: "Mapping out the cited works and their connections.", duration: 3000 },
                            { title: "Synthesizing main concepts...", description: "Connecting the dots to form a coherent overview.", duration: 4000 },
                            { title: "Formatting the summary...", description: "Arranging the extracted information for clarity.", duration: 3000 },
                            { title: "Finalizing analysis...", description: "Putting the finishing touches on your report.", duration: 3000 },
                        ];

                        if (loadingTimeoutRef.current) {
                            clearTimeout(loadingTimeoutRef.current);
                        }

                        let messageIndex = 0;
                        const showNextMessage = (index: number) => {
                            if (index >= analysisMessages.length) {
                                return; // Stop when all messages are shown
                            }
                            
                            setLoadingMessage(analysisMessages[index].title);
                            setLoadingDescription(analysisMessages[index].description);

                            loadingTimeoutRef.current = window.setTimeout(() => {
                                showNextMessage(index + 1);
                            }, analysisMessages[index].duration);
                        };

                        showNextMessage(messageIndex);


                        const summaryPromise = generateSummary(apiKey, fullText);
                        const referencesPromise = extractReferences(apiKey, fullText);
                        
                        chatSessionRef.current = createChatSession(apiKey, fullText);

                        const [summary, refsMarkdown] = await Promise.all([summaryPromise, referencesPromise]);
                        
                        if (loadingTimeoutRef.current) {
                            clearTimeout(loadingTimeoutRef.current);
                            loadingTimeoutRef.current = null;
                        }

                        // Defensive Post-Processing: Clean the summary before displaying it.
                        // This removes any stray leading bullet points the model might add.
                        const cleanedSummary = summary.replace(/^\s*•\s*/gm, '');

                        setChatHistory([
                            { role: 'model', content: cleanedSummary },
                        ]);
                        
                        const parsedReferences = refsMarkdown
                            .split('\n')
                            .map(ref => ref.replace(/^\d+\.\s*/, '').trim())
                            .filter(ref => ref.length > 0);
                        setReferences(parsedReferences);
                        
                        setIsLoading(false);

                    } catch (e: any) {
                        if (loadingTimeoutRef.current) {
                            clearTimeout(loadingTimeoutRef.current);
                            loadingTimeoutRef.current = null;
                        }
                        console.error("Error processing file or calling AI:", e);
                        setError(`Failed to analyze the paper. ${e.message || 'Please try again.'}`);
                        setPdfFile(null);
                        setIsLoading(false);
                    }
                }
            };
            fileReader.onerror = () => {
                 setError('Failed to read the uploaded file.');
                 setIsLoading(false);
                 setPdfFile(null);
            };
            fileReader.readAsArrayBuffer(file);

        } catch (e: any) {
            console.error("Error setting up file reader:", e);
            setError(`An unexpected error occurred. ${e.message || 'Please refresh and try again.'}`);
            setIsLoading(false);
            setPdfFile(null);
        }
    }, [apiKey]);
    
    const handleSendMessage = async (message: string) => {
        if (!chatSessionRef.current || isSendingMessage) return;

        setIsSendingMessage(true);
        const updatedHistory: ChatMessage[] = [...chatHistory, { role: 'user', content: message }];
        setChatHistory(updatedHistory);

        try {
            const chat = chatSessionRef.current;
            const result = await chat.sendMessage({ message });
            
            const modelResponse = result.text;
            
            setChatHistory(prev => [...prev, { role: 'model', content: modelResponse }]);

        } catch(e: any) {
            console.error("Error sending message:", e);
            setChatHistory(prev => [...prev, { role: 'model', content: `Sorry, I encountered an error. ${e.message}` }]);
        } finally {
            setIsSendingMessage(false);
        }
    };

    const handleAnalyzeReference = async (reference: string) => {
        const userMessage = `Please find and summarize this reference: "${reference}"`;
        setChatHistory(prev => [...prev, { role: 'user', content: userMessage }]);
        setIsSendingMessage(true);

        const analysisMessages = [
            { message: "Searching for the content ...", duration: 3000 },
            { message: "Scraping content from website ...", duration: 4000 },
            { message: "Analyzing content ...", duration: 6000 },
            { message: "Reading results ...", duration: 3000 },
        ];

        if (chatLoadingTimeoutRef.current) clearTimeout(chatLoadingTimeoutRef.current);

        const showNextMessage = (index: number) => {
            const msgIndex = index % analysisMessages.length;
            setChatLoadingMessage(analysisMessages[msgIndex].message);
            chatLoadingTimeoutRef.current = window.setTimeout(() => {
                showNextMessage(index + 1);
            }, analysisMessages[msgIndex].duration);
        };
        showNextMessage(0);

        try {
            const summary = await analyzeReference(apiKey, reference);
            setChatHistory(prev => [...prev, { role: 'model', content: summary }]);
        } catch (e: any) {
            console.error("Error analyzing reference:", e);
            setChatHistory(prev => [...prev, { role: 'model', content: `Sorry, I couldn't analyze that reference. ${e.message}` }]);
        } finally {
            setIsSendingMessage(false);
            setChatLoadingMessage(null);
            if (chatLoadingTimeoutRef.current) {
                clearTimeout(chatLoadingTimeoutRef.current);
                chatLoadingTimeoutRef.current = null;
            }
        }
    };

    const handleAddNote = useCallback((note: string) => {
        if (note.trim()) {
            setNotes(prevNotes => [...prevNotes, { content: note.trim(), type: 'manual' }]);
        }
    }, []);

    const handleSynthesizeNotes = async () => {
        if (notes.length < 2 || isSynthesizing) return;

        setIsSynthesizing(true);
        setError(null);
        try {
            const allNotesContent = notes.map(n => n.content).join('\n\n---\n\n');
            const synthesizedNoteContent = await synthesizeNotes(apiKey, allNotesContent);
            setSynthesizedNoteForAnimation({ content: synthesizedNoteContent, type: 'synthesized' });
        } catch (e: any) {
            console.error("Error synthesizing notes:", e);
            setError("Sorry, I couldn't synthesize the notes. Please try again.");
            setIsSynthesizing(false);
        }
    };
    
    const handleSynthesisAnimationComplete = useCallback((finalNote: Note) => {
        setNotes([finalNote]);
        setSynthesizedNoteForAnimation(null);
        setIsSynthesizing(false);
    }, []);

    const handleDrag = useCallback((e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); }, []);
    const handleDragIn = useCallback((e: React.DragEvent<HTMLDivElement>) => { handleDrag(e); setIsDragging(true); }, [handleDrag]);
    const handleDragOut = useCallback((e: React.DragEvent<HTMLDivElement>) => { handleDrag(e); setIsDragging(false); }, [handleDrag]);
    const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        handleDrag(e);
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFileSelect(e.dataTransfer.files);
            e.dataTransfer.clearData();
        }
    }, [handleDrag, handleFileSelect]);
    
    if (isLoading) {
        return <LoadingSpinner message={loadingMessage} description={loadingDescription} />;
    }

    if (!pdfFile) {
        return (
            <div className="min-h-screen text-slate-800 bg-[#FDFBF7] flex flex-col">
                 <header className="bg-white/80 backdrop-blur-sm border-b border-slate-200">
                    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
                         <div className="flex items-center gap-3">
                            <div className="w-7 h-7 rounded-md bg-[#0B3D3D] flex items-center justify-center flex-shrink-0">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M4 19.5C4 18.12 5.12 17 6.5 17H20" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                    <path d="M6.5 2H20v15H6.5C5.12 17 4 15.88 4 14.5V3.5C4 2.67 4.67 2 5.5 2H6.5z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                    <path d="M12 6L13 8L15 9L13 10L12 12L11 10L9 9L11 8L12 6z" stroke="#FFC9A3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                            </div>
                            <h1 className="text-xl font-semibold text-slate-800 tracking-tight">LitReview AI</h1>
                        </div>
                    </div>
                </header>
                <main className="flex-grow flex flex-col items-center justify-center p-4">
                    <div className="w-full max-w-lg mb-6">
                        <label htmlFor="apiKey" className="block text-sm font-medium text-slate-700 mb-1">
                            Google Gemini API Key
                        </label>
                        <input
                            id="apiKey"
                            type="password"
                            value={apiKey}
                            onChange={(e) => { setApiKey(e.target.value); setError(null); }}
                            placeholder="Enter your API key to begin analysis"
                            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B00] focus:border-[#FF6B00]"
                            aria-label="Google Gemini API Key Input"
                        />
                    </div>
                    <div
                        className={`w-full max-w-lg p-8 border-2 border-dashed rounded-lg text-center transition-colors duration-200 ${isDragging ? 'border-[#FF6B00] bg-orange-50' : 'border-slate-300 bg-white'}`}
                        onDragEnter={handleDragIn} onDragLeave={handleDragOut} onDragOver={handleDrag} onDrop={handleDrop}
                    >
                        <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={(e) => handleFileSelect(e.target.files)} />
                        <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-16 w-16 text-slate-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        <h2 className="text-xl font-semibold text-slate-700">Upload Your Research Paper</h2>
                        <p className="text-slate-500 mt-2 mb-6">Drag & drop your PDF here or click to select a file.</p>
                        <button type="button" onClick={() => fileInputRef.current?.click()}
                            className="px-6 py-2 text-white font-semibold bg-[#FF6B00] rounded-md hover:bg-orange-600 transition-colors duration-200">
                            Browse Files
                        </button>
                        {error && <p className="text-red-500 text-sm mt-4">{error}</p>}
                    </div>
                </main>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen font-sans text-slate-800">
             <header className="bg-white/80 backdrop-blur-sm border-b border-slate-200 flex-shrink-0">
                <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-3 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-md bg-[#0B3D3D] flex items-center justify-center flex-shrink-0">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M4 19.5C4 18.12 5.12 17 6.5 17H20" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                <path d="M6.5 2H20v15H6.5C5.12 17 4 15.88 4 14.5V3.5C4 2.67 4.67 2 5.5 2H6.5z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                <path d="M12 6L13 8L15 9L13 10L12 12L11 10L9 9L11 8L12 6z" stroke="#FFC9A3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                        </div>
                        <h1 className="text-xl font-semibold text-slate-800 tracking-tight">LitReview AI</h1>
                    </div>
                </div>
            </header>
            <main className="flex-grow flex overflow-hidden">
                <div ref={pdfPaneRef} className="w-1/2 flex flex-col bg-[#F0F0F0]">
                    <div className="flex-shrink-0 bg-white/80 backdrop-blur-sm border-b border-slate-200 p-2 flex items-center justify-center gap-2">
                        <button
                            onClick={() => setLeftPaneView('document')}
                            className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-colors ${leftPaneView === 'document' ? 'bg-[#FF6B00] text-white shadow' : 'text-slate-600 hover:bg-slate-100'}`}
                        >
                            Document
                        </button>
                        <button
                            onClick={() => setLeftPaneView('references')}
                            className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-colors ${leftPaneView === 'references' ? 'bg-[#FF6B00] text-white shadow' : 'text-slate-600 hover:bg-slate-100'}`}
                        >
                            References ({references.length})
                        </button>
                        <button
                            onClick={() => setLeftPaneView('notes')}
                            className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-colors ${leftPaneView === 'notes' ? 'bg-[#FF6B00] text-white shadow' : 'text-slate-600 hover:bg-slate-100'}`}
                        >
                            Notes ({notes.filter(n => n.type === 'manual').length > 0 ? notes.filter(n => n.type === 'manual').length : notes.length})
                        </button>
                    </div>
                     <div className="flex-grow overflow-hidden relative">
                        {leftPaneView === 'document' && (
                            <>
                                {pdfUrl && <PdfViewer ref={pdfViewerRef} pdfUrl={pdfUrl} onTextSelect={handleTextSelect} onAreaSelect={handleAreaSelect} />}
                                {selectedText && (
                                     <div
                                        className="absolute z-10 flex items-center bg-[#FF6B00] text-white text-sm font-semibold rounded-lg shadow-lg"
                                        style={{ top: `${selectedText.y + 8}px`, left: `${selectedText.x}px` }}
                                    >
                                       <button onClick={handleSummarizeSelection} className="px-3 py-1.5 hover:bg-orange-600 rounded-l-lg">Summarize</button>
                                       <div className="w-px h-4 bg-orange-400"></div>
                                       <button onClick={handleExplainSelection} className="px-3 py-1.5 hover:bg-orange-600 rounded-r-lg">Explain text</button>
                                    </div>
                                )}
                                {selectedArea && (
                                     <div
                                        className="absolute z-10"
                                        style={{ top: `${selectedArea.y + 8}px`, left: `${selectedArea.x}px` }}
                                    >
                                       <button onClick={handleExplainArea} className="px-3 py-1.5 bg-[#FF6B00] text-white text-sm font-semibold rounded-lg shadow-lg hover:bg-orange-600 transition">
                                            Explain Figure
                                       </button>
                                    </div>
                                )}
                            </>
                        )}
                        {leftPaneView === 'references' && (
                            <ReferencesList 
                                references={references} 
                                onAnalyze={handleAnalyzeReference} 
                                isAnalyzing={isSendingMessage} 
                            />
                        )}
                         {leftPaneView === 'notes' && (
                            <NotesList 
                                notes={notes}
                                onSynthesize={handleSynthesizeNotes}
                                isSynthesizing={isSynthesizing}
                                synthesizedNoteForAnimation={synthesizedNoteForAnimation}
                                onAnimationComplete={handleSynthesisAnimationComplete}
                            />
                        )}
                    </div>
                </div>
                <div className="w-1/2 flex flex-col bg-white border-l border-slate-200">
                    <ChatWindow 
                        messages={chatHistory} 
                        onSendMessage={handleSendMessage} 
                        isSending={isSendingMessage} 
                        loadingMessage={chatLoadingMessage} 
                        onAddNote={handleAddNote}
                    />
                </div>
            </main>
        </div>
    );
};

export default App;