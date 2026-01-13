import { Language } from './types';

// Max video size in bytes (1GB)
export const MAX_FILE_SIZE = 1024 * 1024 * 1024; 

export const SOURCE_LANGUAGES = [
  { code: 'auto', name: 'Auto-Detect' },
  { code: 'hi', name: 'Hindi' },
  { code: 'bn', name: 'Bengali' },
  { code: 'en', name: 'English' },
  { code: 'zh', name: 'Chinese (Mandarin)' },
  { code: 'ko', name: 'Korean' },
  { code: 'ja', name: 'Japanese' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'ru', name: 'Russian' },
];

export const SUPPORTED_LANGUAGES: Language[] = [
  { code: 'hi', name: 'Hindi', voiceMale: 'Puck', voiceFemale: 'Kore' },
  { code: 'bn', name: 'Bengali', voiceMale: 'Fenrir', voiceFemale: 'Charon' },
  { code: 'en', name: 'English', voiceMale: 'Puck', voiceFemale: 'Kore' },
  { code: 'zh', name: 'Chinese', voiceMale: 'Fenrir', voiceFemale: 'Charon' },
  { code: 'ko', name: 'Korean', voiceMale: 'Puck', voiceFemale: 'Kore' },
  { code: 'es', name: 'Spanish', voiceMale: 'Fenrir', voiceFemale: 'Kore' },
  { code: 'fr', name: 'French', voiceMale: 'Fenrir', voiceFemale: 'Charon' },
  { code: 'de', name: 'German', voiceMale: 'Puck', voiceFemale: 'Kore' },
  { code: 'it', name: 'Italian', voiceMale: 'Puck', voiceFemale: 'Kore' },
  { code: 'ja', name: 'Japanese', voiceMale: 'Fenrir', voiceFemale: 'Kore' },
  { code: 'pt', name: 'Portuguese', voiceMale: 'Fenrir', voiceFemale: 'Charon' },
];

export const MODEL_VISION = 'gemini-2.0-flash-exp';
export const MODEL_TTS = 'gemini-2.5-flash-preview-tts';