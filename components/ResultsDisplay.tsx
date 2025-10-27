
import React from 'react';
import type { AnalysisResult } from '../types';

interface ResultsDisplayProps {
    result: AnalysisResult;
}

export const ResultsDisplay: React.FC<ResultsDisplayProps> = ({ result }) => {
    return (
        <div className="space-y-10">
            <div>
                <h2 className="text-2xl font-bold text-slate-900 border-b pb-2 mb-4">
                    Structured Summary
                </h2>
                <div className="space-y-6">
                    {result.summary.map((item, index) => (
                        <div key={index}>
                            <h3 className="text-md font-semibold text-indigo-700 mb-1">{item.question}</h3>
                            <p className="text-slate-600 whitespace-pre-wrap leading-relaxed">{item.answer}</p>
                        </div>
                    ))}
                </div>
            </div>

            <div>
                <h2 className="text-2xl font-bold text-slate-900 border-b pb-2 mb-4">
                    Extracted References
                </h2>
                <div className="max-h-96 overflow-y-auto pr-4 -mr-4">
                     <ol className="list-decimal list-inside space-y-4 text-slate-600">
                        {result.references.map((ref, index) => (
                            <li key={index} className="pl-2">
                                <div className="flex justify-between items-start">
                                    <span className="flex-1 mr-4">{ref}</span>
                                    <button 
                                        onClick={() => alert("Functionality to analyze this reference is not yet implemented.")}
                                        className="flex-shrink-0 text-xs font-semibold text-indigo-600 bg-indigo-100 hover:bg-indigo-200 rounded-full px-3 py-1 transition-colors duration-200"
                                    >
                                        Analyze this Reference
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ol>
                </div>
            </div>
        </div>
    );
};
