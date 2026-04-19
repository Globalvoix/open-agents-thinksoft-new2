import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { WebAgentUIMessage } from "@/app/types";

const getChatMessagesMock = async () => [] as Array<{ role: string }>;

mock.module("@/lib/db/sessions", () => ({
  getChatMessages: getChatMessagesMock,
}));

const originalFetch = globalThis.fetch;
const originalFirecrawlApiKey = process.env.FIRECRAWL_API_KEY;

describe("ui-first-turn-preflight", () => {
  beforeEach(() => {
    process.env.FIRECRAWL_API_KEY = "test-firecrawl-key";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;

    if (originalFirecrawlApiKey === undefined) {
      delete process.env.FIRECRAWL_API_KEY;
    } else {
      process.env.FIRECRAWL_API_KEY = originalFirecrawlApiKey;
    }
  });

  test("detects likely first-turn UI prompts", async () => {
    const { __test__ } = await import("./ui-first-turn-preflight");

    expect(__test__.isLikelyUiPrompt("Create a SaaS landing page")).toBe(true);
    expect(__test__.isLikelyUiPrompt("Fix my TypeScript build error")).toBe(
      false,
    );
  });

  test("filters obvious non-competitor hosts when choosing a result", async () => {
    const { __test__ } = await import("./ui-first-turn-preflight");

    const selected = __test__.chooseCompetitor([
      {
        url: "https://github.com/acme/example",
        title: "GitHub",
        description: null,
      },
      {
        url: "https://linear.app",
        title: "Linear",
        description: "Issue tracking",
      },
    ]);

    expect(selected?.url).toBe("https://linear.app");
  });

  test("builds a competitor-backed preflight for first-turn UI chats", async () => {
    const fetchMock = async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith("/search")) {
        return new Response(
          JSON.stringify({
            success: true,
            results: [
              {
                url: "https://linear.app",
                title: "Linear",
                description: "Issue tracking tool",
              },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (url.endsWith("/scrape")) {
        return new Response(
          JSON.stringify({
            success: true,
            screenshot: "https://cdn.example.com/linear-home.png",
            markdown: "# Hero\n## Features\n## Pricing",
            metadata: {
              title: "Linear",
              description: "Plan and build products",
              ogImage: null,
              favicon: null,
              language: "en",
            },
            extractedImages: ["https://cdn.example.com/hero.png"],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    };

    globalThis.fetch = fetchMock as typeof fetch;

    const { buildUiFirstTurnPreflight } = await import(
      "./ui-first-turn-preflight"
    );

    const messages = [
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "Create a SaaS landing page" }],
      },
    ] satisfies WebAgentUIMessage[];

    const result = await buildUiFirstTurnPreflight({
      chatId: "chat-1",
      messages,
    });

    expect(result).not.toBeNull();
    expect(result?.competitorUrl).toBe("https://linear.app");
    expect(result?.competitorScreenshot).toBe(
      "https://cdn.example.com/linear-home.png",
    );
    expect(result?.customInstructions).toContain("# Server-Side UI Studio Project");
    expect(result?.customInstructions).toContain("https://linear.app");
    expect(result?.uiStudioProject.layoutBlueprints.length).toBeGreaterThan(1);
    expect(result?.uiStudioProject.assetPlan[0]?.role).toBe("hero-art");
    expect(result?.uiStudioProject.motionStoryboard.beats[0]?.phase).toBe(
      "first-paint",
    );
  });
});
