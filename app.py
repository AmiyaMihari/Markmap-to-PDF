#!/usr/bin/env python3
"""
app.py — Interfaz web de markmap2pdf.

Levanta un servidor local con una pagina donde puedes:

  * escribir (o arrastrar) tu Markdown y ver el mapa en vivo,
  * descargarlo como PDF, PNG o SVG,
  * arrastrar el PDF de tu tarea y unirlo con el mapa en un solo PDF,
    eligiendo en que pagina se inserta.

Todo pasa en memoria: no se guarda ningun archivo en el disco.

    bash start.sh          # o:  .venv/bin/python app.py
"""

from __future__ import annotations

import asyncio
import contextlib
import io
import pathlib
import sys
import threading
import webbrowser
from urllib.parse import quote

from fastapi import FastAPI, Form, HTTPException, UploadFile, File
from fastapi.responses import FileResponse, Response
from playwright.async_api import async_playwright
from pypdf import PageObject, PdfReader, PdfWriter, Transformation

from markmap2pdf import DEFAULT_PAD, DEFAULT_SCALE, MarkmapError, render_to_bytes

HERE = pathlib.Path(__file__).parent
INDEX = HERE / "static" / "index.html"

MAX_UPLOAD = 60 * 1024 * 1024  # 60 MB
MIME = {
    "pdf": "application/pdf",
    "png": "image/png",
    "svg": "image/svg+xml",
}

# Un solo navegador para todo el proceso: convertir es ~10x mas rapido que
# levantar Chromium en cada peticion.
_browser = None
_lock = asyncio.Lock()


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    global _browser
    pw = await async_playwright().start()
    _browser = await pw.chromium.launch()
    try:
        yield
    finally:
        with contextlib.suppress(Exception):
            await _browser.close()
        with contextlib.suppress(Exception):
            await pw.stop()


app = FastAPI(title="markmap2pdf", lifespan=lifespan)


# --------------------------------------------------------------------------- #
# Utilidades
# --------------------------------------------------------------------------- #
def _download(data: bytes, filename: str, media_type: str) -> Response:
    """Respuesta de descarga con nombre de archivo que soporta acentos."""
    ascii_name = filename.encode("ascii", "ignore").decode() or "archivo"
    return Response(
        content=data,
        media_type=media_type,
        headers={
            "Content-Disposition": (
                f'attachment; filename="{ascii_name}"; '
                f"filename*=UTF-8''{quote(filename)}"
            )
        },
    )


async def _read_upload(f: UploadFile | None) -> bytes:
    if f is None:
        return b""
    data = await f.read()
    if len(data) > MAX_UPLOAD:
        raise HTTPException(413, "El archivo pesa mas de 60 MB.")
    return data


async def _map_source(md: str, mapfile: UploadFile | None) -> tuple[str, str]:
    """Devuelve (source, kind) para render_to_bytes, venga de texto o de archivo."""
    if mapfile is not None and mapfile.filename:
        raw = await _read_upload(mapfile)
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            text = raw.decode("utf-8", "replace")
        suffix = pathlib.Path(mapfile.filename).suffix.lower()
        return (text, "html" if suffix in (".html", ".htm") else "md")

    if not md.strip():
        raise HTTPException(400, "Escribe o sube un mapa primero.")
    return (md, "md")


async def _render(source: str, kind: str, pad: int, scale: int, want) -> dict:
    if _browser is None:
        raise HTTPException(503, "El navegador todavia no esta listo, reintenta.")
    # Chromium no es reentrante para esto; serializamos las conversiones.
    async with _lock:
        try:
            return await render_to_bytes(
                _browser, source, kind, pad=pad, scale=scale, want=want
            )
        except MarkmapError as exc:
            raise HTTPException(400, str(exc)) from exc


def _page_size(page) -> tuple[float, float]:
    """Ancho/alto de una pagina en puntos, respetando /Rotate."""
    w, h = float(page.mediabox.width), float(page.mediabox.height)
    rot = int(page.get("/Rotate") or 0) % 360
    return (h, w) if rot in (90, 270) else (w, h)


