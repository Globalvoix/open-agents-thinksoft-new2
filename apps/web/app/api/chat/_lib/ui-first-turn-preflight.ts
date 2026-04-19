import type {
  UiAssetFamily,
  UiLayoutBlueprint,
  UiMotionStoryboard,
  UiProviderCandidate,
  UiStudioContextSummary,
  UiStudioProject,
  UiStyleDna,
} from "@open-harness/agent";
import type { WebAgentUIMessage } from "@/app/types";
import { getChatMessages } from "@/lib/db/sessions";

const FIRECRAWL_BASE_URL = "https://api.firecrawl.dev/v1";
const FIRECRAWL_SEARCH_TIMEOUT_MS = 20_000;
const FIRECRAWL_SCRAPE_TIMEOUT_MS = 45_000;
const MAX_MARKDOWN_CHARS = 8_000;
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
  uiStudioProject: UiStudioProject;
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
  project: UiStudioProject;
  searchQuery: string;
  competitor: FirecrawlSearchResult;
}): string {
  const { project, searchQuery, competitor } = params;
  const screenshot = project.referenceScreenshot ?? "not available";
  const primaryBlueprint = project.layoutBlueprints[0];

  return [
    "# Server-Side UI Studio Project",
    "This chat is on its first user turn and already has a structured UI studio brief. Treat it as first-class context before you plan or build.",
    "",
    "## Build posture",
    "1. Invent from this brief instead of falling back to a default SaaS template.",
    "2. Use providers and MCPs only when they materially improve the output; they are candidates, not requirements.",
    "3. Keep every layer cohesive: layout, type, icons, assets, motion, surfaces, and interaction posture.",
    "",
    "## Product brief",
    project.productBrief,
    `Audience: ${project.audience}`,
    `Market position: ${project.marketPosition}`,
    "",
    "## Reference grounding",
    `- Search query: ${searchQuery}`,
    `- Selected competitor: ${competitor.title ?? "Unnamed competitor"}`,
    `- URL: ${competitor.url}`,
    `- Description: ${competitor.description ?? "No description"}`,
    `- Screenshot: ${screenshot}`,
    "",
    "## Style DNA",
    `- Concept: ${project.styleDna.concept}`,
    `- Tone: ${project.styleDna.tone}`,
    `- Typography: ${project.styleDna.typographyMood}`,
    `- Palette: ${project.styleDna.paletteDirection}`,
    `- Surfaces: ${project.styleDna.surfaceLanguage}`,
    `- Distinguishing idea: ${project.styleDna.distinguishingIdea}`,
    "",
    "## Layout blueprint",
    `- Primary route: ${primaryBlueprint?.name ?? "custom blueprint"}`,
    `- Narrative: ${primaryBlueprint?.narrativeStructure ?? "not set"}`,
    `- Page roles: ${primaryBlueprint?.pageRoles.join(" | ") ?? "not set"}`,
    "",
    "## Asset roles",
    ...project.assetPlan.map(
      (asset) =>
        `- ${asset.role}: ${asset.intent} [${asset.sourcePreference}]`,
    ),
    "",
    "## Motion beats",
    ...project.motionStoryboard.beats.map(
      (beat) => `- ${beat.phase}: ${beat.objective} (${beat.style})`,
    ),
    "",
    "## Remix pressure",
    ...project.remixPlan.map(
      (remix) => `- ${remix.mode}: ${remix.goal} (${remix.rationale})`,
    ),
  ].join("\n");
}

function inferAudience(prompt: string): string {
  const lower = prompt.toLowerCase();
  if (/\b(developer|api|engineering|devtool|tooling)\b/.test(lower)) {
    return "technical teams buying on craft, speed, and product taste";
  }

  if (/\b(finance|fintech|bank|investment)\b/.test(lower)) {
    return "trust-sensitive buyers expecting polish, clarity, and authority";
  }

  if (/\b(ai|automation|agent)\b/.test(lower)) {
    return "forward-leaning product teams evaluating novelty and credibility";
  }

  return "modern digital buyers expecting a premium product story";
}

function inferMarketPosition(prompt: string): string {
  const lower = prompt.toLowerCase();
  if (/\benterprise|b2b|team|workspace|dashboard)\b/.test(lower)) {
    return "premium software product with high trust and operational depth";
  }

  if (/\bconsumer|community|creator|portfolio)\b/.test(lower)) {
    return "brand-led digital product with strong emotional storytelling";
  }

  return "category-defining product positioned above commodity SaaS design";
}

