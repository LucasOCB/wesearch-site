#!/usr/bin/env python3
"""
Busca os últimos artigos do Substack da WeSearch e atualiza data/artigos.json.
Roda via GitHub Actions toda quarta, sexta e domingo.
"""

import json
import re
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

SUBSTACK_RSS = "https://wesearch.substack.com/feed"
OUTPUT_FILE = Path(__file__).parent.parent / "data" / "artigos.json"
MAX_ARTIGOS = 10

MONTHS_PT = {
    1: "JAN", 2: "FEV", 3: "MAR", 4: "ABR", 5: "MAI", 6: "JUN",
    7: "JUL", 8: "AGO", 9: "SET", 10: "OUT", 11: "NOV", 12: "DEZ",
}

# Mapeamento de tags do Substack para categorias do site
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


def format_date_pt(pub_date_str: str) -> str:
    try:
        dt = parsedate_to_datetime(pub_date_str)
        dt = dt.astimezone(timezone.utc)
    except Exception:
        dt = datetime.now(timezone.utc)
    return f"{dt.day:02d} {MONTHS_PT[dt.month]} {dt.year}"


def resolve_category(tags: list[str]) -> str:
    for tag in tags:
        normalized = tag.lower().strip()
        if normalized in CATEGORY_MAP:
            return CATEGORY_MAP[normalized]
    return "RESEARCH"


def fetch_rss(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "WeSearch-Bot/1.0"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return resp.read()


def parse_items(xml_bytes: bytes) -> list[dict]:
    root = ET.fromstring(xml_bytes)
    ns = {"dc": "http://purl.org/dc/elements/1.1/"}
    channel = root.find("channel")
    items = channel.findall("item") if channel is not None else []

    artigos = []
    for i, item in enumerate(items[:MAX_ARTIGOS], start=1):
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        pub_date = (item.findtext("pubDate") or "").strip()
        description = strip_html(item.findtext("description") or "")
        excerpt = truncate(description)

        # Autor: dc:creator ou <author>
        author = (
            item.findtext("dc:creator", namespaces=ns)
            or item.findtext("author")
            or ""
        ).strip().upper()

        # Categorias/tags
        tags = [c.text or "" for c in item.findall("category")]
        category = resolve_category(tags)

        artigos.append({
            "n": f"{i:02d}",
            "date": format_date_pt(pub_date),
            "title": title,
            "excerpt": excerpt,
            "author": author,
            "category": category,
            "url": link,
        })

    return artigos


def main():
    print(f"Buscando RSS: {SUBSTACK_RSS}")
    xml_bytes = fetch_rss(SUBSTACK_RSS)
    artigos = parse_items(xml_bytes)

    if not artigos:
        print("Nenhum artigo encontrado. Abortando.")
        return

    OUTPUT_FILE.write_text(json.dumps(artigos, ensure_ascii=False, indent=2))
    print(f"{len(artigos)} artigos salvos em {OUTPUT_FILE}")
    for a in artigos:
        print(f"  [{a['n']}] {a['date']} — {a['title'][:60]}")


if __name__ == "__main__":
    main()