def _fit_to_page(map_page, doc_w: float, doc_h: float, margin: float,
                 rotate: bool = False):
    """Centra el mapa en una hoja del tamano del documento.

    Por defecto NO se cambia la orientacion: la hoja del mapa queda igual que
    las del documento. `rotate=True` la pone horizontal para que el mapa salga
    mas grande (solo si el mapa es mas ancho que alto).
    """
    mw, mh = float(map_page.mediabox.width), float(map_page.mediabox.height)

    if rotate and (mw > mh) != (doc_w > doc_h):
        doc_w, doc_h = doc_h, doc_w

    sheet = PageObject.create_blank_page(width=doc_w, height=doc_h)
    scale = min((doc_w - 2 * margin) / mw, (doc_h - 2 * margin) / mh)
    tx = (doc_w - mw * scale) / 2
    ty = (doc_h - mh * scale) / 2
    sheet.merge_transformed_page(
        map_page, Transformation().scale(scale).translate(tx, ty)
    )
    return sheet


# --------------------------------------------------------------------------- #
# Rutas
# --------------------------------------------------------------------------- #
@app.get("/")
async def index() -> FileResponse:
    return FileResponse(INDEX, media_type="text/html")


@app.post("/api/pdfinfo")
async def pdfinfo(doc: UploadFile = File(...)) -> dict:
    """Numero de paginas del PDF, para el selector de posicion."""
    data = await _read_upload(doc)
    try:
        reader = PdfReader(io.BytesIO(data))
        w, h = _page_size(reader.pages[0]) if reader.pages else (612, 792)
        return {"pages": len(reader.pages), "width": round(w), "height": round(h)}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(400, f"No pude leer ese PDF: {exc}") from exc


@app.post("/api/map")
async def api_map(
    md: str = Form(""),
    mapfile: UploadFile | None = File(None),
    fmt: str = Form("pdf"),
    pad: int = Form(DEFAULT_PAD),
    scale: int = Form(DEFAULT_SCALE),
    name: str = Form("mapa"),
) -> Response:
    """Solo el mapa, en el formato pedido."""
    if fmt not in MIME:
        raise HTTPException(400, "Formato invalido.")

    source, kind = await _map_source(md, mapfile)
    out = await _render(source, kind, pad, scale, want=(fmt,))
    stem = pathlib.Path(name).stem or "mapa"
    return _download(out[fmt], f"{stem}.{fmt}", MIME[fmt])


@app.post("/api/merge")
async def api_merge(
    doc: UploadFile = File(...),
    md: str = Form(""),
    mapfile: UploadFile | None = File(None),
    position: str = Form("end"),        # start | end | after
    after_page: int = Form(1),
    fit: str = Form("doc"),             # doc | landscape | exact
    margin: float = Form(36.0),         # puntos (36 pt = 1.27 cm)
    pad: int = Form(DEFAULT_PAD),
    name: str = Form("tarea"),
) -> Response:
    """El PDF de la tarea + el mapa, en un solo archivo."""
    doc_bytes = await _read_upload(doc)
    try:
        reader = PdfReader(io.BytesIO(doc_bytes))
        pages = list(reader.pages)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(400, f"No pude leer ese PDF: {exc}") from exc

    if not pages:
        raise HTTPException(400, "Ese PDF no tiene paginas.")

    source, kind = await _map_source(md, mapfile)
    out = await _render(source, kind, pad, DEFAULT_SCALE, want=("pdf",))
    map_page = PdfReader(io.BytesIO(out["pdf"])).pages[0]

    if fit in ("doc", "landscape"):
        dw, dh = _page_size(pages[0])
        map_page = _fit_to_page(
            map_page, dw, dh, max(0.0, margin), rotate=(fit == "landscape")
        )

    if position == "start":
        idx = 0
    elif position == "after":
        idx = max(0, min(int(after_page), len(pages)))
    else:
        idx = len(pages)

    writer = PdfWriter()
    for p in pages[:idx]:
        writer.add_page(p)
    writer.add_page(map_page)
    for p in pages[idx:]:
        writer.add_page(p)

    buf = io.BytesIO()
    writer.write(buf)
    stem = pathlib.Path(name).stem or "tarea"
    return _download(buf.getvalue(), f"{stem} con mapa.pdf", MIME["pdf"])


# --------------------------------------------------------------------------- #
def main() -> None:
    import uvicorn

    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    url = f"http://127.0.0.1:{port}"
    print(f"\n  markmap2pdf  ->  {url}\n  (Ctrl+C para cerrar)\n")
    if "--no-open" not in sys.argv:
        threading.Timer(1.2, lambda: webbrowser.open(url)).start()
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")


if __name__ == "__main__":
    main()
