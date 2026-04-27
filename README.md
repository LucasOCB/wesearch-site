# wesearch-site

Site institucional do WeSearch DAO em produção em [wesearchdao.xyz](https://wesearchdao.xyz).

## Stack

- HTML/CSS/JS puro (sem bundler)
- D3.js + topojson-client (vendor self-hosted, com SRI)
- **Cloudflare Pages** (Workers Static Assets) — site estático
- **Cloudflare Worker** (`wesearch-news`) — agregador RSS + APIs financeiras em `api.wesearchdao.xyz` (repo separado em `~/Downloads/wesearch-worker/`)

## Estrutura

```
public/                 # tudo que CF Pages serve em wesearchdao.xyz
├── index.html
├── 404.html
├── _headers            # security headers + cache strategy
├── favicon-32x32.png
├── assets/
│   ├── app.js          # entry point — globe, ticker, carousels
│   ├── style.css
│   ├── vendor/         # d3.min.js, topojson-client.min.js (com SRI)
│   ├── analysts/*.png  # fotos do time
│   └── wesearch-logo.png
└── data/
    ├── analistas.json
    ├── parceiros.json
    ├── eventos.json    # fallback estático
    ├── artigos.json    # atualizado via GH Actions
    └── countries-110m.json   # geo data pro globe (~100KB)

scripts/
└── fetch_artigos.py    # rodado via GH Actions (cron 3×/semana)

.github/workflows/
└── update-artigos.yml

wrangler.jsonc          # config CF Workers Static Assets
```

## Deploy

- **Push pro `master`** dispara CF Pages auto-deploy
- Branch `gh-pages` (órfã) serve apenas redirect 301 do GitHub Pages legado
- Worker é deployado manualmente via `wrangler deploy` (em outro repo)

## Desenvolvimento local

```bash
cd public
python3 -m http.server 8081
# acessa http://localhost:8081
```

CORS do Worker permite `localhost:8080/8081` em dev.

## Convenções

- Sem `unsafe-inline`/`unsafe-eval` no CSP
- Vendors externos (d3, topojson) com SRI hashes em `index.html`
- Headers de segurança (HSTS, X-Frame-Options, Permissions-Policy) via `_headers`
- Esc HTML em todo `innerHTML` que recebe dado externo (`esc()`, `safeUrl()`, `safeLocalAsset()`)

## Endpoints do Worker

| Endpoint | Cache | Descrição |
|---|---|---|
| `/` (default) | 600s + edge | Agrega 3 batches RSS do KV |
| `/post-count` | 12h + edge | Total de artigos no Substack |
| `/ticker` | 120s | Bundle binance + fng + fx + quotes |
| `/substack` | 30min | Últimos 10 posts da newsletter |
| `/quote?symbol=X` | 30min | Cotação BR via brapi (allowlist 12 symbols) |
| `/refresh?batch=a\|b\|extras\|all` | — | Trigger manual (token `X-Refresh-Token`) |
