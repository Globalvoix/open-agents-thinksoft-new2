import type { WebAgentUIMessage } from "@/app/types";
import { getChatMessages } from "@/lib/db/sessions";

const FIRECRAWL_BASE_URL = "https://api.firecrawl.dev/v1";
const FIRECRAWL_SEARCH_TIMEOUT_MS = 20_000;
const FIRECRAWL_SCRAPE_TIMEOUT_MS = 45_000;
const MAX_MARKDOWN_CHARS = 8_000;
const MAX_SECTION_HEADINGS = 8;
const BLOCKED_COMPETITOR_HOSTS = [
  "github.com",
  "www.github.com",
  "dribbble.com",
  "www.dribbble.com",
  "behance.net",
  "www.behance.net",
  "medium.com",
  "www.medium.com",
  "youtube.com",
  "www.youtube.com",
  "x.com",
  "www.x.com",
  "twitter.com",
  "www.twitter.com",
  "linkedin.com",
  "www.linkedin.com",
  "instagram.com",
  "www.instagram.com",
];

type FirecrawlSearchResult = {
  url: string;
  title: string | null;
  description: string | null;
};

type FirecrawlSearchResponse = {
  success: true;
  results: FirecrawlSearchResult[];
};

type FirecrawlScrapeResponse = {
  success: true;
  screenshot: string | null;
  markdown: string;
  metadata: {
    title: string | null;
    description: string | null;
    ogImage: string | null;
    favicon: string | null;
    language: string | null;
  } | null;
  extractedImages: string[];
};

export type UiFirstTurnPreflightResult = {
  customInstructions: string;
  competitorUrl: string;
  competitorTitle: string | null;
  competitorScreenshot: string | null;
};

type FirecrawlErrorResponse = {
  success: false;
  error: string;
};

function getLatestUserText(messages: WebAgentUIMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "user") {
      continue;
    }

    const text = message.parts
      .filter(
        (part): part is { type: "text"; text: string } => part.type === "text",
      )
      .map((part) => part.text)
      .join(" ")
      .trim();

    if (text.length > 0) {
      return text;
    }
  }

  return "";
}

