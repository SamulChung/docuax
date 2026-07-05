from app.renderers.base import Renderer
from app.renderers.docx_renderer import DocxRenderer
from app.renderers.hwp_renderer import HwpRenderer
from app.renderers.hwpx_renderer import HwpxRenderer
from app.renderers.pdf_renderer import PdfRenderer

__all__ = ["DocxRenderer", "HwpRenderer", "HwpxRenderer", "PdfRenderer", "Renderer", "get_renderer"]


def get_renderer(fmt: str) -> Renderer:
    fmt = fmt.lower()
    if fmt == "docx":
        return DocxRenderer()
    if fmt == "hwp":
        return HwpRenderer()
    if fmt == "hwpx":
        return HwpxRenderer()
    if fmt == "pdf":
        return PdfRenderer()
    raise ValueError(f"지원하지 않는 포맷: {fmt}")
