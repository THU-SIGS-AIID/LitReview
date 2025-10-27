import React, { useState, useEffect } from 'react';
import type { Note } from '../types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// MarkdownRenderer component to render structured notes
const MarkdownRenderer: React.FC<{ content: string }> = React.memo(({ content }) => {
    return (
        <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
                h1: ({node, ...props}) => <h1 className="text-xl font-bold my-2" {...props} />,
                h2: ({node, ...props}) => <h2 className="text-lg font-semibold my-2" {...props} />,
                h3: ({node, ...props}) => <h3 className="text-md font-semibold my-1" {...props} />,
                ul: ({node, ...props}) => <ul className="list-disc list-inside space-y-1 my-2 pl-4" {...props} />,
                ol: ({node, ...props}) => <ol className="list-decimal list-inside space-y-1 my-2 pl-4" {...props} />,
                p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} />,
            }}
        >
            {content}
        </ReactMarkdown>
    );
});

interface NotesListProps {
    notes: Note[];
    onSynthesize: () => void;
    isSynthesizing: boolean;
    synthesizedNoteForAnimation: Note | null;
    onAnimationComplete: (finalNote: Note) => void;
}

const NOTE_SNIPPET_LENGTH = 250;

export const NotesList: React.FC<NotesListProps> = ({ notes, onSynthesize, isSynthesizing, synthesizedNoteForAnimation, onAnimationComplete }) => {
    const [expandedNotes, setExpandedNotes] = useState<Set<number>>(new Set());
    const [displayedNotes, setDisplayedNotes] = useState<Note[]>(notes);
    const [isFadingOut, setIsFadingOut] = useState(false);
    const [fadingInNote, setFadingInNote] = useState<Note | null>(null);
    
    useEffect(() => {
        // If not animating, sync displayed notes with props
        if (!synthesizedNoteForAnimation && !isSynthesizing) {
            setDisplayedNotes(notes);
        }
    }, [notes, synthesizedNoteForAnimation, isSynthesizing]);

    // Animation Effect for Synthesis: Fade out old notes, then set up the new one to fade in.
    useEffect(() => {
        if (synthesizedNoteForAnimation) {
            setIsFadingOut(true); // Trigger fade-out animation
            const fadeOutTimer = setTimeout(() => {
                setDisplayedNotes([]);
                setIsFadingOut(false);
                setFadingInNote(synthesizedNoteForAnimation);
            }, 500); // Corresponds to Tailwind duration-500

            return () => clearTimeout(fadeOutTimer);
        }
    }, [synthesizedNoteForAnimation]);

    // Effect for finalizing the animation after the new note has faded in
    useEffect(() => {
        if (fadingInNote) {
            const animationTimer = setTimeout(() => {
                onAnimationComplete(fadingInNote);
                setFadingInNote(null); // Clear state to prevent loop
            }, 500); // Corresponds to the 'animate-fade-in-down' animation duration

            return () => clearTimeout(animationTimer);
        }
    }, [fadingInNote, onAnimationComplete]);

    const toggleNoteExpansion = (index: number) => {
        setExpandedNotes(prev => {
            const newSet = new Set(prev);
            if (newSet.has(index)) {
                newSet.delete(index);
            } else {
                newSet.add(index);
            }
            return newSet;
        });
    };

    const hasNotesToDisplay = displayedNotes.length > 0 || fadingInNote;

    return (
        <div className="h-full bg-white relative">
            <div className="h-full overflow-y-auto">
                <h2 className="text-xl font-bold text-slate-900 border-b pb-2 sticky top-0 bg-white z-10 px-6 pt-6">
                    Curated Notes
                </h2>
                {hasNotesToDisplay ? (
                    <div className="space-y-4 px-6 py-4 pb-24"> {/* Padding for FAB */}
                        {displayedNotes.map((note, index) => {
                            const isExpanded = expandedNotes.has(index);
                            const isTruncatable = note.content.length > NOTE_SNIPPET_LENGTH;
                            const noteBgColor = note.type === 'synthesized' 
                                ? 'bg-teal-50 border-teal-200' 
                                : 'bg-amber-50 border-amber-200 hover:border-amber-300';
                            
                            return (
                                <div
                                    key={`note-${index}`}
                                    className={`p-4 rounded-lg shadow-sm transition-all duration-500 border ${noteBgColor} ${isFadingOut ? 'opacity-0' : 'opacity-100'}`}
                                    onClick={() => isTruncatable && toggleNoteExpansion(index)}
                                    style={{ cursor: isTruncatable ? 'pointer' : 'default' }}
                                >
                                    {note.type === 'synthesized' ? (
                                         <MarkdownRenderer content={isExpanded || !isTruncatable ? note.content : `${note.content.substring(0, NOTE_SNIPPET_LENGTH)}...`} />
                                    ) : (
                                        <p className="text-base text-slate-800 whitespace-pre-wrap">
                                            {isExpanded || !isTruncatable ? note.content : `${note.content.substring(0, NOTE_SNIPPET_LENGTH)}...`}
                                        </p>
                                    )}
                                    {isTruncatable && (
                                        <span className="text-sm font-semibold text-[#FF6B00] mt-2 inline-block">
                                            {isExpanded ? 'Show less' : 'Show more'}
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                        
                        {fadingInNote && (
                            <div className="p-4 rounded-lg shadow-sm border bg-teal-50 border-teal-200 animate-fade-in-down">
                                <MarkdownRenderer content={fadingInNote.content} />
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-center text-slate-500 -mt-16">
                         <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-slate-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        <h3 className="text-lg font-semibold text-slate-700">Your curated notes will appear here.</h3>
                        <p className="mt-1 max-w-sm">Highlight text or save entire responses from the AI assistant to build your personal summary.</p>
                    </div>
                )}
            </div>

            {notes.length > 1 && !isSynthesizing && (
                <div className="absolute bottom-6 right-6 z-20">
                    <button
                        onClick={onSynthesize}
                        disabled={isSynthesizing}
                        className="w-14 h-14 bg-[#0B3D3D] text-white rounded-full flex items-center justify-center shadow-lg hover:bg-teal-800 transition-all duration-200 disabled:bg-slate-400 disabled:cursor-not-allowed transform hover:scale-105 active:scale-95"
                        title="Synthesize notes into a structured document"
                        aria-label="Synthesize notes"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                        </svg>
                    </button>
                </div>
            )}

            {isSynthesizing && (
                 <div className="absolute bottom-6 right-6 z-20">
                     <div
                        className="w-14 h-14 bg-[#0B3D3D] text-white rounded-full flex items-center justify-center shadow-lg"
                        title="Synthesizing notes..."
                        aria-label="Synthesizing notes"
                    >
                        <svg className="animate-spin h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                    </div>
                 </div>
            )}
        </div>
    );
};