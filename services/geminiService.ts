import { GoogleGenAI } from "@google/genai";
import type { Chat } from "@google/genai";
import { REFERENCES_PROMPT, CHAT_SYSTEM_INSTRUCTION, SUMMARY_PROMPT, SYNTHESIZE_NOTES_PROMPT, EXPLAIN_FIGURE_PROMPT } from '../constants';

export async function validateApiKey(apiKey: string): Promise<boolean> {
    try {
        // Explicitly pass the apiKey to prevent any potential fallback to environment variables.
        const ai = new GoogleGenAI({ apiKey: apiKey });
        // Use a lightweight model and a simple, short prompt to validate the key.
        // This is a fast and cost-effective way to check for authentication errors.
        await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: 'hello',
        });
        return true;
    } catch (error) {
        console.error("API Key validation failed:", error);
        return false;
    }
}

export async function generateSummary(apiKey: string, textContent: string): Promise<string> {
    try {
        const ai = new GoogleGenAI({ apiKey: apiKey });
        const fullPrompt = `${SUMMARY_PROMPT}\n\n---\n\n${textContent}`;
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: fullPrompt,
        });

        return response.text;
    } catch (error) {
        console.error("Error calling Gemini API for summary generation:", error);
        throw new Error("The AI model failed to generate a summary.");
    }
}

export async function extractReferences(apiKey: string, textContent: string): Promise<string> {
    try {
        const ai = new GoogleGenAI({ apiKey: apiKey });
        const fullPrompt = `${REFERENCES_PROMPT}\n\n---\n\n${textContent}`;
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: fullPrompt,
        });

        return response.text;
    } catch (error) {
        console.error("Error calling Gemini API for reference extraction:", error);
        throw new Error("The AI model failed to extract references.");
    }
}

export function createChatSession(apiKey: string, paperContent: string): Chat {
    const ai = new GoogleGenAI({ apiKey: apiKey });
    const model = 'gemini-2.5-flash';
    const chat = ai.chats.create({
      model: model,
      config: {
        systemInstruction: `${CHAT_SYSTEM_INSTRUCTION}\n\nHERE IS THE PAPER CONTENT:\n---\n${paperContent}`,
      },
    });
    return chat;
}

export async function analyzeReference(apiKey: string, referenceText: string): Promise<string> {
    try {
        const ai = new GoogleGenAI({ apiKey: apiKey });
        const prompt = `You are an expert research assistant. Your task is to find and analyze the following reference using Google Search.

Reference to analyze: "${referenceText}"

**Instructions:**

1. Use Google Search to locate the content of the reference.
2. Determine if the content is a scientific research paper or a general web article (e.g., blog post, news, website).

3. **If the content is a research paper:**
   Provide a **structured summary** by answering the following questions. Each answer must be concise, with a maximum of 2-3 sentences. Use the following bolded headings for each section. Do not add any bullet points or other list formatting.

    **Motivation & Research Question:** What do the author(s) want to know or solve? What is the study’s main research question, purpose, or hypothesis?
    **Importance:** Why is this study important for the field or for the study population?
    **Methodology:** What did the author(s) do? Describe their approach, methods, and procedures.
    **Methodological Justification:** Why was it done this way? What context from the field justifies this approach?
    **Results:** What do the results show? Summarize the key findings.
    **Interpretation & Discussion:** How did the author(s) interpret these results? What is their main discussion?
    **Limitations:** What are the study’s acknowledged limitations?
    **Future Work:** What do the author(s) suggest should be done next?

4. **If the content is a general web article:**
   Provide a concise, one-paragraph summary of its main points.

5. Format your response in well-formatted Markdown.`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                tools: [{ googleSearch: {} }],
            },
        });
        
        let resultText = response.text;
        
        const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
        if (groundingChunks && groundingChunks.length > 0) {
            const sources = groundingChunks
                .map((chunk: any) => chunk.web)
                .filter((web: any) => web && web.uri)
                .map((web: any) => `[${web.title || web.uri}](${web.uri})`);
            
            if (sources.length > 0) {
                 const uniqueSources = [...new Set(sources)];
                 resultText += `\n\n**Sources:**\n${uniqueSources.join('\n')}`;
            }
        }

        return resultText;

    } catch (error) {
        console.error("Error calling Gemini API for reference analysis:", error);
        throw new Error("The AI model failed to analyze the reference using Google Search.");
    }
}

export async function synthesizeNotes(apiKey: string, notesContent: string): Promise<string> {
    try {
        const ai = new GoogleGenAI({ apiKey: apiKey });
        const fullPrompt = `${SYNTHESIZE_NOTES_PROMPT}\n\n---\n\nHERE ARE THE NOTES TO SYNTHESIZE:\n${notesContent}`;
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: fullPrompt,
        });

        return response.text;
    } catch (error) {
        console.error("Error calling Gemini API for note synthesis:", error);
        throw new Error("The AI model failed to synthesize the notes.");
    }
}

export async function explainImageSelection(apiKey: string, base64ImageData: string): Promise<string> {
    try {
        const ai = new GoogleGenAI({ apiKey: apiKey });
        const imagePart = {
            inlineData: {
                // The base64 string from canvas.toDataURL() includes the prefix "data:image/png;base64,"
                // We need to extract just the data part.
                data: base64ImageData.split(',')[1],
                mimeType: 'image/png', // canvas.toDataURL() defaults to png
            },
        };
        const textPart = {
            text: EXPLAIN_FIGURE_PROMPT,
        };

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash', // This model is multimodal
            contents: { parts: [imagePart, textPart] },
        });

        return response.text;
    } catch (error) {
        console.error("Error calling Gemini API for figure explanation:", error);
        throw new Error("The AI model failed to explain the figure.");
    }
}
