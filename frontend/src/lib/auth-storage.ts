/**
 * Portal auth: access token + user snapshot.
 * - Remember me: persist in localStorage (survives browser restart until explicit logout).
 * - No remember me: sessionStorage only (cleared when the browser session ends).
 */

export const ACCESS_TOKEN_KEY = "medassist_access_token";
/** @deprecated Use ACCESS_TOKEN_KEY — same string; kept for legacy imports */
export const TOKEN_KEY = ACCESS_TOKEN_KEY;
export const USER_JSON_KEY = "medassist_user";

export function getStoredAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return (
    sessionStorage.getItem(ACCESS_TOKEN_KEY) ?? localStorage.getItem(ACCESS_TOKEN_KEY)
  );
}

export function getStoredUserJson(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(USER_JSON_KEY) ?? localStorage.getItem(USER_JSON_KEY);
}

export function setPortalSession(
  rememberMe: boolean,
  accessToken: string,
  userJson: string
): void {
  if (typeof window === "undefined") return;
  if (rememberMe) {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(USER_JSON_KEY, userJson);
    sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    sessionStorage.removeItem(USER_JSON_KEY);
  } else {
    sessionStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    sessionStorage.setItem(USER_JSON_KEY, userJson);
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(USER_JSON_KEY);
  }
}

export function clearPortalSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(USER_JSON_KEY);
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(USER_JSON_KEY);
}
