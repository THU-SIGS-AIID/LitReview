import React from 'react';

interface ReferencesListProps {
    references: string[];
    onAnalyze: (reference: string) => void;
    isAnalyzing: boolean;
}

export const ReferencesList: React.FC<ReferencesListProps> = ({ references, onAnalyze, isAnalyzing }) => {
    return (
        <div className="h-full overflow-y-auto bg-white">
            <h2 className="text-xl font-bold text-slate-900 border-b pb-2 sticky top-0 bg-white z-10 px-6 pt-6">
                Extracted References
            </h2>
            {references.length > 0 ? (
                <div className="space-y-6 px-6 py-4">
                    {references.map((ref, index) => (
                        <div key={index} className="flex items-start gap-4">
                            <div className="flex-shrink-0 w-6 h-6 bg-[#FF6B00] text-white text-sm font-semibold rounded-full flex items-center justify-center">
                                {index + 1}
                            </div>
                            <span className="flex-1 text-base text-slate-700">{ref}</span>
                            <button
                                onClick={() => onAnalyze(ref)}
                                disabled={isAnalyzing}
                                className="flex-shrink-0 text-xs font-semibold text-[#FF6B00] bg-orange-100 hover:bg-orange-200 rounded-full px-3 py-1 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Analyze
                            </button>
                        </div>
                    ))}
                </div>
            ) : (
                <p className="text-slate-500 px-6 py-4">No references were extracted from this document.</p>
            )}
        </div>
    );
};
