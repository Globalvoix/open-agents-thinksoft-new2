import type { NextRequest } from "next/server";
import type { Session } from "./types";
import {
  GUEST_SESSION_COOKIE_NAME,
  SESSION_COOKIE_NAME,
} from "./constants";
import { decryptJWE } from "@/lib/jwe/decrypt";

function buildGuestSession(guestId: string): Session {
  const normalizedId = guestId.trim();
  const shortId = normalizedId.replace(/-/g, "").slice(0, 8) || "guest";

  return {
    created: Date.now(),
    authProvider: "guest",
    user: {
      id: normalizedId,
      username: `guest-${shortId}`,
      email: undefined,
      avatar: "",
      name: "Guest User",
    },
  };
}

export async function getSessionFromCookie(
  cookieValue?: string,
): Promise<Session | undefined> {
  if (cookieValue) {
    const decrypted = await decryptJWE<Session>(cookieValue);
    if (decrypted) {
      return {
        created: decrypted.created,
        authProvider: decrypted.authProvider,
        user: decrypted.user,
      };
    }
  }
}

export function getGuestSessionFromCookie(guestId?: string): Session | undefined {
  if (!guestId?.trim()) {
    return undefined;
  }

  return buildGuestSession(guestId);
}

export async function getSessionFromReq(
  req: NextRequest,
): Promise<Session | undefined> {
  const cookieValue = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const signedSession = await getSessionFromCookie(cookieValue);
  if (signedSession) {
    return signedSession;
  }

  const guestCookieValue = req.cookies.get(GUEST_SESSION_COOKIE_NAME)?.value;
  return getGuestSessionFromCookie(guestCookieValue);
}
