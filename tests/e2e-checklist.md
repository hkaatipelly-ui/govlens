# GovLens — Manual End-to-End Test Checklist

Run against `npm run dev` (or `npm run dev:lan` for phone testing) with
`ollama serve` + `ollama pull gemma3:4b` running.

Backend: `GET /api/health` must show `{"status":"ok","ollama":true,...}`.

## Citizen flow (phone or desktop browser)
- [ ] 1. Open GovLens home — portal header, hero, services render.
- [ ] 2. Tap **Scan a Document** → capture or upload a photo (or use a printed acknowledgement).
- [ ] 3. OCR text appears in **Extracted Text** (correct it if needed).
- [ ] 4. Tap **Understand Document** → processing tracker runs → redirects to **Result**.
- [ ] 5. Result shows: title/department/reference, WHAT THIS DOCUMENT MEANS,
      IMPORTANT INFORMATION table, DOCUMENTS REQUIRED, action steps.
- [ ] 6. OFFICIAL INFORMATION panel lists real source(s) with department, state,
      last-verified (green panel, distinct from AI content).
- [ ] 7. Ask **"What documents do I need?"** → grounded answer with source IDs.
- [ ] 8. Switch header language to **తెలుగు**, ask in Telugu → Telugu grounded answer.
- [ ] 9. Tap **🔊 తెలుగులో వినండి** → answer is read aloud.
- [ ] 10. Tap **Create Case for Caseworker** → success panel with links.

## Caseworker flow (laptop browser, same URL)
- [ ] 11. Open **Caseworker Portal** → stats + new row in the register.
- [ ] 12. **Open →** case detail: LEFT original OCR text, RIGHT summary, extracted
      info, required docs/actions, verification signals, official sources.
- [ ] 13. Change status via dropdown → persists after reload (PATCH /api/cases/:id).

## Error states
- [ ] Stop Ollama → banner **Local AI unavailable**, analyze/ask return HTTP 503
      with setup instructions (no fake data).
- [ ] Empty OCR text → analyze returns HTTP 400/422 with a clear message.
- [ ] Off-corpus question (e.g. "capital of France") → exact sentence
      "I could not verify this from the official information available to GovLens."

## Phone → laptop (same Wi-Fi)
- [ ] On Mac: `npm run dev:lan`, note the Mac IP (System Settings → Wi-Fi).
- [ ] On phone browser: `http://<mac-ip>:3000` → full citizen flow works.
- [ ] On laptop: same URL → case appears in Caseworker Portal.
- [ ] Confirm the phone browser never contacts `:11434` (DevTools network tab).
