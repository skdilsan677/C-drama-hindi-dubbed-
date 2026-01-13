import { GoogleGenAI, Modality, Type } from "@google/genai";
import { MODEL_VISION, MODEL_TTS } from '../constants';
import { DubbingResult, Language } from '../types';
import { base64ToUint8Array } from './audioUtils';

// Helper to convert File to Base64
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      // Remove the Data-URI prefix (e.g. "data:video/mp4;base64,")
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
  });
};

export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      throw new Error("API Key is missing. Please set process.env.API_KEY.");
    }
    this.ai = new GoogleGenAI({ apiKey });
  }

  private handleError(e: any, context: string): never {
    console.error(`Error in ${context}:`, e);
    const msg = (e.message || e.toString()).toLowerCase();
    
    if (msg.includes('401') || msg.includes('api key')) {
      throw new Error("Invalid API Key. Please check your configuration.");
    }
    if (msg.includes('403') || msg.includes('permission')) {
      throw new Error("Permission denied. Your API key may not have access to this model.");
    }
    if (msg.includes('429') || msg.includes('quota') || msg.includes('resource exhausted')) {
      throw new Error("API Quota exceeded. Please try again later.");
    }
    if (msg.includes('500') || msg.includes('internal')) {
        throw new Error("Gemini internal server error. Please retry.");
    }
    if (msg.includes('503') || msg.includes('overloaded')) {
      throw new Error("Gemini service is currently overloaded. Please try again in a moment.");
    }
    if (msg.includes('safety') || msg.includes('blocked')) {
      throw new Error("The content was blocked by safety filters. Please ensure the video is appropriate.");
    }
    if (msg.includes('location') || msg.includes('not supported in your region')) {
        throw new Error("Gemini API is not available in your region.");
    }
    if (msg.includes('candidate') && msg.includes('finishreason')) {
        throw new Error("Model stopped generating unexpectedly (Safety/Recitation).");
    }

    throw new Error(`Failed to ${context}. ${e.message?.slice(0, 100) || "Unknown error"}...`);
  }

  /**
   * Step 1: Analyze video to get transcript, translation, gender, and voice style.
   */
  async analyzeAndTranslate(
    videoFile: File, 
    targetLang: Language, 
    sourceLangName: string = 'Auto-Detect'
  ): Promise<{ transcript: string, translatedText: string, gender: 'MALE' | 'FEMALE', voiceStyle: string }> {
    try {
        const videoBase64 = await fileToBase64(videoFile);
        
        const sourceInstruction = sourceLangName !== 'Auto-Detect' 
            ? `The video audio is in ${sourceLangName}.` 
            : "Detect the language of the video audio automatically.";

        const prompt = `
          You are a professional dubbing translator and audio engineer.
          
          Task:
          1. ${sourceInstruction}
          2. Identify the gender of the main speaker (Return "MALE" or "FEMALE").
          3. Analyze the speaker's voice style (tone, pitch, speed, emotion). Describe it in 3-5 adjectives (e.g., "deep, authoritative, slow" or "high-pitched, excited, fast").
          4. Transcribe the spoken content accurately.
          5. "Auto-fix": STRICTLY clean up the transcript (remove stutters/fillers).
          6. Translate the cleaned speech into ${targetLang.name}.
          
          Return JSON conforming to the schema.
        `;

        const response = await this.ai.models.generateContent({
          model: MODEL_VISION,
          contents: {
            parts: [
              { inlineData: { mimeType: videoFile.type, data: videoBase64 } },
              { text: prompt }
            ]
          },
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                speaker_gender: { type: Type.STRING, enum: ["MALE", "FEMALE"] },
                voice_style: { type: Type.STRING },
                original_transcript: { type: Type.STRING },
                translated_text: { type: Type.STRING }
              },
              required: ["speaker_gender", "original_transcript", "translated_text"]
            }
          }
        });

        let text = response.text || "{}";
        
        // Clean up potential markdown formatting that might persist
        text = text.replace(/^```json\s*/, "").replace(/```$/, "").trim();

        const json = JSON.parse(text);
        const genderStr = json.speaker_gender?.toUpperCase();
        const gender: 'MALE' | 'FEMALE' = (genderStr === 'FEMALE') ? 'FEMALE' : 'MALE';

        return {
          transcript: json.original_transcript || "No transcript detected.",
          translatedText: json.translated_text || "No translation generated.",
          gender: gender,
          voiceStyle: json.voice_style || "neutral"
        };

    } catch (e: any) {
        // Specific JSON parse error handling
        if (e instanceof SyntaxError) {
             throw new Error("Failed to parse AI response. The model might have been interrupted.");
        }
        this.handleError(e, "analyze video");
    }
  }

  /**
   * Step 2: Generate Audio from Text (TTS)
   */
  async generateSpeech(
    text: string, 
    targetLang: Language, 
    gender: 'MALE' | 'FEMALE',
    voiceStyle: string,
    useCloning: boolean
  ): Promise<DubbingResult> {
    try {
        if (!text || text.trim().length === 0) {
          throw new Error("No text to generate speech from.");
        }

        // Select voice based on gender
        const voiceName = gender === 'FEMALE' ? targetLang.voiceFemale : targetLang.voiceMale;

        // If cloning is enabled, inject the style into the text prompt as a stage direction
        const finalPrompt = useCloning 
          ? `(Speaking in a ${voiceStyle} tone) ${text}` 
          : text;

        const response = await this.ai.models.generateContent({
          model: MODEL_TTS,
          contents: {
            parts: [{ text: finalPrompt }]
          },
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: voiceName }
              }
            }
          }
        });

        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!base64Audio) {
          throw new Error("No audio data returned from Gemini.");
        }

        const audioData = base64ToUint8Array(base64Audio);

        return {
          originalTranscript: "", // Filled by caller
          translatedText: text,
          audioData: audioData,
          audioSampleRate: 24000,
          detectedGender: gender,
          voiceStyle: voiceStyle
        };
    } catch (e) {
        this.handleError(e, "generate speech");
    }
  }
}