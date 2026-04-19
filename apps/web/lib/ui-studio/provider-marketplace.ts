import type {
  McpContextSummary,
  SkillMetadata,
  UiProviderCandidate,
} from "@open-harness/agent";

const INTERNAL_PROVIDER_CANDIDATES: UiProviderCandidate[] = [
  {
    id: "firecrawl-reference-research",
    name: "Firecrawl reference research",
    category: "layout",
    sourceType: "internal",
    capabilities: ["competitor-research", "screenshots", "layout-cues"],
    qualitySignals: ["reference-grounded", "category-aware"],
    recommendedUse: "Find a category leader and extract layout and product cues",
    status: "preferred",
    rationale: "Grounds the build in real market references before code is written.",
  },
  {
    id: "together-asset-studio",
    name: "Together asset studio",
    category: "asset",
    sourceType: "internal",
    capabilities: ["hero-art", "mockups", "textures", "editorial-visuals"],
    qualitySignals: ["bespoke-assets", "style-consistency"],
    recommendedUse: "Generate custom visuals when stock media is too generic",
    status: "preferred",
    rationale: "Adds custom visual language instead of relying on template stock.",
  },
  {
    id: "media-curator",
    name: "Media curator",
    category: "asset",
    sourceType: "internal",
    capabilities: ["stock-photos", "stock-video", "asset-curation"],
    qualitySignals: ["real-media", "fast-fallback"],
    recommendedUse: "Source real imagery or video when generated assets are unnecessary",
    status: "candidate",
    rationale: "Keeps hero and support sections from falling back to placeholders.",
  },
];

function inferSkillCategory(skillName: string): UiProviderCandidate["category"] {
  const normalized = skillName.toLowerCase();
  if (
    normalized.includes("animation") ||
    normalized.includes("motion") ||
    normalized.includes("gsap")
  ) {
    return "animation";
  }

  if (normalized.includes("icon")) {
    return "icon";
  }

  if (
    normalized.includes("ui") ||
    normalized.includes("design") ||
    normalized.includes("frontend") ||
    normalized.includes("clone")
  ) {
    return "skill";
  }

  return "generic";
}

function skillToProvider(skill: SkillMetadata): UiProviderCandidate {
  return {
    id: `skill:${skill.name}`,
    name: skill.name,
    category: inferSkillCategory(skill.name),
    sourceType: "skill",
    capabilities: [skill.description],
    qualitySignals: ["repo-installed", "specialist-knowledge"],
    recommendedUse: skill.description,
    status: "candidate",
    rationale: "Installed skill available for specialized UI direction or implementation guidance.",
  };
}

function mcpToolCategory(
  tool: McpContextSummary["tools"][number],
): UiProviderCandidate["category"] {
  switch (tool.providerKind) {
    case "animation":
      return "animation";
    case "icon":
      return "icon";
    case "component":
      return "component";
    default:
      return "generic";
  }
}

export function buildUiProviderMarketplace(params: {
  mcp?: McpContextSummary;
  skills: SkillMetadata[];
}): UiProviderCandidate[] {
  const { mcp, skills } = params;
  const candidates = new Map<string, UiProviderCandidate>();

  for (const provider of INTERNAL_PROVIDER_CANDIDATES) {
    candidates.set(provider.id, provider);
  }

  for (const skill of skills) {
    const provider = skillToProvider(skill);
    candidates.set(provider.id, provider);
  }

  for (const server of mcp?.servers ?? []) {
    const existing = candidates.get(`mcp:${server.id}`);
    const toolNames = (mcp?.tools ?? [])
      .filter((tool) => tool.serverId === server.id)
      .map((tool) => tool.toolName)
      .slice(0, 6);

    const category =
      server.providerKind === "component" ||
      server.providerKind === "animation" ||
      server.providerKind === "icon"
        ? server.providerKind
        : "generic";

    candidates.set(`mcp:${server.id}`, {
      id: `mcp:${server.id}`,
      name: server.name,
      category,
      sourceType: "mcp",
      capabilities: toolNames.length > 0 ? toolNames : ["tool-discovery"],
      qualitySignals: [
        server.connected ? "connected" : "offline",
        server.toolCount > 0 ? "tool-backed" : "no-tools",
      ],
      recommendedUse:
        category === "component"
          ? "Use as source material for component composition and adaptation"
          : category === "animation"
            ? "Use as motion source material when it strengthens the storyboard"
            : category === "icon"
              ? "Use to curate a consistent icon and symbol language"
              : "Use selectively when it contributes meaningful UI quality",
      status: server.connected ? "candidate" : "fallback",
      rationale: server.connected
        ? "Provider is available and can be evaluated for quality fit."
        : "Provider exists but is not currently connected, so it is fallback-only.",
    });

    if (existing) {
      candidates.set(`mcp:${server.id}`, {
        ...existing,
        ...candidates.get(`mcp:${server.id}`),
      });
    }
  }

  for (const tool of mcp?.tools ?? []) {
    const id = `mcp-tool:${tool.fullToolName}`;
    candidates.set(id, {
      id,
      name: tool.fullToolName,
      category: mcpToolCategory(tool),
      sourceType: "mcp",
      capabilities: [tool.description],
      qualitySignals: ["tool-level-source"],
      recommendedUse: tool.description,
      status: "candidate",
      rationale: "Specific MCP tool available as a candidate source in the UI marketplace.",
    });
  }

  return Array.from(candidates.values()).sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}
