#!/usr/bin/env python3
"""
Busca os últimos artigos do Substack da WeSearch e atualiza data/artigos.json.
Roda via GitHub Actions toda quarta, sexta e domingo.

Usa a API JSON do Substack diretamente — evita o bloqueio do RSS por IP.
"""

import json
import re
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

SUBSTACK_API = "https://wesearch.substack.com/api/v1/posts?limit=10"
OUTPUT_FILE = Path(__file__).parent.parent / "data" / "artigos.json"
MAX_ARTIGOS = 10

MONTHS_PT = {
    1: "JAN", 2: "FEV", 3: "MAR", 4: "ABR", 5: "MAI", 6: "JUN",
    7: "JUL", 8: "AGO", 9: "SET", 10: "OUT", 11: "NOV", 12: "DEZ",
}

CATEGORY_MAP = {
    "on-chain": "ON-CHAIN",
    "onchain": "ON-CHAIN",
    "macro": "MACRO",
    "mercado": "MERCADO",
    "market": "MERCADO",
    "geopolitica": "GEOPOLÍTICA",
    "geopolítica": "GEOPOLÍTICA",
    "geopolitics": "GEOPOLÍTICA",
}


def strip_html(text: str) -> str:
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def truncate(text: str, max_len: int = 120) -> str:
    if len(text) <= max_len:
        return text
    cut = text[:max_len].rsplit(" ", 1)[0]
    return cut.rstrip(".,;:") + "."


def format_date_pt(iso_str: str) -> str:
    try:
        # Substack retorna ISO 8601: "2026-04-18T12:00:00.000Z"
        iso_str = iso_str[:19].replace("T", " ")
        dt = datetime.strptime(iso_str, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
    except Exception:
        dt = datetime.now(timezone.utc)
    return f"{dt.day:02d} {MONTHS_PT[dt.month]} {dt.year}"


def resolve_category(post_tags: list) -> str:
    for tag in post_tags:
        name = (tag.get("name") or tag.get("slug") or "").lower().strip()
        if name in CATEGORY_MAP:
            return CATEGORY_MAP[name]
    return "RESEARCH"


def fetch_posts() -> list[dict]:
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept": "application/json",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    }
    req = urllib.request.Request(SUBSTACK_API, headers=headers)
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())


def parse_posts(posts: list) -> list[dict]:
    artigos = []
    for i, post in enumerate(posts[:MAX_ARTIGOS], start=1):
        title = (post.get("title") or "").strip()
        slug = post.get("slug") or ""
        url = f"https://wesearch.substack.com/p/{slug}"
        pub_date = post.get("post_date") or post.get("publishedAt") or ""
        subtitle = strip_html(post.get("subtitle") or post.get("description") or "")
        excerpt = truncate(subtitle) if subtitle else truncate(strip_html(post.get("body_html") or ""))

        # Autor
        author_obj = post.get("publishedBylines") or post.get("author") or []
        if isinstance(author_obj, list) and author_obj:
            author = (author_obj[0].get("name") or "").upper()
        elif isinstance(author_obj, dict):
            author = (author_obj.get("name") or "").upper()
        else:
            author = ""

        # Categoria via tags
        tags = post.get("postTags") or post.get("tags") or []
        category = resolve_category(tags)

        artigos.append({
            "n": f"{i:02d}",
            "date": format_date_pt(pub_date),
            "title": title,
            "excerpt": excerpt,
            "author": author,
            "category": category,
            "url": url,
        })

    return artigos


def main():
    print(f"Buscando posts: {SUBSTACK_API}")
    posts = fetch_posts()
    print(f"{len(posts)} posts recebidos da API")

    artigos = parse_posts(posts)

    if not artigos:
        print("Nenhum artigo encontrado. Abortando.")
        return

    OUTPUT_FILE.write_text(json.dumps(artigos, ensure_ascii=False, indent=2))
    print(f"{len(artigos)} artigos salvos em {OUTPUT_FILE}")
    for a in artigos:
        print(f"  [{a['n']}] {a['date']} — {a['title'][:60]}")


if __name__ == "__main__":
    main()
