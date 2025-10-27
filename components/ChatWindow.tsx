import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { ChatMessage } from '../types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ChatWindowProps {
    messages: ChatMessage[];
    onSendMessage: (message: string) => void;
    isSending: boolean;
    loadingMessage: string | null;
    onAddNote: (note: string) => void;
}

const ModelAvatar = () => (
    <div className="w-7 h-7 rounded-md bg-[#0B3D3D] flex items-center justify-center flex-shrink-0">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 19.5C4 18.12 5.12 17 6.5 17H20" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M6.5 2H20v15H6.5C5.12 17 4 15.88 4 14.5V3.5C4 2.67 4.67 2 5.5 2H6.5z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M12 6L13 8L15 9L13 10L12 12L11 10L9 9L11 8L12 6z" stroke="#FFC9A3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
    </div>
);

const UserAvatar = () => (
    <div className="w-7 h-7 rounded-md bg-[#E55D3A] flex items-center justify-center flex-shrink-0">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
        </svg>
    </div>
);


const MarkdownRenderer: React.FC<{ content: string }> = React.memo(({ content }) => {
    return (
        <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
                h1: ({node, ...props}) => <h1 className="text-xl font-bold my-2" {...props} />,
                h2: ({node, ...props}) => <h2 className="text-lg font-semibold my-2" {...props} />,
                h3: ({node, ...props}) => <h3 className="text-md font-semibold my-1" {...props} />,
                ul: ({node, ...props}) => <ul className="list-disc list-inside space-y-1 my-2 pl-2" {...props} />,
                ol: ({node, ...props}) => <ol className="list-decimal list-inside space-y-1 my-2 pl-2" {...props} />,
                p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} />,
            }}
        >
            {content}
        </ReactMarkdown>
    );
});


export const ChatWindow: React.FC<ChatWindowProps> = ({ messages, onSendMessage, isSending, loadingMessage, onAddNote }) => {
    const [input, setInput] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const [selectionPopup, setSelectionPopup] = useState<{ text: string; x: number; y: number } | null>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(scrollToBottom, [messages, isSending]);

    const handleSelection = useCallback(() => {
        const selection = window.getSelection();
        const selectedText = selection?.toString().trim();

        if (selectedText && chatContainerRef.current && selection) {
            const range = selection.getRangeAt(0);
            
            let parent = range.commonAncestorContainer;
            if (parent.nodeType !== Node.ELEMENT_NODE) {
                parent = parent.parentNode as HTMLElement;
            }

            // Ensure the selection is within a model's message bubble
            if ((parent as HTMLElement).closest('[data-is-model-message="true"]')) {
                const rect = range.getBoundingClientRect();
                const containerRect = chatContainerRef.current.getBoundingClientRect();
                setSelectionPopup({
                    text: selectedText,
                    x: rect.left - containerRect.left + rect.width / 2,
                    y: rect.top - containerRect.top + chatContainerRef.current.scrollTop,
                });
            } else {
                 setSelectionPopup(null);
            }
        } else {
            // If there's no selection, ensure the popup is hidden
            if (!(document.activeElement as HTMLElement)?.closest('[data-is-selection-popup="true"]')) {
                setSelectionPopup(null);
            }
        }
    }, []);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (input.trim() && !isSending) {
            onSendMessage(input.trim());
            setInput('');
        }
    };
    
    return (
        <div className="flex flex-col h-full bg-[#FDFBF7]">
            <div
                ref={chatContainerRef}
                className="flex-grow overflow-y-auto p-6 space-y-6 relative"
                onMouseUp={handleSelection}
            >
                {messages.map((msg, index) => (
                    <div key={index} className={`flex items-start gap-3 w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                       {msg.role === 'model' && <ModelAvatar />}
                        <div className="flex flex-col max-w-[85%]">
                             <p className={`text-sm font-semibold mb-1.5 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                                {msg.role === 'model' ? 'AI Assistant' : 'You'}
                            </p>
                             <div 
                                className={`p-4 rounded-lg border text-sm text-slate-700 leading-relaxed ${msg.role === 'model' ? 'bg-white border-slate-200 relative group' : 'bg-[#FFF2E5] border-orange-200'}`}
                                {...(msg.role === 'model' && { 'data-is-model-message': true })}
                            >
                                {msg.image && (
                                    <img
                                        src={msg.image}
                                        alt="Selected figure"
                                        className="mb-3 rounded-md border border-orange-300 max-w-sm h-auto"
                                    />
                                )}
                                <MarkdownRenderer content={msg.content} />
                                {msg.role === 'model' && (
                                    <button
                                        onClick={() => onAddNote(msg.content)}
                                        className="absolute bottom-2 right-2 p-1.5 bg-white/50 border border-slate-200 rounded-full text-slate-500 hover:bg-white hover:text-[#FF6B00] transition-opacity opacity-0 group-hover:opacity-100 focus:opacity-100"
                                        title="Save entire response to Notes"
                                        aria-label="Save entire response to Notes"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                                        </svg>
                                    </button>
                                )}
                             </div>
                        </div>
                        {msg.role === 'user' && <UserAvatar />}
                    </div>
                ))}
                {isSending && (
                     <div className="flex items-start gap-3 justify-start w-full">
                        <ModelAvatar />
                         <div className="flex flex-col max-w-[85%]">
                           <p className="text-sm font-semibold mb-1.5 text-left">AI Assistant</p>
                             <div className="bg-white p-4 rounded-lg border border-slate-200">
                                {loadingMessage ? (
                                    <p className="text-sm text-slate-600 animate-pulse">{loadingMessage}</p>
                                ) : (
                                    <div className="flex items-center space-x-2">
                                        <div className="w-2 h-2 bg-slate-400 rounded-full animate-pulse"></div>
                                        <div className="w-2 h-2 bg-slate-400 rounded-full animate-pulse [animation-delay:0.2s]"></div>
                                        <div className="w-2 h-2 bg-slate-400 rounded-full animate-pulse [animation-delay:0.4s]"></div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
                {selectionPopup && (
                    <div
                        data-is-selection-popup="true"
                        className="absolute z-20"
                        style={{
                            left: `${selectionPopup.x}px`,
                            top: `${selectionPopup.y}px`,
                            transform: 'translateX(-50%) translateY(-120%)',
                        }}
                    >
                        <button
                            onMouseDown={(e) => e.preventDefault()} // Prevents the button from stealing focus and clearing the selection
                            onClick={() => {
                                onAddNote(selectionPopup.text);
                                setSelectionPopup(null);
                                window.getSelection()?.removeAllRanges(); // Clear selection after use
                            }}
                            className="px-3 py-1.5 bg-[#FF6B00] text-white text-sm font-semibold rounded-lg shadow-lg hover:bg-orange-600 transition"
                        >
                            Add to Notes
                        </button>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>
            <div className="p-4 border-t border-slate-200 bg-white/80 backdrop-blur-sm">
                <form onSubmit={handleSubmit} className="relative">
                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Enter your question (max 1,000 characters)"
                        className="w-full pl-4 pr-14 py-3 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF6B00] focus:border-[#FF6B00] transition resize-none text-sm"
                        disabled={isSending}
                        rows={1}
                        maxLength={1000}
                        aria-label="Chat input"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSubmit(e);
                            }
                        }}
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center">
                         <button
                            type="submit"
                            disabled={isSending || !input.trim()}
                            className="w-8 h-8 bg-slate-800 text-white rounded-full flex items-center justify-center disabled:bg-slate-300 disabled:cursor-not-allowed hover:bg-slate-900 transition-all"
                            aria-label="Send message"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                               <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                            </svg>
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};