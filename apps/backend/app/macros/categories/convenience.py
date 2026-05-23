"""편리 매크로 5종 — P1~P5. 자동저장·되돌리기 강화."""
from __future__ import annotations

import time
from typing import Any

from app.macros.base import Macro, MacroCategory
from app.pipeline.ir import DocumentIR


class P1_ForceSave(Macro):
    id = "P1"; category = MacroCategory.CONVENIENCE
    name = "자동저장 강제"; description = "현재 상태를 즉시 클라우드 저장"

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        ir.macro_log.append(
            {"macro_id": self.id, "saved_at": time.time()}
        )
        return ir


class P2_VersionSnapshot(Macro):
    id = "P2"; category = MacroCategory.CONVENIENCE
    name = "버전 스냅샷"; description = "현재 시점 버전을 명명하여 저장"

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        params = params or {}
        name = str(params.get("name", f"snapshot-{int(time.time())}"))
        ir.macro_log.append({"macro_id": self.id, "snapshot_name": name})
        return ir


class P3_UndoExtended(Macro):
    id = "P3"; category = MacroCategory.CONVENIENCE
    name = "되돌리기 강화 (50단계)"; description = "기본 20단계 → 50단계 되돌리기"

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        # 클라이언트 측 undo stack 크기를 늘리는 설정 매크로 — 백엔드는 신호만
        ir.macro_log.append({"macro_id": self.id, "undo_depth": 50})
        return ir


class P4_ChangeLog(Macro):
    id = "P4"; category = MacroCategory.CONVENIENCE
    name = "변경 이력 보기"; description = "최근 변경 사항을 사이드 패널에 표시"
    ai_powered = True

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        # macro_log 전체를 결과로 반환 (이미 누적되어 있음)
        ir.macro_log.append(
            {"macro_id": self.id, "log_count": len(ir.macro_log)}
        )
        return ir


class P5_ShareLink(Macro):
    id = "P5"; category = MacroCategory.CONVENIENCE
    name = "공유 링크 생성"; description = "읽기 전용 또는 댓글 가능 공유 링크"
    ai_powered = True

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        params = params or {}
        mode = str(params.get("mode", "read"))  # read | comment
        ir.macro_log.append(
            {"macro_id": self.id, "share_mode": mode, "document_id": ir.document_id}
        )
        return ir


MACROS = [P1_ForceSave, P2_VersionSnapshot, P3_UndoExtended, P4_ChangeLog, P5_ShareLink]
