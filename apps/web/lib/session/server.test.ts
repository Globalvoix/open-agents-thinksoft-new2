import { describe, expect, test } from "bun:test";
import { getGuestSessionFromCookie } from "./server";

describe("guest session parsing", () => {
  test("builds a guest session from a guest cookie value", () => {
    const session = getGuestSessionFromCookie(
      "123e4567-e89b-12d3-a456-426614174000",
    );

    expect(session).toMatchObject({
      authProvider: "guest",
      user: {
        id: "123e4567-e89b-12d3-a456-426614174000",
        username: "guest-123e4567",
        name: "Guest User",
      },
    });
  });

  test("returns undefined when the guest cookie is missing", () => {
    expect(getGuestSessionFromCookie(undefined)).toBeUndefined();
    expect(getGuestSessionFromCookie("")).toBeUndefined();
  });
});
