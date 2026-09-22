# GovLens Production Deploy Runbook (single Ubuntu server)

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
