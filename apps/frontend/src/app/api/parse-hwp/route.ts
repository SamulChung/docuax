import { NextRequest, NextResponse } from "next/server";

const MAX_SIZE = 50 * 1024 * 1024; // 50MB

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "파일이 없습니다" }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "파일 크기는 50MB 이하여야 합니다" },
        { status: 400 }
      );
    }

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["hwp", "hwpx"].includes(ext ?? "")) {
      return NextResponse.json(
        { error: "HWP 또는 HWPX 파일만 지원합니다" },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();

    // kordoc 동적 import (서버사이드 전용)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { parse } = await import("kordoc");
    const result = await parse(arrayBuffer);

    if (!result.success) {
      return NextResponse.json(
        {
          error:
            "파일을 읽을 수 없습니다. 암호화된 파일이거나 손상된 파일일 수 있습니다.",
        },
        { status: 422 }
      );
    }

    const markdown = result.markdown;
    const title = file.name.replace(/\.(hwp|hwpx)$/i, "");

    return NextResponse.json({ markdown, title });
  } catch (err) {
    console.error("HWP 파싱 오류:", err);
    return NextResponse.json(
      {
        error:
          "파일을 읽을 수 없습니다. 암호화된 파일이거나 손상된 파일일 수 있습니다.",
      },
      { status: 422 }
    );
  }
}
