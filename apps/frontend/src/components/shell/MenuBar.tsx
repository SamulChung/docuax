"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";

import { listMacros } from "@/lib/api";
import { executeMacroAction } from "@/lib/macroActions";
import { useWorkspace } from "@/store/workspace";
import { MACRO_PARAM_SCHEMAS, MacroParamDialog, MacroParamSchema } from "@/components/remote/MacroParamDialog";
import { DocumentPicker } from "./DocumentPicker";
import { ExportMenu } from "./ExportMenu";
import { buildMenus } from "./menuConfig";

export function MenuBar() {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  // 파라미터가 필요한 매크로용 다이얼로그 — RemoteControl 과 동일 패턴
  const [pendingDialog, setPendingDialog] = useState<MacroParamSchema | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const source = useWorkspace((s) => s.source);
  const title = useWorkspace((s) => s.title);
  const preview = useWorkspace((s) => s.preview);
  const resetWorkspace = useWorkspace((s) => s.resetWorkspace);
  const setActiveTab = useWorkspace((s) => s.setActiveTab);

  const { data: macros = [] } = useSWR("macros", () => listMacros(), {
    revalidateOnFocus: false,
  });

  // 메뉴가 열려 있는 동안에만 outside-click 리스너 부착 (BrainDropdown 컨벤션)
  useEffect(() => {
    if (!openMenu) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpenMenu(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [openMenu]);

  const runMacro = (macroId: string) => {
    const schema = MACRO_PARAM_SCHEMAS[macroId];
    if (schema) {
      setPendingDialog(schema);
      return;
    }
    void executeMacroAction(macroId);
  };

  const MENUS = buildMenus({
    source,
    title,
    preview,
    macros,
    resetWorkspace,
    setActiveTab,
    openPicker: () => setPickerOpen(true),
    runMacro,
  });

  return (
    <div ref={ref} className="no-print flex items-center gap-0.5 border-b border-neutral-200 bg-neutral-50 px-2 py-0.5 dark:border-neutral-800 dark:bg-neutral-950">
      {Object.entries(MENUS).map(([name, items]) => (
        <div key={name} className="relative">
          <button
            onClick={() => setOpenMenu(openMenu === name ? null : name)}
            onMouseEnter={() => { if (openMenu) setOpenMenu(name); }}
            className={`rounded px-2.5 py-1 text-xs ${
              openMenu === name
                ? "bg-neutral-200 dark:bg-neutral-800"
                : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-900"
            }`}
          >
            {name}
          </button>
          {openMenu === name && (
            <div className="absolute left-0 top-full z-40 mt-0.5 max-h-[60vh] w-64 overflow-auto rounded-lg border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
              {items.map((item, i) => {
                if (item === "divider") {
                  return <div key={i} className="my-1 border-t border-neutral-100 dark:border-neutral-800" />;
                }
                // 그룹 헤더 — 직전 항목과 group 이 다를 때 1회 렌더
                const prev = i > 0 ? items[i - 1] : undefined;
                const prevGroup = prev && prev !== "divider" ? prev.group : undefined;
                const showGroup = !!item.group && item.group !== prevGroup;
                return (
                  <div key={`${name}-${i}`}>
                    {showGroup && (
                      <div className="px-3 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
                        {item.group}
                      </div>
                    )}
                    <button
                      onClick={() => {
                        if (item.disabled) return;
                        item.action();
                        setOpenMenu(null);
                      }}
                      aria-disabled={item.disabled}
                      title={item.disabled ? item.disabledReason : undefined}
                      className={`block w-full px-3 py-1.5 text-left text-xs ${
                        item.disabled
                          ? "cursor-not-allowed text-neutral-300 dark:text-neutral-600"
                          : "text-neutral-700 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800"
                      }`}
                    >
                      {item.label}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
      <div className="ml-auto">
        <ExportMenu />
      </div>
      {pickerOpen && <DocumentPicker onClose={() => setPickerOpen(false)} />}
      {pendingDialog && (
        <MacroParamDialog
          schema={pendingDialog}
          onCancel={() => setPendingDialog(null)}
          onConfirm={(params) => {
            const macroId = pendingDialog.macroId;
            setPendingDialog(null);
            void executeMacroAction(macroId, params);
          }}
        />
      )}
    </div>
  );
}
