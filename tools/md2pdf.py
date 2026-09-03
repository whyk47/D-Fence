#!/usr/bin/env python3
"""
D-Fence — Markdown to PDF, for the lab reports that must be submitted as PDF
(Lab 1 §3.5, Lab 2 §3.6, Lab 3 §3.3.5, Lab 4 §3.3.4).

    python tools/md2pdf.py lab2/AI-TECH-STACK.md [output.pdf]

Renders the Markdown to a self-contained HTML file, then prints it with headless
Chrome. Chrome is used rather than a Python PDF library because it lays out
tables and code blocks properly and is already on every team machine; no
LaTeX, no wkhtmltopdf, no Office.

Requires: `pip install markdown`, and Chrome or Edge installed.
"""
from __future__ import annotations

import pathlib
import shutil
import subprocess
import sys
import tempfile

import markdown

CSS = """
@page { size: A4; margin: 18mm 16mm 20mm 16mm; }
* { box-sizing: border-box; }
body {
  font-family: "Segoe UI", -apple-system, system-ui, sans-serif;
  font-size: 10.5pt; line-height: 1.5; color: #1a1a1a; margin: 0;
}
h1 { font-size: 19pt; margin: 0 0 4pt; border-bottom: 2px solid #1B5E56; padding-bottom: 6pt; }
h2 { font-size: 14pt; margin: 20pt 0 6pt; color: #1B5E56; page-break-after: avoid; }
h3 { font-size: 11.5pt; margin: 14pt 0 4pt; page-break-after: avoid; }
h4 { font-size: 10.5pt; margin: 12pt 0 3pt; page-break-after: avoid; }
p, li { orphans: 2; widows: 2; }
code, pre { font-family: "Cascadia Mono", Consolas, monospace; font-size: 9pt; }
code { background: #f2f2ef; padding: 1px 3px; border-radius: 3px; }
pre { background: #f7f7f5; border: 1px solid #e2e2dd; border-left: 3px solid #1B5E56;
      padding: 8pt 10pt; overflow-x: auto; page-break-inside: avoid; }
pre code { background: none; padding: 0; }
table { border-collapse: collapse; width: 100%; margin: 8pt 0; font-size: 9pt;
        page-break-inside: avoid; }
th, td { border: 1px solid #d8d8d2; padding: 4pt 6pt; text-align: left; vertical-align: top; }
th { background: #f2f2ef; font-weight: 600; }
blockquote { margin: 8pt 0; padding: 6pt 12pt; border-left: 3px solid #B8763A;
             background: #fbf8f4; }
hr { border: none; border-top: 1px solid #ddd; margin: 16pt 0; }
img { max-width: 100%; }
a { color: #1B5E56; }
"""

BROWSERS = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
]


def find_browser() -> str:
    for path in BROWSERS:
        if pathlib.Path(path).exists():
            return path
    for name in ("chrome", "msedge", "chromium"):
        found = shutil.which(name)
        if found:
            return found
    raise SystemExit("no Chrome or Edge found — install one, or add it to PATH")


def render(md_path: pathlib.Path, pdf_path: pathlib.Path) -> None:
    body = markdown.markdown(
        md_path.read_text(encoding="utf-8"),
        extensions=["tables", "fenced_code", "toc", "sane_lists", "attr_list"],
    )
    html = (
        f"<!doctype html><html><head><meta charset='utf-8'>"
        f"<title>{md_path.stem}</title><style>{CSS}</style></head>"
        f"<body>{body}</body></html>"
    )
    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = pathlib.Path(tmp)
        html_file = tmp_dir / "page.html"
        html_file.write_text(html, encoding="utf-8")
        subprocess.run(
            [
                find_browser(),
                "--headless=new",
                "--disable-gpu",
                "--no-pdf-header-footer",
                f"--user-data-dir={tmp_dir / 'profile'}",
                f"--print-to-pdf={pdf_path}",
                html_file.as_uri(),
            ],
            check=True,
            capture_output=True,
            timeout=180,
        )
    if not pdf_path.exists() or pdf_path.stat().st_size == 0:
        raise SystemExit(f"Chrome reported success but {pdf_path} is missing or empty")


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    src = pathlib.Path(sys.argv[1]).resolve()
    out = pathlib.Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else src.with_suffix(".pdf")
    render(src, out)
    print(f"{out}  ({out.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
