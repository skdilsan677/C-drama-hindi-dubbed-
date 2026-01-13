import React, { useCallback } from 'react';
import { MAX_FILE_SIZE } from '../constants';

interface VideoUploaderProps {
  onFileSelected: (file: File) => void;
  isLoading: boolean;
}

export const VideoUploader: React.FC<VideoUploaderProps> = ({ onFileSelected, isLoading }) => {
  
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isLoading) return;

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      validateAndUpload(files[0]);
    }
  }, [isLoading]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndUpload(e.target.files[0]);
    }
  };

  const validateAndUpload = (file: File) => {
    // Basic video type check
    if (!file.type.startsWith('video/')) {
      alert("Please upload a valid video file.");
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      alert(`File size exceeds the limit of ${MAX_FILE_SIZE / (1024 * 1024)}MB for this demo.`);
      return;
    }

    onFileSelected(file);
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => { e.preventDefault(); }}
      className={`
        border-2 border-dashed rounded-xl p-10 text-center transition-all cursor-pointer
        ${isLoading ? 'opacity-50 cursor-not-allowed border-slate-600 bg-slate-900' : 'border-indigo-500 hover:border-indigo-400 hover:bg-slate-800 bg-slate-900'}
      `}
    >
      <input
        type="file"
        accept="video/*"
        onChange={handleChange}
        disabled={isLoading}
        className="hidden"
        id="video-input"
      />
      <label htmlFor="video-input" className="cursor-pointer flex flex-col items-center gap-4">
        <div className="p-4 bg-indigo-500/10 rounded-full">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
        </div>
        <div className="space-y-1">
            <p className="text-lg font-medium text-slate-200">
                {isLoading ? "Processing..." : "Upload a Video"}
            </p>
            <p className="text-sm text-slate-400">
                Drag & drop or click to browse (Max 1GB)
            </p>
        </div>
      </label>
    </div>
  );
};