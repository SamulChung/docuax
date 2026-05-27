"use client";

import { useEffect } from "react";
import { mutate } from "swr";

/**
 * Google OAuth redirect 후 인증 상태를 갱신하는 클라이언트 컴포넌트.
 * 토큰은 이제 httpOnly 쿠키로 전달되므로 URL 파라미터를 읽을 필요가 없다.
 * ?error= 파라미터만 처리하고, mutate("me")로 인증 상태를 새로고침한다.
 */
export function OAuthTokenHandler() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const oauthError = url.searchParams.get("error");

    if (oauthError) {
      console.warn("OAuth error:", oauthError);
      url.searchParams.delete("error");
      window.history.replaceState({}, "", url.toString());
    }

    // 쿠키가 이미 설정되어 있으므로 SWR 캐시만 갱신한다.
    mutate("me");
  }, []);

  return null;
}
