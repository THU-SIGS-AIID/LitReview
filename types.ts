export type ChatRole = 'user' | 'model';

export interface ChatMessage {
    role: ChatRole;
    content: string;
    image?: string; // Optional field to hold base64 image data for display
}

export interface Note {
    content: string;
    type: 'manual' | 'synthesized';
}

// Fix: Add missing AnalysisResult type to resolve compilation error.
export interface AnalysisResult {
    summary: {
        question: string;
        answer: string;
    }[];
    references: string[];
}