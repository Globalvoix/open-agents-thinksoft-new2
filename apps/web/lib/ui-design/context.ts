import "server-only";

import path from "node:path";
import type { SkillMetadata } from "@open-harness/agent";
import type { Sandbox } from "@open-harness/sandbox";
import { collectInstalledUiSkillNames } from "@/lib/skills/external-ui-skills";

const TOKEN_ARTIFACT_CANDIDATES = [
  "design-system/tweakcn.tokens.json",
  "design-system/theme.css",
  ".open-harness/design-system/tokens.json",
  "app/globals.css",
  "src/app/globals.css",
  "styles/globals.css",
  "src/styles/globals.css",
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

export async function buildUiDesignContext(params: {
  sandbox: Sandbox;
  skills: SkillMetadata[];
}) {
  const { sandbox, skills } = params;
  const [tokenArtifactPaths, referencePaths] = await Promise.all([
    existingPaths(sandbox, TOKEN_ARTIFACT_CANDIDATES),
    existingPaths(sandbox, REFERENCE_FILE_CANDIDATES),
  ]);

  return {
    installedUiSkills: collectInstalledUiSkillNames(skills),
    preferredTokenArtifactPath: "design-system/tweakcn.tokens.json",
    tokenArtifactPaths,
    referencePaths,
    hasDesignTokens: tokenArtifactPaths.length > 0,
    hasTweakcnTokens: tokenArtifactPaths.some((entry) =>
      /tweakcn|theme\.css|tokens/i.test(entry),
    ),
  };
}
