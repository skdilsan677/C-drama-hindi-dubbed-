export enum AppState {
  IDLE = 'IDLE',
  ANALYZING = 'ANALYZING', // Extracting text and translating
  GENERATING_AUDIO = 'GENERATING_AUDIO', // TTS
  READY = 'READY', // Playback ready
  ERROR = 'ERROR'
}

export interface Language {
  code: string;
  name: string;
  voiceMale: string;
  voiceFemale: string;
}

export interface DubbingResult {
  originalTranscript: string;
  translatedText: string;
  audioData: Uint8Array | null; // Raw PCM data
  audioSampleRate: number;
  detectedGender: 'MALE' | 'FEMALE';
  voiceStyle?: string; // e.g. "Deep, raspy, slow"
}

export interface VideoFile {
  file: File;
  previewUrl: string;
}