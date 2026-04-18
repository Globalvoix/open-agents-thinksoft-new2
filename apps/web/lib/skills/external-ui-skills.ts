import "server-only";

import path from "node:path";
import type { SkillMetadata } from "@open-harness/agent";
import type { Sandbox } from "@open-harness/sandbox";
import {
  resolveSandboxHomeDirectory,
  shellEscape,
} from "@/lib/sandbox/home-directory";

type ExternalSkillRepo = {
  id: string;
  repoUrl: string;
  candidateSkillRoots: string[];
  createBridgeSkill?: {
    name: string;
    description: string;
    instructions: string[];
  };
};

const EXTERNAL_UI_SKILL_REPOS: ExternalSkillRepo[] = [
  {
    id: "ui-ux-pro-max-skill",
    repoUrl: "https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git",
    candidateSkillRoots: [
      ".agents/skills",
      ".claude/skills",
      ".codex/skills",
      "skills",
    ],
  },
  {
    id: "gsap-skills",
    repoUrl: "https://github.com/greensock/gsap-skills.git",
    candidateSkillRoots: [
      ".agents/skills",
      ".claude/skills",
      ".codex/skills",
      "skills",
    ],
  },
  {
    id: "ai-website-cloner-template",
    repoUrl: "https://github.com/JCodesMore/ai-website-cloner-template.git",
    candidateSkillRoots: [
      ".agents/skills",
      ".claude/skills",
      ".codex/skills",
      "skills",
    ],
    createBridgeSkill: {
      name: "website-cloner-workflow",
      description:
        "Reusable workflow for competitive cloning, structure extraction, and adaptation of high-performing websites.",
      instructions: [
        "Use this skill when the user wants to clone or strongly reference an existing website category.",
        "Read the local repo clone for extraction and workflow ideas before writing code.",
        "Combine this workflow with Firecrawl screenshots and project tokens instead of copying markup blindly.",
      ],
    },
  },
  {
    id: "gsap-reference",
    repoUrl: "https://github.com/greensock/GSAP.git",
    candidateSkillRoots: [],
    createBridgeSkill: {
      name: "gsap-reference",
      description:
        "Reference skill for battle-tested GSAP patterns and animation APIs from the official GSAP repository.",
      instructions: [
        "Use this when animation work needs authoritative GSAP patterns beyond the installed skills or MCP tools.",
        "Prefer accessible timing, reduced-motion support, and production-safe defaults.",
      ],
    },
  },
  {
    id: "json-render",
    repoUrl: "https://github.com/vercel-labs/json-render.git",
    candidateSkillRoots: [],
    createBridgeSkill: {
      name: "json-render-patterns",
      description:
        "Reference skill for schema-driven generative UI using Vercel Labs json-render.",
      instructions: [
        "Use this only when schema-constrained UI composition or guarded catalogs fit better than direct component authoring.",
        "Do not replace normal React or Next component generation with json-render by default.",
      ],
    },
  },
];

function makeBridgeSkillMarkdown(params: {
  name: string;
  description: string;
  repoPath: string;
  instructions: string[];
}): string {
  const instructionLines = params.instructions.map((line) => `- ${line}`).join("\n");

  return `---
name: ${params.name}
description: ${params.description}
---

# ${params.name}

Local reference repository: ${params.repoPath}

Follow these rules:
${instructionLines}
`;
}

async function pathExists(sandbox: Sandbox, targetPath: string): Promise<boolean> {
  try {
    await sandbox.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function syncGitRepo(
  sandbox: Sandbox,
  repoUrl: string,
  repoPath: string,
): Promise<void> {
  const hasGit = await pathExists(sandbox, path.posix.join(repoPath, ".git"));
  if (!hasGit) {
    const result = await sandbox.exec(
      `mkdir -p ${shellEscape(path.posix.dirname(repoPath))} && git clone --depth 1 ${shellEscape(repoUrl)} ${shellEscape(repoPath)}`,
      sandbox.workingDirectory,
      120_000,
    );
    if (!result.success) {
      throw new Error(result.stderr || `Failed to clone ${repoUrl}`);
    }
    return;
  }

  const result = await sandbox.exec(
    `git -C ${shellEscape(repoPath)} pull --ff-only`,
    sandbox.workingDirectory,
    120_000,
  );
  if (!result.success) {
    throw new Error(result.stderr || `Failed to update ${repoUrl}`);
  }
}

export async function syncExternalUiSkillRepos(sandbox: Sandbox): Promise<string[]> {
  const homeDirectory = await resolveSandboxHomeDirectory(sandbox);
  const cloneRoot = path.posix.join(homeDirectory, ".agents", "external-skills");
  const globalSkillsRoot = path.posix.join(homeDirectory, ".agents", "skills");
  const extraSkillDirs = new Set<string>();

  await sandbox.mkdir(cloneRoot, { recursive: true });
  await sandbox.mkdir(globalSkillsRoot, { recursive: true });

  for (const repo of EXTERNAL_UI_SKILL_REPOS) {
    const repoPath = path.posix.join(cloneRoot, repo.id);

    try {
      await syncGitRepo(sandbox, repo.repoUrl, repoPath);
    } catch (error) {
      console.warn(`Failed to sync external UI skill repo ${repo.repoUrl}:`, error);
      continue;
    }

    let discoveredNativeRoot = false;
    for (const candidateRoot of repo.candidateSkillRoots) {
      const fullPath = path.posix.join(repoPath, candidateRoot);
      if (await pathExists(sandbox, fullPath)) {
        extraSkillDirs.add(fullPath);
        discoveredNativeRoot = true;
      }
    }

    if (!discoveredNativeRoot && repo.createBridgeSkill) {
      const skillDir = path.posix.join(globalSkillsRoot, repo.createBridgeSkill.name);
      await sandbox.mkdir(skillDir, { recursive: true });
      await sandbox.writeFile(
        path.posix.join(skillDir, "SKILL.md"),
        makeBridgeSkillMarkdown({
          ...repo.createBridgeSkill,
          repoPath,
        }),
        "utf-8",
      );
    }
  }

  return Array.from(extraSkillDirs);
}

export function collectInstalledUiSkillNames(skills: SkillMetadata[]): string[] {
  const uiPattern =
    /(ui|design|theme|animation|motion|gsap|shadcn|icon|frontend|json-render|clone)/i;

  return skills
    .map((skill) => skill.name)
    .filter((name) => uiPattern.test(name))
    .sort((a, b) => a.localeCompare(b));
}
