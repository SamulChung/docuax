// 익명 사용자 ID + organization을 localStorage에 보관.
// 실제 인증·SSO 도입 시 이 모듈만 교체하면 됨.

const OWNER_KEY = "docuax.owner_id";
const ORG_KEY = "docuax.organization_id";

function uuidV4(): string {
  // 의존성 없는 간단한 UUIDv4
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getOwnerId(): string {
  if (typeof window === "undefined") return "anonymous";
  let id = localStorage.getItem(OWNER_KEY);
  if (!id) {
    id = `u-${uuidV4().slice(0, 12)}`;
    localStorage.setItem(OWNER_KEY, id);
  }
  return id;
}

export function getOrganizationId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ORG_KEY);
}

export function setOrganizationId(id: string | null): void {
  if (typeof window === "undefined") return;
  if (id) {
    localStorage.setItem(ORG_KEY, id);
  } else {
    localStorage.removeItem(ORG_KEY);
  }
  // 같은 탭 다른 컴포넌트에 알림
  window.dispatchEvent(new CustomEvent("docuax:org-changed", { detail: id }));
}