function buildStyleDna(params: {
  prompt: string;
  competitor: FirecrawlSearchResult;
  scrape: FirecrawlScrapeResponse;
}): UiStyleDna {
  const { prompt, competitor, scrape } = params;
  const lower = prompt.toLowerCase();
  const isTechnical = /\b(ai|developer|api|dashboard|platform|workflow)\b/.test(
    lower,
  );
  const isEditorial = /\b(brand|studio|agency|creator|portfolio)\b/.test(lower);

  return {
    concept: isTechnical
      ? `High-authority product theater inspired by ${competitor.title ?? "the selected reference"}`
      : isEditorial
        ? "Editorial storytelling with commercial clarity"
        : "Premium product narrative with cinematic emphasis",
    tone: isTechnical
      ? "confident, precise, and premium"
      : isEditorial
        ? "tasteful, expressive, and culturally aware"
        : "elevated, aspirational, and conversion-ready",
    typographyMood: isTechnical
      ? "sharp display typography balanced with rigorous product copy hierarchy"
      : "expressive display faces paired with refined editorial body rhythm",
    paletteDirection:
      scrape.metadata?.description && scrape.metadata.description.length > 40
        ? "reference-informed palette adapted into a more distinctive branded system"
        : "high-contrast palette with one memorable accent and disciplined neutrals",
    surfaceLanguage: isTechnical
      ? "layered panels, restrained gloss, controlled contrast, product-grade density"
      : "editorial surfaces with atmospheric depth, texture, and selective drama",
    shapeLanguage: isTechnical
      ? "precise rectangles with selective softness and strong edge alignment"
      : "confident geometry with a mix of rigid frames and softer atmospheric layers",
    motionMood: isTechnical
      ? "measured, structural motion that clarifies hierarchy"
      : "cinematic reveals with restrained but memorable emphasis",
    backgroundStyle: isTechnical
      ? "atmospheric gradients, mesh lighting, and low-noise texture"
      : "editorial gradients, ambient texture, and dramatic depth fields",
    distinguishingIdea: `Make ${prompt} feel unmistakably bespoke rather than registry-derived or template-led.`,
  };
}

function buildLayoutBlueprints(prompt: string): UiLayoutBlueprint[] {
  return [
    {
      id: "authority-theater",
      name: "Authority Theater",
      narrativeStructure: "open with conviction, reveal product quickly, compress proof, close emotionally",
      visualDensity: "medium with a dramatic above-the-fold focus",
      productRevealStrategy: "hero-led product reveal with immediate interface evidence",
      proofPlacement: "early trust strip followed by deeper proof later",
      ctaCadence: "one hard CTA above the fold and one narrative CTA near the close",
      scrollRhythm: "slow start, accelerating narrative, crisp ending",
      pageRoles: [
        "authority opener",
        "feature theater",
        "workflow reveal",
        "trust compression",
        "high-emotion close",
      ],
    },
    {
      id: "editorial-sequence",
      name: "Editorial Sequence",
      narrativeStructure: "story-led product positioning with contrast moments between content and visuals",
      visualDensity: "airy with bold breaks and premium pacing",
      productRevealStrategy: "editorial framing before product immersion",
      proofPlacement: "interleaved between story beats",
      ctaCadence: "soft CTA early, assertive CTA late",
      scrollRhythm: "staggered editorial chapters",
      pageRoles: [
        "tension reframe moment",
        "product reveal",
        "proof strip",
        "workflow reveal",
        "editorial CTA",
      ],
    },
    {
      id: "system-grid",
      name: "System Grid",
      narrativeStructure: "modular product system with dense proof and fast comprehension",
      visualDensity: "high, but organized and premium",
      productRevealStrategy: "grid-based surfacing of workflows and capabilities",
      proofPlacement: "continuous proof throughout the page",
      ctaCadence: "repeated low-friction CTAs anchored by one final strong CTA",
      scrollRhythm: "steady and product-driven",
      pageRoles: [
        "authority opener",
        "workflow reveal",
        "feature theater",
        "trust compression",
        "high-emotion close",
      ],
    },
  ];
}

function buildAssetPlan(prompt: string, styleDna: UiStyleDna): UiAssetFamily[] {
  return [
    {
      role: "hero-art",
      intent: `Create a premium first-impression visual system for ${prompt}`,
      sourcePreference: "generated",
      promptSeed: `${prompt}, ${styleDna.concept}, ${styleDna.backgroundStyle}`,
      notes: ["Avoid generic abstract blobs.", "Aim for branded atmosphere."],
    },
    {
      role: "product-mockup",
      intent: "Show product credibility with a cinematic interface presentation",
      sourcePreference: "generated",
      promptSeed: `${prompt} interface mockup, ${styleDna.surfaceLanguage}`,
      notes: ["Prefer angled or layered presentation.", "Keep it market-credible."],
    },
    {
      role: "ambient-texture",
      intent: "Support depth without pulling focus from content",
      sourcePreference: "mixed",
      promptSeed: `${styleDna.backgroundStyle}, subtle texture`,
      notes: ["Can be code-native if stronger than an image asset."],
    },
    {
      role: "section-support",
      intent: "Reinforce feature and proof sections without using filler imagery",
      sourcePreference: "stock",
      promptSeed: `${prompt} contextual support imagery`,
      notes: ["Only use if it improves credibility and matches the style DNA."],
    },
  ];
}