function normalizePromptCategory(prompt: string): string {
  return prompt
    .toLowerCase()
    .replace(
      /\b(create|build|make|design|generate|craft|spin up|prototype|clone|launch)\b/g,
      "",
    )
    .replace(/\b(a|an|the|for|with|that|to)\b/g, " ")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isLikelyUiPrompt(prompt: string): boolean {
  const normalizedPrompt = prompt.toLowerCase();

  const directUiPattern =
    /\b(landing page|homepage|dashboard|website|web app|saas|ui|ux|hero section|product page|marketing site|portfolio|login page|pricing page|app design|frontend)\b/;
  const buildPattern =
    /\b(create|build|make|design|generate|prototype|clone|redesign)\b/;

  return (
    directUiPattern.test(normalizedPrompt) ||
    (buildPattern.test(normalizedPrompt) &&
      /\b(page|site|app|product|interface|screen)\b/.test(normalizedPrompt))
  );
}

function hasPriorUserMessages(
  messages: Awaited<ReturnType<typeof getChatMessages>>,
): boolean {
  return messages.some((message) => message.role === "user");
}

function inferSearchQuery(prompt: string): string {
  const category = normalizePromptCategory(prompt);
  if (category.length === 0) {
    return "best modern product website";
  }

  return `best ${category} website`;
}

function chooseCompetitor(
  results: FirecrawlSearchResult[],
): FirecrawlSearchResult | null {
  for (const result of results) {
    try {
      const hostname = new URL(result.url).hostname.toLowerCase();
      if (BLOCKED_COMPETITOR_HOSTS.includes(hostname)) {
        continue;
      }

      return result;
    } catch {
      continue;
    }
  }

  return results[0] ?? null;
}

function extractSectionHeadings(markdown: string): string[] {
  const headings = markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^#{1,3}\s+/.test(line))
    .map((line) => line.replace(/^#{1,3}\s+/, "").trim())
    .filter((line) => line.length > 0);

  return [...new Set(headings)].slice(0, MAX_SECTION_HEADINGS);
}

function truncateMarkdown(markdown: string): string {
  return markdown.length > MAX_MARKDOWN_CHARS
    ? `${markdown.slice(0, MAX_MARKDOWN_CHARS).trim()}\n...`
    : markdown;
}

async function postToFirecrawl<T>(
  path: string,
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<T | FirecrawlErrorResponse> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      error: "FIRECRAWL_API_KEY is not configured.",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${FIRECRAWL_BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await response.text();
    const parsed = JSON.parse(text) as T | FirecrawlErrorResponse;
    return parsed;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function buildPreflightInstructions(params: {
  prompt: string;
  searchQuery: string;
  competitor: FirecrawlSearchResult;
  scrape: FirecrawlScrapeResponse;
}): string {
  const { prompt, searchQuery, competitor, scrape } = params;
  const headings = extractSectionHeadings(scrape.markdown);
  const screenshot = scrape.screenshot ?? "not available";
  const referenceTitle =
    scrape.metadata?.title ?? competitor.title ?? "Unnamed competitor";
  const referenceDescription =
    scrape.metadata?.description ?? competitor.description ?? "No description";
  const markdownExcerpt = truncateMarkdown(scrape.markdown);
  const imageHints = scrape.extractedImages.slice(0, 4);

  return [
    "# Server-Side UI Preflight",
    "This chat is on its first user turn and already has a grounded design reference. Treat this as mandatory context before you plan or build.",
    "",
    "## Required workflow",
    '1. Call `skill(\"website-cloning\")` before implementation.',
    "2. Use the competitor reference below as the visual benchmark, but rewrite all branding, copy, product details, and assets for the user's app.",
    "3. If you need components, icons, motion, or custom visuals, use the available MCP tools and `together_image` before falling back to generic placeholders.",
    "",
    "## User request",
    prompt,
    "",
    "## Competitor research",
    `- Search query: ${searchQuery}`,
    `- Selected competitor: ${referenceTitle}`,
    `- URL: ${competitor.url}`,
    `- Description: ${referenceDescription}`,
    `- Screenshot: ${screenshot}`,
    ...(imageHints.length > 0
      ? [`- Asset hints: ${imageHints.join(", ")}`]
      : []),
    ...(headings.length > 0
      ? [`- Key sections: ${headings.join(" | ")}`]
      : []),
    "",
    "## Extracted reference notes",
    markdownExcerpt,
    "",
    "## Non-negotiables",
    "- Keep the user's requested framework and stack.",
    "- Do not copy the competitor's branding or product claims.",
    "- Match the quality bar, information hierarchy, spacing, and interaction polish of the reference.",
  ].join("\n");
}

export async function buildUiFirstTurnPreflight(params: {
  chatId: string;
  messages: WebAgentUIMessage[];
}): Promise<UiFirstTurnPreflightResult | null> {
  const { chatId, messages } = params;
  const latestUserText = getLatestUserText(messages);
  if (!isLikelyUiPrompt(latestUserText)) {
    return null;
  }

  const persistedMessages = await getChatMessages(chatId);
  if (hasPriorUserMessages(persistedMessages)) {
    return null;
  }

  const searchQuery = inferSearchQuery(latestUserText);
  const searchResponse = await postToFirecrawl<FirecrawlSearchResponse>(
    "/search",
    {
      query: searchQuery,
      limit: 5,
    },
    FIRECRAWL_SEARCH_TIMEOUT_MS,
  );

  if (!searchResponse.success || searchResponse.results.length === 0) {
    return null;
  }

  const competitor = chooseCompetitor(searchResponse.results);
  if (!competitor) {
    return null;
  }

  const scrapeResponse = await postToFirecrawl<FirecrawlScrapeResponse>(
    "/scrape",
    {
      url: competitor.url,
      formats: ["markdown", "screenshot"],
      onlyMainContent: false,
      waitFor: 3000,
    },
    FIRECRAWL_SCRAPE_TIMEOUT_MS,
  );

  if (!scrapeResponse.success) {
    return null;
  }

  return {
    customInstructions: buildPreflightInstructions({
      prompt: latestUserText,
      searchQuery,
      competitor,
      scrape: scrapeResponse,
    }),
    competitorUrl: competitor.url,
    competitorTitle: competitor.title,
    competitorScreenshot: scrapeResponse.screenshot,
  };
}

export const __test__ = {
  chooseCompetitor,
  extractSectionHeadings,
  getLatestUserText,
  inferSearchQuery,
  isLikelyUiPrompt,
  normalizePromptCategory,
};
