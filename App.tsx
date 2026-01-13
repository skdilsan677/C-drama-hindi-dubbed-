import React, { useState, useMemo } from 'react';
import { VideoUploader } from './components/VideoUploader';
import { DubbedPlayer } from './components/DubbedPlayer';
import { SUPPORTED_LANGUAGES, SOURCE_LANGUAGES } from './constants';
import { AppState, VideoFile, DubbingResult, Language } from './types';
import { GeminiService } from './services/geminiService';

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(AppState.IDLE);
  const [videoFile, setVideoFile] = useState<VideoFile | null>(null);
  
  // Settings
  const [targetLang, setTargetLang] = useState<Language>(SUPPORTED_LANGUAGES[0]);
  const [sourceLangCode, setSourceLangCode] = useState<string>('auto');
  const [isCloningEnabled, setIsCloningEnabled] = useState<boolean>(false);
  const [bgAudioFile, setBgAudioFile] = useState<File | null>(null);

  const [result, setResult] = useState<DubbingResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [progressMsg, setProgressMsg] = useState<string>("");

  const geminiService = useMemo(() => {
    try {
        return new GeminiService();
    } catch (e) {
        console.error(e);
        return null;
    }
  }, []);

  const handleFileSelected = (file: File) => {
    const url = URL.createObjectURL(file);
    setVideoFile({ file, previewUrl: url });
    setResult(null);
    setState(AppState.IDLE);
    setErrorMsg(null);
  };

  const handleBgAudioSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
        setBgAudioFile(e.target.files[0]);
    }
  };

  const handleDubbing = async () => {
    if (!videoFile || !geminiService) return;
    
    setState(AppState.ANALYZING);
    setErrorMsg(null);
    setProgressMsg("Analyzing video, detecting speaker gender & style, and cleaning transcript...");

    try {
      const sourceLangName = SOURCE_LANGUAGES.find(s => s.code === sourceLangCode)?.name || 'Auto-Detect';

      // 1. Analyze (Includes Style Extraction)
      const analysis = await geminiService.analyzeAndTranslate(videoFile.file, targetLang, sourceLangName);
      
      setProgressMsg(`Generating voice: ${analysis.gender} / Style: "${analysis.voiceStyle}"...`);
      setState(AppState.GENERATING_AUDIO);

      // 2. TTS (with Cloning/Style param)
      const dubbingResult = await geminiService.generateSpeech(
          analysis.translatedText, 
          targetLang, 
          analysis.gender,
          analysis.voiceStyle,
          isCloningEnabled
      );
      dubbingResult.originalTranscript = analysis.transcript;
      
      setResult(dubbingResult);
      setState(AppState.READY);
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e.message || "An unknown error occurred");
      setState(AppState.ERROR);
    }
  };

  const handleReset = () => {
    setState(AppState.IDLE);
    setVideoFile(null);
    setResult(null);
    setErrorMsg(null);
    setBgAudioFile(null);
  };

  const downloadText = (text: string, filename: string) => {
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!geminiService) {
      return (
          <div className="min-h-screen flex items-center justify-center text-center p-4">
              <div className="max-w-md bg-red-900/20 border border-red-500/50 p-6 rounded-lg text-red-200">
                  <h1 className="text-xl font-bold mb-2">Configuration Error</h1>
                  <p>API Key is missing. This app requires a valid Google GenAI API Key in the environment variables.</p>
              </div>
          </div>
      )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
            </div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
              GeminiDub Studio
            </h1>
          </div>
          <a href="https://ai.google.dev" target="_blank" rel="noreferrer" className="text-xs font-medium text-slate-500 hover:text-indigo-400 transition-colors">
            Powered by Gemini 2.5
          </a>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8 md:py-12">
        
        {!videoFile && (
          <div className="flex flex-col items-center justify-center py-12 space-y-8 animate-fade-in">
             <div className="text-center max-w-2xl mx-auto space-y-4">
                <h2 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight">
                    Translate your videos <br/>
                    <span className="text-indigo-400">with AI Voice Overs</span>
                </h2>
                <p className="text-lg text-slate-400">
                    Upload a video, choose a language, and let Gemini 2.5 generate a professional voice-over with style matching and background music.
                </p>
             </div>

             <div className="w-full max-w-xl">
                <VideoUploader onFileSelected={handleFileSelected} isLoading={false} />
             </div>
             
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl mt-12">
                {[
                    { title: "Smart Transcription", desc: "Auto-detects source language and fixes grammatical errors." },
                    { title: "Voice Style Cloning", desc: "Matches the tone and emotion of the original speaker." },
                    { title: "Audio Mixing", desc: "Mix native background music with your translations." }
                ].map((f, i) => (
                    <div key={i} className="bg-slate-900/50 border border-slate-800 p-6 rounded-xl">
                        <h3 className="font-semibold text-slate-200 mb-2">{f.title}</h3>
                        <p className="text-sm text-slate-400">{f.desc}</p>
                    </div>
                ))}
             </div>
          </div>
        )}

        {videoFile && (
            <div className="flex flex-col lg:flex-row gap-8 animate-fade-in">
                
                {/* Left Panel: Controls */}
                <div className="w-full lg:w-1/3 space-y-6">
                    <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 shadow-xl">
                         <div className="flex justify-between items-start mb-6">
                            <div>
                                <h3 className="text-lg font-semibold text-white">Project Settings</h3>
                                <p className="text-sm text-slate-400 truncate max-w-[200px]">{videoFile.file.name}</p>
                            </div>
                            <button 
                                onClick={handleReset}
                                className="text-xs text-red-400 hover:text-red-300 underline"
                            >
                                Change Video
                            </button>
                         </div>

                         <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-2">Original Language</label>
                                <div className="relative">
                                    <select
                                        value={sourceLangCode}
                                        onChange={(e) => setSourceLangCode(e.target.value)}
                                        disabled={state !== AppState.IDLE && state !== AppState.READY}
                                        className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-3 appearance-none focus:ring-2 focus:ring-indigo-500 transition-all"
                                    >
                                        {SOURCE_LANGUAGES.map(l => (
                                            <option key={l.code} value={l.code}>{l.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-2">Target Language</label>
                                <div className="relative">
                                    <select
                                        value={targetLang.code}
                                        onChange={(e) => {
                                            const l = SUPPORTED_LANGUAGES.find(lang => lang.code === e.target.value);
                                            if (l) setTargetLang(l);
                                        }}
                                        disabled={state !== AppState.IDLE && state !== AppState.READY}
                                        className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-3 appearance-none focus:ring-2 focus:ring-indigo-500 transition-all"
                                    >
                                        {SUPPORTED_LANGUAGES.map(l => (
                                            <option key={l.code} value={l.code}>{l.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* New Features Control Group */}
                            <div className="bg-slate-950/50 p-4 rounded-lg border border-slate-800 space-y-4">
                                {/* Voice Cloning Toggle */}
                                <div className="flex items-center justify-between">
                                    <div>
                                        <label className="text-sm font-medium text-slate-200 block">Voice Style Cloning</label>
                                        <span className="text-xs text-slate-500">Match tone & emotion</span>
                                    </div>
                                    <button 
                                        onClick={() => setIsCloningEnabled(!isCloningEnabled)}
                                        disabled={state !== AppState.IDLE && state !== AppState.READY}
                                        className={`w-12 h-6 rounded-full transition-colors relative ${isCloningEnabled ? 'bg-indigo-600' : 'bg-slate-700'}`}
                                    >
                                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${isCloningEnabled ? 'left-7' : 'left-1'}`} />
                                    </button>
                                </div>

                                {/* Background Audio Upload */}
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-2">Background Music (Optional)</label>
                                    <input 
                                        type="file" 
                                        accept="audio/*" 
                                        onChange={handleBgAudioSelected}
                                        disabled={state !== AppState.IDLE && state !== AppState.READY}
                                        className="w-full text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-indigo-400 hover:file:bg-slate-700"
                                    />
                                    {bgAudioFile && (
                                        <p className="text-xs text-emerald-400 mt-1 truncate">Loaded: {bgAudioFile.name}</p>
                                    )}
                                </div>
                            </div>
                            
                            <button
                                onClick={handleDubbing}
                                disabled={state === AppState.ANALYZING || state === AppState.GENERATING_AUDIO}
                                className={`
                                    w-full py-3.5 rounded-lg font-semibold text-white shadow-lg transition-all
                                    ${state === AppState.IDLE || state === AppState.READY || state === AppState.ERROR
                                        ? 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-500/20' 
                                        : 'bg-slate-700 cursor-not-allowed text-slate-400'}
                                `}
                            >
                                {state === AppState.IDLE ? 'Generate Dub' :
                                 state === AppState.ANALYZING ? 'Analyzing & Fixing...' :
                                 state === AppState.GENERATING_AUDIO ? 'Synthesizing Voice...' :
                                 state === AppState.READY ? 'Regenerate Dub' :
                                 'Retry'}
                            </button>

                            {/* Status Messages */}
                            {state !== AppState.IDLE && state !== AppState.READY && state !== AppState.ERROR && (
                                <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-lg animate-pulse">
                                    <div className="flex items-center gap-3">
                                        <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                                        <p className="text-sm text-indigo-300">{progressMsg}</p>
                                    </div>
                                </div>
                            )}

                            {state === AppState.ERROR && errorMsg && (
                                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                                    <p className="text-sm text-red-300">Error: {errorMsg}</p>
                                </div>
                            )}
                         </div>
                    </div>

                    {/* Transcripts Display with Downloads */}
                    {result && (
                        <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 shadow-xl max-h-[400px] overflow-y-auto">
                            <div className="flex flex-wrap items-center gap-2 mb-4 justify-between">
                                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Analysis & Downloads</h3>
                                <div className="flex gap-2">
                                     {result.detectedGender && (
                                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${result.detectedGender === 'MALE' ? 'bg-blue-900/50 text-blue-200' : 'bg-pink-900/50 text-pink-200'}`}>
                                            {result.detectedGender}
                                        </span>
                                    )}
                                    {result.voiceStyle && isCloningEnabled && (
                                        <span className="text-xs px-2 py-0.5 rounded font-medium bg-indigo-900/50 text-indigo-200 truncate max-w-[150px]" title={result.voiceStyle}>
                                            Style: {result.voiceStyle}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="space-y-6">
                                <div>
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-xs text-slate-500">Original (Auto-Fixed)</span>
                                        <button 
                                            onClick={() => downloadText(result.originalTranscript, 'original_transcript.txt')}
                                            className="text-xs text-indigo-400 hover:text-indigo-300 underline"
                                        >
                                            Download
                                        </button>
                                    </div>
                                    <p className="text-sm text-slate-300 leading-relaxed italic border-l-2 border-slate-700 pl-3">
                                        "{result.originalTranscript}"
                                    </p>
                                </div>
                                <div>
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-xs text-indigo-400">Translated ({targetLang.name})</span>
                                        <button 
                                            onClick={() => downloadText(result.translatedText, `translated_${targetLang.code}.txt`)}
                                            className="text-xs text-indigo-400 hover:text-indigo-300 underline"
                                        >
                                            Download
                                        </button>
                                    </div>
                                    <p className="text-sm text-white leading-relaxed font-medium border-l-2 border-indigo-500 pl-3">
                                        "{result.translatedText}"
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Panel: Player */}
                <div className="w-full lg:w-2/3">
                    {result ? (
                        <div className="space-y-4">
                             <DubbedPlayer 
                                videoUrl={videoFile.previewUrl}
                                audioData={result.audioData!}
                                sampleRate={result.audioSampleRate}
                                backgroundAudioFile={bgAudioFile}
                             />
                             <p className="text-center text-xs text-slate-500 mt-4">
                                Use the sliders to mix Voice, Music, and Original Audio.
                             </p>
                        </div>
                    ) : (
                        <div className="aspect-video bg-black rounded-xl overflow-hidden shadow-2xl relative group">
                            <video 
                                src={videoFile.previewUrl} 
                                className="w-full h-full object-contain opacity-50 group-hover:opacity-80 transition-opacity duration-500"
                                controls={false}
                            />
                            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                                <span className="inline-block p-4 bg-slate-800/80 backdrop-blur-sm rounded-full mb-4">
                                    <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </span>
                                <p className="text-slate-300 font-light">Preview Mode</p>
                                <p className="text-sm text-slate-500 mt-2">Configure settings on the left to start.</p>
                            </div>
                        </div>
                    )}
                </div>

            </div>
        )}
      </main>
    </div>
  );
};

export default App;