function buildMotionStoryboard(styleDna: UiStyleDna): UiMotionStoryboard {
  return {
    beats: [
      {
        phase: "first-paint",
        objective: "Make the opening feel intentional and premium without hiding core content",
        style: `${styleDna.motionMood} with staggered hierarchy reveals`,
        restraint: "content must remain readable immediately",
      },
      {
        phase: "hero-reveal",
        objective: "Introduce authority and create a memorable visual arrival",
        style: "layered reveal of typography, product frame, and ambient background",
        restraint: "one hero moment only; avoid constant spectacle",
      },
      {
        phase: "scroll-narrative",
        objective: "Give each major section a purpose-built transition",
        style: "structural section transitions tied to layout rhythm",
        restraint: "no decorative motion that slows comprehension",
      },
      {
        phase: "cta-emphasis",
        objective: "Give CTAs visual conviction without gimmicks",
        style: "micro-lifts, glow, or contrast shifts coordinated with icon language",
        restraint: "avoid noisy infinite motion loops",
      },
    ],
  };
}

function buildProviderDecisions(params: {
  uiStudioContext?: UiStudioContextSummary;
}): UiProviderCandidate[] {
  return (params.uiStudioContext?.providerCandidates ?? [])
    .map((provider) => {
      if (
        provider.category === "component" ||
        provider.category === "animation" ||
        provider.category === "icon" ||
        provider.category === "asset"
      ) {
        return {
          ...provider,
          status:
            provider.status === "fallback" ? "fallback" : "candidate",
          rationale: `${provider.rationale} Use it only if it raises the overall design quality and does not pull the UI toward a template.`,
        };
      }

      return provider;
    })
    .slice(0, 12);
}

function buildUiStudioProject(params: {
  prompt: string;
  competitor: FirecrawlSearchResult;
  scrape: FirecrawlScrapeResponse;
  uiStudioContext?: UiStudioContextSummary;
}): UiStudioProject {
  const { prompt, competitor, scrape, uiStudioContext } = params;
  const styleDna = buildStyleDna({ prompt, competitor, scrape });
  const layoutBlueprints = buildLayoutBlueprints(prompt);

  return {
    productBrief: prompt,
    audience: inferAudience(prompt),
    marketPosition: inferMarketPosition(prompt),
    referenceSummary: truncateMarkdown(scrape.markdown),
    referenceUrl: competitor.url,
    referenceScreenshot: scrape.screenshot,
    layoutBlueprints,
    styleDna,
    assetPlan: buildAssetPlan(prompt, styleDna),
    motionStoryboard: buildMotionStoryboard(styleDna),
    iconLanguage: {
      family: "single-family icon language chosen to match the product posture",
      strokeStyle: "consistent medium stroke with selective fill accents",
      fillMode: "mostly outline with deliberate solid highlights",
      opticalSize: "scaled by section importance, never mixed arbitrarily",
      spacingRule: "icons sit on a disciplined visual grid with tight alignment",
      decorativeAccent: "use geometric symbol motifs sparingly for branded emphasis",
    },
    componentGenome: {
      shapeLanguage: styleDna.shapeLanguage,
      density:
        layoutBlueprints[0]?.visualDensity ?? "medium with deliberate emphasis",
      surfaceTreatment: styleDna.surfaceLanguage,
      interactionPosture: "confident, precise, and premium rather than playful by default",
      informationWeight: "hero sections bold, proof sections compressed, detail sections controlled",
      composability: "adapt sourced components into a custom system instead of using them raw",
    },
    providerDecisions: buildProviderDecisions({ uiStudioContext }),
    critiqueHistory: [
      "Reject repeated SaaS template structure unless it is explicitly re-earned by the brief.",
      "Reject asset choices that feel like placeholders or style mismatches.",
      "Reject components that read as straight-from-registry without adaptation.",
    ],
    remixPlan: [
      {
        mode: "structure-remix",
        goal: "Break out of the default hero/features/pricing rhythm if the page starts to feel templated.",
        rationale: "Structure is the biggest source of same-looking outputs.",
      },
      {
        mode: "asset-remix",
        goal: "Upgrade visuals when hero art or support imagery feels generic.",
        rationale: "Premium sites feel art directed, not merely well colored.",
      },
      {
        mode: "component-remix",
        goal: "Recompose or restyle sourced components when they look registry-derived.",
        rationale: "Component sameness is one of the clearest vibe-coded signals.",
      },
      {
        mode: "motion-remix",
        goal: "Make motion structural and memorable if the page feels flat.",
        rationale: "Elite frontend work uses motion as part of the narrative, not decoration.",
      },
    ],
  };
}

export async function buildUiFirstTurnPreflight(params: {
  chatId: string;
  messages: WebAgentUIMessage[];
  uiStudioContext?: UiStudioContextSummary;
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

  const uiStudioProject = buildUiStudioProject({
    prompt: latestUserText,
    competitor,
    scrape: scrapeResponse,
    uiStudioContext: params.uiStudioContext,
  });

  return {
    customInstructions: buildPreflightInstructions({
      project: uiStudioProject,
      searchQuery,
      competitor,
    }),
    competitorUrl: competitor.url,
    competitorTitle: competitor.title,
    competitorScreenshot: scrapeResponse.screenshot,
    uiStudioProject,
  };
}

export const __test__ = {
  chooseCompetitor,
  getLatestUserText,
  inferSearchQuery,
  isLikelyUiPrompt,
  normalizePromptCategory,
};
