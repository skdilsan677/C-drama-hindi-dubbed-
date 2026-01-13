import React, { useEffect, useRef, useState } from 'react';
import { decodeAudioData, createWavBlob } from '../services/audioUtils';

interface DubbedPlayerProps {
  videoUrl: string;
  audioData: Uint8Array;
  sampleRate: number;
  backgroundAudioFile?: File | null;
}

export const DubbedPlayer: React.FC<DubbedPlayerProps> = ({ videoUrl, audioData, sampleRate, backgroundAudioFile }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  
  // Nodes for TTS Voice
  const voiceSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const voiceGainRef = useRef<GainNode | null>(null);
  const voiceBufferRef = useRef<AudioBuffer | null>(null);

  // Nodes for Background Audio
  const bgSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const bgGainRef = useRef<GainNode | null>(null);
  const bgBufferRef = useRef<AudioBuffer | null>(null);

  // Nodes for Original Video Audio
  const originalSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const originalGainRef = useRef<GainNode | null>(null);
  
  // Recording / Export
  const destRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [renderType, setRenderType] = useState<'video' | 'audio' | null>(null);
  
  // Added state for seeking and duration
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Volumes
  const [volume, setVolume] = useState(1);
  const [bgVolume, setBgVolume] = useState(0.2);
  const [originalVolume, setOriginalVolume] = useState(0.5);

  // Mute States
  const [isVoiceMuted, setIsVoiceMuted] = useState(false);
  const [isBgMuted, setIsBgMuted] = useState(false);
  const [isOriginalMuted, setIsOriginalMuted] = useState(false);

  // 1. Initialize Audio Context
  useEffect(() => {
    const CtxClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!audioContextRef.current) {
        audioContextRef.current = new CtxClass();
    }
    const ctx = audioContextRef.current;

    // Create Gain Nodes early
    if (!voiceGainRef.current) voiceGainRef.current = ctx.createGain();
    if (!bgGainRef.current) bgGainRef.current = ctx.createGain();
    if (!originalGainRef.current) originalGainRef.current = ctx.createGain();

    // Connect to destination by default
    voiceGainRef.current.connect(ctx.destination);
    bgGainRef.current.connect(ctx.destination);
    originalGainRef.current.connect(ctx.destination);
    
    // Set initial volumes
    voiceGainRef.current.gain.value = volume;
    bgGainRef.current.gain.value = bgVolume;
    originalGainRef.current.gain.value = originalVolume;

    return () => {
      // Cleanup? Usually context is kept alive in SPA
    };
  }, []);

  // 2. Decode TTS Data
  useEffect(() => {
    let active = true;
    const decodeTTS = async () => {
      if (!audioContextRef.current) return;
      try {
        const buffer = await decodeAudioData(audioData, audioContextRef.current, sampleRate);
        if (active) {
            voiceBufferRef.current = buffer;
            setIsReady(true);
        }
      } catch (e) {
        console.error("Audio decoding error", e);
      }
    };
    if (audioData) decodeTTS();
    return () => { active = false; };
  }, [audioData, sampleRate]);

  // 3. Decode Background Audio
  useEffect(() => {
    const loadBg = async () => {
        if (!backgroundAudioFile || !audioContextRef.current) {
            bgBufferRef.current = null;
            return;
        }
        try {
            const arrayBuffer = await backgroundAudioFile.arrayBuffer();
            const buffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
            bgBufferRef.current = buffer;
        } catch (e) {
            console.error("Failed to decode background audio", e);
        }
    };
    loadBg();
  }, [backgroundAudioFile]);

  // 4. Connect Original Video Audio to Web Audio Graph
  useEffect(() => {
    if (!videoRef.current || !audioContextRef.current || originalSourceRef.current) return;
    
    try {
        const source = audioContextRef.current.createMediaElementSource(videoRef.current);
        source.connect(originalGainRef.current!);
        originalSourceRef.current = source;
    } catch (e) {
        // Source already connected or error
        console.warn("MediaElementSource error:", e);
    }
  }, [videoRef, audioContextRef]);

  // --- Playback Logic ---

  const stopSources = () => {
     if (voiceSourceRef.current) {
        try { voiceSourceRef.current.stop(); } catch(e) {}
        voiceSourceRef.current.disconnect();
        voiceSourceRef.current = null;
     }
     if (bgSourceRef.current) {
        try { bgSourceRef.current.stop(); } catch(e) {}
        bgSourceRef.current.disconnect();
        bgSourceRef.current = null;
     }
  };

  const play = async () => {
    if (!videoRef.current || !audioContextRef.current) return;
    if (audioContextRef.current.state === 'suspended') await audioContextRef.current.resume();

    stopSources();

    const currentVidTime = videoRef.current.currentTime;
    const ctx = audioContextRef.current;

    // Start Voice
    if (voiceBufferRef.current) {
        const source = ctx.createBufferSource();
        source.buffer = voiceBufferRef.current;
        source.connect(voiceGainRef.current!);
        voiceSourceRef.current = source;
        // Simple sync: start at offset. If offset > duration, it won't play.
        if (currentVidTime < voiceBufferRef.current.duration) {
             source.start(0, currentVidTime);
        }
    }

    // Start Background
    if (bgBufferRef.current) {
        const source = ctx.createBufferSource();
        source.buffer = bgBufferRef.current;
        source.loop = true;
        source.connect(bgGainRef.current!);
        bgSourceRef.current = source;
        const bgOffset = currentVidTime % bgBufferRef.current.duration;
        source.start(0, bgOffset);
    }

    videoRef.current.play();
    setIsPlaying(true);
  };

  const pause = () => {
    if (videoRef.current) videoRef.current.pause();
    stopSources();
    setIsPlaying(false);
  };

  const togglePlay = () => {
    if (isPlaying) pause();
    else play();
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (videoRef.current) {
        videoRef.current.currentTime = time;
        // If playing, restart audio to sync with new time
        if (isPlaying) {
            play();
        }
    }
  };

  // --- Volume & Mute Effects ---
  useEffect(() => {
    if (voiceGainRef.current) 
        voiceGainRef.current.gain.value = isVoiceMuted ? 0 : volume;
  }, [volume, isVoiceMuted]);

  useEffect(() => {
    if (bgGainRef.current) 
        bgGainRef.current.gain.value = isBgMuted ? 0 : bgVolume;
  }, [bgVolume, isBgMuted]);

  useEffect(() => {
    if (originalGainRef.current) 
        originalGainRef.current.gain.value = isOriginalMuted ? 0 : originalVolume;
  }, [originalVolume, isOriginalMuted]);


  // --- Export Logic ---
  const performExport = async (type: 'video' | 'audio') => {
    if (!videoRef.current || !audioContextRef.current || !voiceBufferRef.current) return;
    
    setIsRendering(true);
    setRenderType(type);
    pause(); 
    
    const ctx = audioContextRef.current;
    const dest = ctx.createMediaStreamDestination();
    destRef.current = dest;

    // Route Gains to Recorder Destination
    voiceGainRef.current?.connect(dest);
    bgGainRef.current?.connect(dest);
    originalGainRef.current?.connect(dest);

    let streamToRecord: MediaStream;

    if (type === 'video') {
         // @ts-ignore
         const videoStream = videoRef.current.captureStream ? videoRef.current.captureStream() : (videoRef.current as any).mozCaptureStream ? (videoRef.current as any).mozCaptureStream() : null;
         if (!videoStream) {
             alert("Video capture is not supported in this browser.");
             setIsRendering(false);
             return;
         }
         streamToRecord = new MediaStream([
             ...videoStream.getVideoTracks(),
             ...dest.stream.getAudioTracks()
         ]);
    } else {
         // Audio only stream
         streamToRecord = dest.stream;
    }

    const mimeType = type === 'video' ? 'video/webm; codecs=vp9' : 'audio/webm';
    let recorder: MediaRecorder;
    try {
        recorder = new MediaRecorder(streamToRecord, { mimeType });
    } catch (e) {
        recorder = new MediaRecorder(streamToRecord);
    }
    
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    
    recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = type === 'video' ? 'dubbed_video_export.webm' : 'dubbed_audio_mix.webm';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        // Cleanup routing
        voiceGainRef.current?.disconnect(dest);
        bgGainRef.current?.disconnect(dest);
        originalGainRef.current?.disconnect(dest);
        
        setIsRendering(false);
        setRenderType(null);
    };

    mediaRecorderRef.current = recorder;
    recorder.start();
    
    // Play full
    videoRef.current.currentTime = 0;
    await play();

    videoRef.current.onended = () => {
        recorder.stop();
        stopSources();
        setIsPlaying(false);
        videoRef.current!.onended = () => {
            setIsPlaying(false);
            stopSources();
        };
    };
  };

  const handleDownloadTTS = () => {
    const blob = createWavBlob(audioData, sampleRate);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tts_voice_raw.wav';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full max-w-4xl mx-auto bg-slate-900 rounded-xl overflow-hidden shadow-2xl border border-slate-800">
      <div className="relative aspect-video bg-black group">
        <video
          ref={videoRef}
          src={videoUrl}
          className={`w-full h-full object-contain ${isRendering ? 'opacity-70' : ''}`}
          onEnded={() => {
              if(!isRendering) { setIsPlaying(false); stopSources(); }
          }}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          playsInline
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          crossOrigin="anonymous" 
        />
        
        {!isPlaying && isReady && !isRendering && (
            <div 
                className="absolute inset-0 flex items-center justify-center bg-black/40 cursor-pointer hover:bg-black/30 transition-colors z-10"
                onClick={play}
            >
                 <div className="bg-white/20 backdrop-blur-sm p-6 rounded-full border border-white/30 shadow-lg group-hover:scale-105 transition-transform">
                    <svg className="w-12 h-12 text-white pl-2" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                 </div>
            </div>
        )}

        {isRendering && (
             <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-20">
                <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                <h3 className="text-xl font-bold text-white">
                    {renderType === 'video' ? 'Rendering Video...' : 'Mixing Audio...'}
                </h3>
                <p className="text-sm text-slate-400 mt-2">Playing content to capture export. Please wait.</p>
             </div>
        )}
      </div>

      <div className="p-4 bg-slate-800 border-t border-slate-700">
        <div className="flex items-center gap-4 mb-6">
             <button
                onClick={togglePlay}
                disabled={!isReady || isRendering}
                className="p-2 rounded-full hover:bg-slate-700 text-white transition disabled:opacity-50"
             >
                {isPlaying ? (
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                ) : (
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                )}
             </button>
             
             <input
                type="range"
                min="0"
                max={duration || 100}
                step="0.1"
                value={currentTime}
                onChange={handleSeek}
                disabled={isRendering}
                className="flex-1 h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-indigo-500 disabled:opacity-50"
             />
             
             <div className="flex gap-2">
                 {/* Instant TTS Download */}
                 <button 
                    onClick={handleDownloadTTS}
                    disabled={isRendering || !isReady}
                    className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-700 rounded-lg text-xs font-bold text-white transition"
                    title="Download Raw TTS Audio (Instant)"
                 >
                     <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                     Save Voice
                 </button>
                 
                 {/* Mix Export */}
                 <button 
                    onClick={() => performExport('audio')}
                    disabled={isRendering || !isReady}
                    className="flex items-center gap-2 px-3 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:bg-slate-700 rounded-lg text-xs font-bold text-white transition shadow-lg shadow-emerald-500/10"
                 >
                    Export Audio
                 </button>

                 <button 
                    onClick={() => performExport('video')}
                    disabled={isRendering || !isReady}
                    className="flex items-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 rounded-lg text-xs font-bold text-white transition shadow-lg shadow-indigo-500/20"
                 >
                     Export Video
                 </button>
             </div>
        </div>

        {/* Enhanced Mixer Controls */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-slate-900/50 p-4 rounded-xl border border-slate-700/50">
            {/* AI Voice Channel */}
            <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center">
                    <span className="text-xs font-bold uppercase text-indigo-400 tracking-wider">AI Voice</span>
                    <button onClick={() => setIsVoiceMuted(!isVoiceMuted)} className={`text-xs ${isVoiceMuted ? 'text-red-400' : 'text-slate-400'}`}>
                        {isVoiceMuted ? 'UNMUTE' : 'MUTE'}
                    </button>
                </div>
                <div className="flex items-center gap-2">
                     <svg className={`w-4 h-4 ${isVoiceMuted ? 'text-slate-600' : 'text-indigo-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                     <input
                        type="range"
                        min="0"
                        max="1.5"
                        step="0.05"
                        value={volume}
                        onChange={(e) => setVolume(parseFloat(e.target.value))}
                        disabled={isVoiceMuted}
                        className={`flex-1 h-1.5 rounded-lg appearance-none cursor-pointer ${isVoiceMuted ? 'bg-slate-700' : 'bg-indigo-900 accent-indigo-400'}`}
                    />
                </div>
            </div>
            
            {/* Background Music Channel */}
            <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center">
                    <span className="text-xs font-bold uppercase text-emerald-400 tracking-wider">Music</span>
                    <button onClick={() => setIsBgMuted(!isBgMuted)} disabled={!backgroundAudioFile} className={`text-xs ${isBgMuted ? 'text-red-400' : 'text-slate-400 disabled:opacity-30'}`}>
                        {isBgMuted ? 'UNMUTE' : 'MUTE'}
                    </button>
                </div>
                <div className="flex items-center gap-2">
                     <svg className={`w-4 h-4 ${isBgMuted || !backgroundAudioFile ? 'text-slate-600' : 'text-emerald-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg>
                     <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={bgVolume}
                        onChange={(e) => setBgVolume(parseFloat(e.target.value))}
                        disabled={!backgroundAudioFile || isBgMuted}
                        className={`flex-1 h-1.5 rounded-lg appearance-none cursor-pointer ${!backgroundAudioFile || isBgMuted ? 'bg-slate-700' : 'bg-emerald-900 accent-emerald-400'}`}
                    />
                </div>
            </div>

            {/* Original Audio Channel */}
            <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center">
                    <span className="text-xs font-bold uppercase text-slate-400 tracking-wider">Original</span>
                    <button onClick={() => setIsOriginalMuted(!isOriginalMuted)} className={`text-xs ${isOriginalMuted ? 'text-red-400' : 'text-slate-500'}`}>
                        {isOriginalMuted ? 'UNMUTE' : 'MUTE'}
                    </button>
                </div>
                 <div className="flex items-center gap-2">
                     <svg className={`w-4 h-4 ${isOriginalMuted ? 'text-slate-600' : 'text-slate-300'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                     <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={originalVolume}
                        onChange={(e) => setOriginalVolume(parseFloat(e.target.value))}
                        disabled={isOriginalMuted}
                        className={`flex-1 h-1.5 rounded-lg appearance-none cursor-pointer ${isOriginalMuted ? 'bg-slate-700' : 'bg-slate-700 accent-slate-300'}`}
                    />
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};