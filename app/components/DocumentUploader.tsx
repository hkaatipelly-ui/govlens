"use client";

import { useRef } from "react";

interface Props {
  onSelect: (file: File) => void;
}

export default function DocumentUploader({ onSelect }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label="Upload a document image"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onSelect(file);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="gov-btn-outline w-full !text-lg"
      >
        <span aria-hidden>📤</span> Upload from Device
      </button>
      <p className="mt-1 text-center text-xs text-gov-muted">
        JPG or PNG photo of the government document
      </p>
    </div>
  );
}
