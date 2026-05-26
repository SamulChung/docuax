import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const token = request.cookies.get("docuax_token")?.value;
  const { pathname } = request.nextUrl;

  // /app 및 하위 경로 보호
  if (pathname.startsWith("/app")) {
    if (!token) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  // 이미 로그인된 사용자가 랜딩(/)에 접근하면 /app으로 리다이렉트
  if (pathname === "/") {
    if (token) {
      return NextResponse.redirect(new URL("/app", request.url));
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  // /app 경로 전체와 / 에만 미들웨어 적용 (정적 파일·API 제외)
  matcher: ["/", "/app/:path*"],
};
