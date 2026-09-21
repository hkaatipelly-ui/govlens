"use client";

import { useRef, useState } from "react";

interface Props {
  onCapture: (file: File) => void;
}

/** Mobile camera capture using the native camera via capture="environment". */
export default function CameraCapture({ onCapture }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        aria-label="Take a photo of the document"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setError(null);
          onCapture(file);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => {
          setError(null);
          try {
            inputRef.current?.click();
          } catch {
            setError("Camera is not available. Please upload a photo instead.");
          }
        }}
        className="gov-btn-primary w-full !text-lg"
      >
        <span aria-hidden>📷</span> Capture Document
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm font-semibold text-gov-red">
          {error}
        </p>
      )}
    </div>
  );
}
