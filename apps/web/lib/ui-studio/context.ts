import "server-only";

import path from "node:path";
import type {
  McpContextSummary,
  SkillMetadata,
  UiStudioContextSummary,
} from "@open-harness/agent";
import type { Sandbox } from "@open-harness/sandbox";
import { collectInstalledUiSkillNames } from "@/lib/skills/external-ui-skills";
import { buildUiProviderMarketplace } from "./provider-marketplace";

const TOKEN_ARTIFACT_CANDIDATES = [
  "design-system/tweakcn.tokens.json",
  "design-system/theme.css",
  ".open-harness/design-system/tokens.json",
  "app/globals.css",
  "src/app/globals.css",
  "styles/globals.css",
  "src/styles/globals.css",
];

const DESIGN_MEMORY_CANDIDATES = [
  "design-system/tweakcn.tokens.json",
  "design-system/house-style.json",
  "design-system/page-overrides.json",
  "design-system/MASTER.md",
  ".open-harness/ui-studio/memory.json",
];

const REFERENCE_FILE_CANDIDATES = [
  "design-system/MASTER.md",
  "design-system/page-overrides.json",
  "uiux/design-system/MASTER.md",
  "uiux/README.md",
  "components.json",
  "tailwind.config.ts",
  "tailwind.config.js",
];

const STUDIO_SUBAGENTS = [
  "creative-director",
  "layout-composer",
  "asset-director",
  "motion-director",
  "component-composer",
  "ui-critic",
];

async function existingPaths(
  sandbox: Sandbox,
  relativePaths: string[],
): Promise<string[]> {
  const matches: string[] = [];

  for (const relativePath of relativePaths) {
    const absolutePath = path.posix.join(sandbox.workingDirectory, relativePath);
    try {
      await sandbox.access(absolutePath);
      matches.push(relativePath);
    } catch {
      continue;
    }
  }

  return matches;
}

export async function buildUiStudioContext(params: {
  sandbox: Sandbox;
  skills: SkillMetadata[];
  mcp?: McpContextSummary;
}): Promise<UiStudioContextSummary> {
  const { sandbox, skills, mcp } = params;

  const [tokenArtifactPaths, designMemoryPaths, referencePaths] =
    await Promise.all([
      existingPaths(sandbox, TOKEN_ARTIFACT_CANDIDATES),
      existingPaths(sandbox, DESIGN_MEMORY_CANDIDATES),
      existingPaths(sandbox, REFERENCE_FILE_CANDIDATES),
    ]);

  return {
    installedUiSkills: collectInstalledUiSkillNames(skills),
    preferredTokenArtifactPath: "design-system/tweakcn.tokens.json",
    tokenArtifactPaths,
    designMemoryPaths,
    referencePaths,
    providerCandidates: buildUiProviderMarketplace({ mcp, skills }),
    studioSubagents: STUDIO_SUBAGENTS,
    hasDesignTokens: tokenArtifactPaths.length > 0,
    hasTweakcnTokens: tokenArtifactPaths.some((entry) =>
      /tweakcn|theme\.css|tokens/i.test(entry),
    ),
  };
}
