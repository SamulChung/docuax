"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_BASE || "https://docuax-production.up.railway.app";

const CONFIGS = {
  claude: {
    label: "Claude Desktop",
    filename: "claude_desktop_config.json",
    code: JSON.stringify(
      {
        mcpServers: {
          docuax: {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-fetch"],
            env: { MCP_SERVER_URL: `${API}/api/v1/mcp/spec` },
          },
        },
      },
      null,
      2
    ),
  },
  cursor: {
    label: "Cursor / Windsurf",
    filename: ".cursor/mcp.json",
    code: JSON.stringify(
      { servers: [{ name: "DocuAI", url: `${API}/api/v1/mcp/spec` }] },
      null,
      2
    ),
  },
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy} className="text-neutral-400 hover:text-brand">
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

export default function McpPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-bold">MCP 서버 등록</h1>
      <p className="mb-8 text-sm text-neutral-500">
        AI 에이전트(Claude, Cursor 등)에서 DocuAI의 문서 변환 기능을 직접 호출할 수 있습니다.
      </p>
      {Object.entries(CONFIGS).map(([key, cfg]) => (
        <div key={key} className="mb-6 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">{cfg.label}</h2>
            <span className="text-xs text-neutral-400">{cfg.filename}</span>
          </div>
          <div className="relative rounded bg-neutral-950 p-3">
            <pre className="overflow-auto text-xs text-neutral-200">{cfg.code}</pre>
            <div className="absolute right-2 top-2">
              <CopyButton text={cfg.code} />
            </div>
          </div>
        </div>
      ))}
      <div className="rounded-lg bg-brand/5 p-4 text-sm text-brand dark:bg-brand/10">
        <p className="font-semibold mb-1">MCP 서버 스펙 URL</p>
        <code className="text-xs">{API}/api/v1/mcp/spec</code>
      </div>
    </div>
  );
}
