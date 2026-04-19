import { cookies } from "next/headers";
import { GUEST_SESSION_COOKIE_NAME, SESSION_COOKIE_NAME } from "./constants";
import { getGuestSessionFromCookie, getSessionFromCookie } from "./server";
import { cache } from "react";

export const getServerSession = cache(async () => {
  const store = await cookies();
  const cookieValue = store.get(SESSION_COOKIE_NAME)?.value;
  const signedSession = await getSessionFromCookie(cookieValue);
  if (signedSession) {
    return signedSession;
  }

  const guestCookieValue = store.get(GUEST_SESSION_COOKIE_NAME)?.value;
  return getGuestSessionFromCookie(guestCookieValue);
});
