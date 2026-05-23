"""다이어그램 렌더러 — Mermaid · PlantUML → 고품질 PNG.

고도화:
- DocuAX 테마 (브랜드 하늘색 적용) — mermaid initialization config
- 한국어 폰트 명시 (Malgun Gothic / NanumGothic / Noto CJK)
- 2x 해상도 (width 2400px)
- mermaid-cli 우선 (로컬·정확), mermaid.ink HTTP fallback
- PlantUML 동일 컬러 테마

설정:
  env DOCUAX_OFFLINE=1 → 외부 HTTP 비활성
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from app.core.logging import get_logger
from app.services.visuals.cache import _hash_key, cache_path_for

log = get_logger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# DocuAX 테마 — mermaid theme variables (브랜드 하늘색 우아하게)
# ─────────────────────────────────────────────────────────────────────────────
_DOCUAX_MERMAID_CONFIG = {
    "theme": "base",
    "themeVariables": {
        # 폰트
        "fontFamily": "Malgun Gothic, NanumGothic, Noto Sans KR, sans-serif",
        "fontSize": "16px",
        # 메인
        "primaryColor": "#E8F0FC",        # 노드 배경 — 옅은 하늘
        "primaryTextColor": "#0F1A3D",    # 노드 글자 — 짙은 남색
        "primaryBorderColor": "#1F5BAF",  # 노드 테두리 — DocuAX 브랜드
        # 보조
        "secondaryColor": "#FFF4D6",       # 보조 노드 — 옅은 황금
        "secondaryTextColor": "#5A4500",
        "secondaryBorderColor": "#F4B400",
        # 강조
        "tertiaryColor": "#E6F4EA",        # 3차 노드 — 옅은 녹색
        "tertiaryTextColor": "#0B5C2C",
        "tertiaryBorderColor": "#0F9D58",
        # 선
        "lineColor": "#1F5BAF",
        # 배경
        "background": "#FFFFFF",
        "mainBkg": "#E8F0FC",
        # 클러스터
        "clusterBkg": "#F7F9FC",
        "clusterBorder": "#D0DCEC",
        # 활성 노드
        "activeTaskBkgColor": "#1F5BAF",
        "activeTaskBorderColor": "#0F1A3D",
        # sequence/gantt
        "actorBkg": "#E8F0FC",
        "actorBorder": "#1F5BAF",
        "actorTextColor": "#0F1A3D",
        "signalColor": "#1F5BAF",
        "signalTextColor": "#1A1A1A",
        "labelBoxBkgColor": "#FFF4D6",
        "labelBoxBorderColor": "#F4B400",
        "labelTextColor": "#5A4500",
        # gantt
        "sectionBkgColor": "#F7F9FC",
        "altSectionBkgColor": "#FFFFFF",
        "taskBkgColor": "#3F8AE0",
        "taskTextColor": "#FFFFFF",
        "taskTextOutsideColor": "#1A1A1A",
        "gridColor": "#E0E0E0",
        # ER
        "fillType0": "#E8F0FC",
        "fillType1": "#FFF4D6",
        "fillType2": "#E6F4EA",
    },
    "flowchart": {
        "curve": "basis",
        "nodeSpacing": 50,
        "rankSpacing": 60,
        "padding": 16,
    },
    "sequence": {
        "actorMargin": 60,
        "messageAlign": "center",
        "boxMargin": 12,
        "boxTextMargin": 6,
    },
    "gantt": {
        "leftPadding": 80,
        "rightPadding": 40,
        "topPadding": 30,
        "bottomPadding": 30,
        "barHeight": 24,
        "barGap": 8,
    },
}


def _puppeteer_config() -> str:
    """mermaid-cli 가 사용할 puppeteer 설정 JSON."""
    return json.dumps({
        "args": ["--no-sandbox", "--disable-setuid-sandbox"],
    })


def _allow_external() -> bool:
    return os.environ.get("DOCUAX_OFFLINE", "0") != "1"


def render_diagram_to_png(
    *,
    engine: str = "mermaid",
    source: str = "",
    width_px: int = 2400,  # 2x 해상도
) -> Path | None:
    """다이어그램 소스 → 고품질 PNG. 같은 source 는 캐시."""
    if not source.strip():
        return None

    key = _hash_key("diagram-v2", engine, source, str(width_px))
    out = cache_path_for(key, ".png")
    if out.exists():
        return out

    if engine == "mermaid":
        p = _render_mermaid_cli(source, out, width_px)
        if p:
            return p
        if _allow_external():
            p = _render_mermaid_ink(source, out)
            if p:
                return p
            # kroki.io fallback — quadrantChart · requirementDiagram 등
            # mermaid.ink 옛 버전이 못 그리는 신규 타입 지원
            p = _render_kroki(source, out, "mermaid")
            if p:
                return p
        log.warning("Mermaid 렌더 실패 — 모든 백엔드 실패")
        return None

    if engine == "plantuml":
        return _render_plantuml(source, out)

    log.warning("알 수 없는 다이어그램 엔진", engine=engine)
    return None


def _render_mermaid_cli(source: str, out: Path, width_px: int) -> Path | None:
    """로컬 mermaid-cli (mmdc) — DocuAX 테마 + 고해상도."""
    mmdc = shutil.which("mmdc") or shutil.which("mmdc.cmd")
    if not mmdc:
        return None
    try:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            in_file = tmp_path / "diagram.mmd"
            in_file.write_text(source, encoding="utf-8")

            # mermaid 설정 파일
            config_file = tmp_path / "mermaid_config.json"
            config_file.write_text(
                json.dumps(_DOCUAX_MERMAID_CONFIG, ensure_ascii=False),
                encoding="utf-8",
            )

            # puppeteer 설정 (CI/도커 호환)
            pp_file = tmp_path / "puppeteer.json"
            pp_file.write_text(_puppeteer_config(), encoding="utf-8")

            cmd = [
                mmdc,
                "-i", str(in_file),
                "-o", str(out),
                "-c", str(config_file),
                "-b", "white",
                "-w", str(width_px),
                "--scale", "2",  # device pixel ratio 2x
            ]
            r = subprocess.run(cmd, capture_output=True, timeout=45)
            if r.returncode == 0 and out.exists():
                log.info(
                    "Mermaid 렌더 (mermaid-cli + DocuAX 테마)",
                    out=str(out), size=out.stat().st_size,
                )
                return out
            log.warning(
                "mermaid-cli 실패",
                stderr=r.stderr.decode("utf-8", errors="ignore")[:300],
            )
    except subprocess.TimeoutExpired:
        log.warning("mermaid-cli 타임아웃")
    except Exception as e:  # noqa: BLE001
        log.warning("mermaid-cli 오류", error=str(e))
    return None


def _render_mermaid_ink(source: str, out: Path) -> Path | None:
    """mermaid.ink HTTP — 다단계 fallback.

    1차: 풀 DocuAX 테마 init directive
    2차: 미니멀 init directive (theme=base + 색상 일부만)
    3차: init directive 없이 raw source — 호환성 최우선

    quadrantChart · gitGraph · requirementDiagram 등 일부 신규 타입은
    init directive 와 호환성 문제로 400 에러가 나므로 폴백 필수.
    """
    try:
        import base64

        import httpx
    except ImportError:
        return None

    minimal_config = {
        "theme": "base",
        "themeVariables": {
            "fontFamily": "Malgun Gothic, NanumGothic, Noto Sans KR, sans-serif",
            "primaryColor": "#E8F0FC",
            "primaryTextColor": "#0F1A3D",
            "primaryBorderColor": "#1F5BAF",
            "lineColor": "#1F5BAF",
            "background": "#FFFFFF",
        },
    }

    attempts = [
        ("풀 테마", "%%{init: " + json.dumps(_DOCUAX_MERMAID_CONFIG, ensure_ascii=False) + "}%%\n" + source),
        ("미니멀 테마", "%%{init: " + json.dumps(minimal_config, ensure_ascii=False) + "}%%\n" + source),
        ("raw (테마 없이)", source),
    ]

    last_err: Exception | None = None
    for label, payload in attempts:
        try:
            encoded = base64.urlsafe_b64encode(payload.encode("utf-8")).decode("ascii").rstrip("=")
            url = f"https://mermaid.ink/img/{encoded}?type=png&bgColor=FFFFFF"
            with httpx.Client(timeout=20.0, follow_redirects=True) as client:
                r = client.get(url)
                # 400 (Bad Request) — init directive 호환성 문제 → 다음 fallback
                if r.status_code == 400:
                    log.info("mermaid.ink 400 — 다음 단계 fallback", attempt=label)
                    continue
                r.raise_for_status()
                out.write_bytes(r.content)
                log.info("Mermaid 렌더 (mermaid.ink)", out=str(out), attempt=label)
                return out
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 400:
                log.info("mermaid.ink 400 — 다음 단계 fallback", attempt=label)
                last_err = e
                continue
            last_err = e
        except Exception as e:  # noqa: BLE001
            last_err = e
            # 타임아웃 등은 다음 시도도 시간 들 수 있어 한 단계만 더 진행
            continue

    log.warning("mermaid.ink 모든 fallback 실패", error=str(last_err))
    return None


def _render_plantuml(source: str, out: Path) -> Path | None:
    """PlantUML — DocuAX 컬러 적용. plantuml CLI 또는 jar."""
    plantuml = shutil.which("plantuml")
    jar = os.environ.get("PLANTUML_JAR", "")
    java = shutil.which("java")

    # DocuAX 스킨파라미터 자동 주입 — @startuml 다음에
    skin_prefix = (
        "skinparam backgroundColor #FFFFFF\n"
        "skinparam defaultFontName Malgun Gothic\n"
        "skinparam defaultFontSize 14\n"
        "skinparam ArrowColor #1F5BAF\n"
        "skinparam ArrowFontColor #1A1A1A\n"
        "skinparam ClassBackgroundColor #E8F0FC\n"
        "skinparam ClassBorderColor #1F5BAF\n"
        "skinparam ClassFontColor #0F1A3D\n"
        "skinparam ActorBackgroundColor #E8F0FC\n"
        "skinparam ActorBorderColor #1F5BAF\n"
        "skinparam NoteBackgroundColor #FFF4D6\n"
        "skinparam NoteBorderColor #F4B400\n"
        "skinparam SequenceLifeLineBorderColor #1F5BAF\n"
        "skinparam Shadowing false\n"
    )
    # source 에 이미 skinparam 이 있으면 중복 방지
    if "skinparam" in source:
        themed_source = source
    elif "@startuml" in source:
        themed_source = source.replace("@startuml", "@startuml\n" + skin_prefix, 1)
    else:
        themed_source = "@startuml\n" + skin_prefix + source + "\n@enduml"

    if not plantuml and not (jar and Path(jar).exists() and java):
        if _allow_external():
            return _render_plantuml_online(themed_source, out)
        log.warning("PlantUML 미설치")
        return None

    try:
        with tempfile.TemporaryDirectory() as tmp:
            in_file = Path(tmp) / "diagram.puml"
            in_file.write_text(themed_source, encoding="utf-8")
            if plantuml:
                cmd = [plantuml, "-tpng", "-Sdpi=200", "-o", str(out.parent), str(in_file)]
            else:
                cmd = [java, "-jar", jar, "-tpng", "-Sdpi=200",
                       "-o", str(out.parent), str(in_file)]
            r = subprocess.run(cmd, capture_output=True, timeout=45)
            generated = out.parent / "diagram.png"
            if r.returncode == 0 and generated.exists():
                generated.rename(out)
                return out
            log.warning("PlantUML 실패", stderr=r.stderr.decode("utf-8", errors="ignore")[:300])
    except Exception as e:  # noqa: BLE001
        log.warning("PlantUML 오류", error=str(e))
    return None


def _render_kroki(source: str, out: Path, diagram_type: str = "mermaid") -> Path | None:
    """Kroki.io 다이어그램 API — mermaid·plantuml·graphviz·등 25+ 엔진 지원.

    POST https://kroki.io/<type>/png 으로 raw source 전송.
    mermaid.ink 가 못 그리는 quadrantChart·requirementDiagram 등 신규 타입 백업.
    """
    try:
        import httpx

        # kroki 는 GET 도 지원하지만 (zlib+base64 인코딩), 긴 소스는 POST 가 안전
        with httpx.Client(timeout=25.0, follow_redirects=True) as client:
            r = client.post(
                f"https://kroki.io/{diagram_type}/png",
                content=source.encode("utf-8"),
                headers={"Content-Type": "text/plain"},
            )
            if r.status_code != 200:
                log.warning(
                    "kroki 실패",
                    status=r.status_code,
                    msg=r.text[:200] if r.text else "",
                )
                return None
            out.write_bytes(r.content)
            log.info("다이어그램 렌더 (kroki.io)", type=diagram_type, out=str(out))
            return out
    except Exception as e:  # noqa: BLE001
        log.warning("kroki 예외", error=str(e))
        return None


def _render_plantuml_online(source: str, out: Path) -> Path | None:
    try:
        import httpx

        from app.services.visuals._plantuml_encoder import encode_plantuml

        encoded = encode_plantuml(source)
        url = f"https://www.plantuml.com/plantuml/png/{encoded}"
        with httpx.Client(timeout=20.0, follow_redirects=True) as client:
            r = client.get(url)
            r.raise_for_status()
            out.write_bytes(r.content)
            return out
    except Exception as e:  # noqa: BLE001
        log.warning("PlantUML 온라인 실패", error=str(e))
        return None
