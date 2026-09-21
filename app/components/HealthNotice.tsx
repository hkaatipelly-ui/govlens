"use client";

import { useEffect, useState } from "react";
import { apiHealth } from "../services/api";

/** Gov-styled local-AI status banner. Silent when AI is healthy. */
export default function HealthNotice() {
  const [health, setHealth] = useState<{ ok: boolean; detail: string; model: string } | null>(null);

  useEffect(() => {
    apiHealth()
      .then((h) => setHealth(h))
      .catch(() =>
        setHealth({ ok: false, model: "gemma3:4b", detail: "Could not reach the GovLens server." })
      );
  }, []);

  if (!health || health.ok) return null;

  return (
    <div role="alert" className="gov-container pt-3">
      <div className="rounded-gov border-2 border-gov-red bg-red-50 p-4">
        <p className="font-bold text-gov-red">⚠ Local AI unavailable</p>
        <p className="mt-1 text-sm">{health.detail}</p>
        <p className="mt-1 text-xs text-gov-muted">
          GovLens runs on Ollama ({health.model}) at localhost:11434. Start it with{" "}
          <code>ollama serve</code> + <code>ollama pull {health.model}</code>. Nothing is sent to
          the cloud.
        </p>
      </div>
    </div>
  );
}
