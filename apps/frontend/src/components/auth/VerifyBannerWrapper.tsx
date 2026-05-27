"use client";

import useSWR from "swr";
import { getMe } from "@/lib/api";
import { VerifyBanner } from "./VerifyBanner";

export default function VerifyBannerWrapper() {
  const { data: user } = useSWR("auth:me", () => getMe().catch(() => null), {
    shouldRetryOnError: false,
  });
  return <VerifyBanner emailVerified={user?.email_verified} />;
}
