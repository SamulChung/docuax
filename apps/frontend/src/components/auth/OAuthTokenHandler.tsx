"use client";

import { useEffect } from "react";
import { mutate } from "swr";

import { setAuthToken } from "@/lib/api";

/**
 * Google OAuth redirect 후 URL에서 access token을 추출하고
 * 인증 상태를 업데이트하는 클라이언트 컴포넌트.
 * URL 파라미터는 추출 후 즉시 제거 (보안).
 */
export function OAuthTokenHandler() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const token = url.searchParams.get("token");
    const oauthError = url.searchParams.get("error");
    if (token) {
      setAuthToken(token);
      url.searchParams.delete("token");
      window.history.replaceState({}, "", url.toString());
      mutate("me");
    }
    if (oauthError) {
      console.warn("OAuth error:", oauthError);
      url.searchParams.delete("error");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  return null;
}
