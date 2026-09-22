# GovLens Production Deploy Runbook (single Ubuntu server)

> DEMO ALTERNATIVE (no VPS): tunnel this Mac to the public internet.
> App + Ollama + Gemma all stay local; phones reach it over HTTPS.
> See "Option B — Public tunnel to this Mac (demo)" below.

Architecture: Internet → Nginx (:443) → Next.js (:3000) → Ollama
(`localhost:11434`, never public) → Gemma 3 4B → SQLite.

## 0. Prerequisites (on your machine)

- `gh` authenticated (already: `gh auth status`)
- SSH access to the server (`ssh ubuntu@<server-ip>`)

## 1. Server prep (Ubuntu 22.04+)

```bash
sudo apt update && sudo apt install -y nodejs npm nginx
node --version   # need >= 20
```

## 2. Ollama + Gemma (internal only)

```bash
curl -fsSL https://ollama.com/install.sh | sh
sudo systemctl enable --now ollama
ollama pull gemma3:4b
ollama list                       # must show gemma3:4b
curl http://localhost:11434/api/tags
sudo ufw deny 11434               # NEVER expose Ollama publicly
sudo ufw allow 22,80,443/tcp
```

## 3. App

```bash
sudo useradd -m -s /bin/bash govlens
sudo mkdir -p /opt/govlens /opt/govlens/data
sudo chown -R govlens:govlens /opt/govlens
# as govlens:
cd /opt/govlens && git clone <repo-url> .   # branch: main
cp deploy/env.production.example .env.production  # edit values, chmod 600
npm install
npm run lint && npm run build
```

## 4. Process + proxy

```bash
sudo cp deploy/govlens.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now govlens
sudo cp deploy/nginx-govlens.conf /etc/nginx/sites-available/govlens
sudo ln -s /etc/nginx/sites-available/govlens /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
# HTTPS: sudo apt install -y certbot python3-certbot-nginx && sudo certbot --nginx
```

## 5. Verify (from your machine/laptop)

```bash
curl https://<server>/api/health
# {"status":"ok","ollama":true,"modelAvailable":true,"model":"gemma3:4b"}
```

Then run the full demo flow in the browser (upload → verify → ask in
Telugu → case → caseworker) per `tests/e2e-checklist.md`.

## Start / restart commands

```bash
sudo systemctl restart govlens   # app
sudo systemctl restart ollama    # AI server
sudo journalctl -u govlens -f    # logs
```

---

## Option B — Public tunnel to this Mac (demo, no VPS, no cloud AI)

Keeps everything local: public HTTPS → Mac Next.js (`:3000`) → Mac Ollama
(`localhost:11434`) → Gemma 3 4B → SQLite. No remote server, no cloud AI.

```bash
# 1. Production server bound to all interfaces (from the repo dir)
./node_modules/.bin/next start -H 0.0.0.0 -p 3000

# 2. Ollama must be running locally
ollama serve
curl http://localhost:11434/api/tags   # gemma3:4b must appear

# 3. Public URL (anonymous quick tunnel; URL changes each restart)
cloudflared tunnel --url http://localhost:3000
# → https://<name>.trycloudflare.com

# 4. Verify through the public URL
curl https://<name>.trycloudflare.com/api/health
# {"status":"ok","ollama":true,"modelAvailable":true,"model":"gemma3:4b"}
```

Restart: repeat steps 1–3 (tunnel URL changes; update the demo link).
Caveats: quick tunnels have no uptime guarantee; keep the Mac awake and on
the same network path; Ollama stays bound to localhost (never exposed).
For a stable URL + production use, follow the VPS runbook above instead.
