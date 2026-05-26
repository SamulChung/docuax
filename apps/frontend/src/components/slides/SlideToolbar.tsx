"use client";

function dispatchAction(action: string) {
  window.dispatchEvent(new CustomEvent("slideEditorAction", { detail: { action } }));
}

interface Props {
  onUndo?: () => void;
  onRedo?: () => void;
}

export default function SlideToolbar({ onUndo, onRedo }: Props) {
  return (
    <div className="flex items-center gap-1 px-3 py-2 bg-white border-b border-gray-200">
      <button
        onClick={() => dispatchAction("addText")}
        title="텍스트 추가"
        className="px-2 py-1 text-xs rounded hover:bg-gray-100 text-gray-700 border border-gray-200"
      >
        T 텍스트
      </button>
      <button
        onClick={() => dispatchAction("addRect")}
        title="사각형 추가"
        className="px-2 py-1 text-xs rounded hover:bg-gray-100 text-gray-700 border border-gray-200"
      >
        ▭ 도형
      </button>
      <button
        onClick={() => dispatchAction("deleteSelected")}
        title="선택 삭제"
        className="px-2 py-1 text-xs rounded hover:bg-red-50 text-red-600 border border-red-200"
      >
        ✕ 삭제
      </button>
      <div className="h-4 w-px bg-gray-200 mx-1" />
      <button
        onClick={onUndo}
        title="실행 취소"
        className="px-2 py-1 text-xs rounded hover:bg-gray-100 text-gray-700"
      >
        ↩
      </button>
      <button
        onClick={onRedo}
        title="다시 실행"
        className="px-2 py-1 text-xs rounded hover:bg-gray-100 text-gray-700"
      >
        ↪
      </button>
    </div>
  );
}
