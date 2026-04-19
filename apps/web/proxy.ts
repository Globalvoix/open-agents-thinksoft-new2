import { EncryptJWT, base64url } from "jose";
import { type NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE_NAME = "_user_session_";
const GUEST_SESSION_COOKIE_NAME = "_guest_session_";
const GUEST_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

export default async function proxy(req: NextRequest) {
  const sessionCookie = req.cookies.get(SESSION_COOKIE_NAME);
  const guestCookie = req.cookies.get(GUEST_SESSION_COOKIE_NAME);

  if (sessionCookie?.value || guestCookie?.value) {
    return NextResponse.next();
  }

  const userId = crypto.randomUUID();
  const response = NextResponse.next();
  response.cookies.set(GUEST_SESSION_COOKIE_NAME, userId, {
    path: "/",
    httpOnly: true,
    maxAge: GUEST_COOKIE_MAX_AGE,
    sameSite: "lax",
  });

  const jweSecret = process.env.JWE_SECRET;
  if (!jweSecret) {
    return response;
  }

  const shortId = userId.replace(/-/g, "").substring(0, 8);
  const username = `guest-${shortId}`;
  const session = {
    created: Date.now(),
    authProvider: "guest" as const,
    user: {
      id: userId,
      username,
      email: undefined,
      avatar: "",
      name: "Guest User",
    },
  };

  let keyBytes: Uint8Array;
  try {
    keyBytes = base64url.decode(jweSecret);
    if (keyBytes.length !== 32) {
      console.error(
        `[proxy] JWE_SECRET decoded to ${keyBytes.length} bytes, expected 32. Skipping signed guest session creation.`,
      );
      return response;
    }
  } catch {
    console.error(
      "[proxy] JWE_SECRET is not valid base64url. Skipping signed guest session creation.",
    );
    return response;
  }

  const token = await new EncryptJWT(session as Record<string, unknown>)
    .setExpirationTime("1y")
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .encrypt(keyBytes);

  response.cookies.set(SESSION_COOKIE_NAME, token, {
    path: "/",
    httpOnly: true,
    maxAge: GUEST_COOKIE_MAX_AGE,
    sameSite: "lax",
  });

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
