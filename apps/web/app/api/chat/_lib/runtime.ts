import {
  allBundledSkills,
  discoverMcpRuntime,
  discoverSkills,
} from "@open-harness/agent";
import { connectSandbox } from "@open-harness/sandbox";
import { getUserGitHubToken } from "@/lib/github/user-token";
import { DEFAULT_SANDBOX_PORTS } from "@/lib/sandbox/config";
import {
  getVercelCliSandboxSetup,
  syncVercelCliAuthToSandbox,
} from "@/lib/sandbox/vercel-cli-auth";
import { getSandboxSkillDirectories } from "@/lib/skills/directories";
import { syncExternalUiSkillRepos } from "@/lib/skills/external-ui-skills";
import { getCachedSkills, setCachedSkills } from "@/lib/skills-cache";
import { buildUiDesignContext } from "@/lib/ui-design/context";
import type { SessionRecord } from "./chat-context";

type DiscoveredSkills = Awaited<ReturnType<typeof discoverSkills>>;
type ConnectedSandbox = Awaited<ReturnType<typeof connectSandbox>>;
type ActiveSandboxState = NonNullable<SessionRecord["sandboxState"]>;

function mergeWithBundledSkills(skills: DiscoveredSkills): DiscoveredSkills {
  const existingNames = new Set(skills.map((s) => s.name.toLowerCase()));
  return [
    ...skills,
    ...allBundledSkills.filter(
      (s) => !existingNames.has(s.name.toLowerCase()),
    ),
  ];
}

function dedupeSkills(skills: DiscoveredSkills): DiscoveredSkills {
  const seenNames = new Set<string>();
  const deduped: DiscoveredSkills = [];

  for (const skill of skills) {
    const normalizedName = skill.name.toLowerCase();
    if (seenNames.has(normalizedName)) {
      continue;
    }

    seenNames.add(normalizedName);
    deduped.push(skill);
  }

  return deduped;
}

async function loadSessionSkills(
  sessionId: string,
  sandboxState: ActiveSandboxState,
  sandbox: ConnectedSandbox,
  additionalSkillDirectories: string[] = [],
): Promise<DiscoveredSkills> {
  const cachedSkills = await getCachedSkills(sessionId, sandboxState);
  if (cachedSkills !== null) {
    if (additionalSkillDirectories.length === 0) {
      return mergeWithBundledSkills(cachedSkills);
    }

    const additionalSkills = await discoverSkills(
      sandbox,
      additionalSkillDirectories,
    );
    return mergeWithBundledSkills(
      dedupeSkills([...cachedSkills, ...additionalSkills]),
    );
  }

  const skillDirs = await getSandboxSkillDirectories(
    sandbox,
    additionalSkillDirectories,
  );

  const discoveredSkills = await discoverSkills(sandbox, skillDirs);
  const merged = mergeWithBundledSkills(dedupeSkills(discoveredSkills));
  await setCachedSkills(sessionId, sandboxState, merged);
  return merged;
}

export async function createChatRuntime(params: {
  userId: string;
  sessionId: string;
  sessionRecord: SessionRecord;
}): Promise<{
  sandbox: ConnectedSandbox;
  skills: DiscoveredSkills;
  mcpRuntime: Awaited<ReturnType<typeof discoverMcpRuntime>>;
  uiDesignContext: Awaited<ReturnType<typeof buildUiDesignContext>>;
}> {
  const { userId, sessionId, sessionRecord } = params;

  const sandboxState = sessionRecord.sandboxState;
  if (!sandboxState) {
    throw new Error("Sandbox state is required to create chat runtime");
  }

  const [githubToken, vercelCliSetup] = await Promise.all([
    getUserGitHubToken(userId),
    getVercelCliSandboxSetup({ userId, sessionRecord }).catch((error) => {
      console.warn(
        `Failed to prepare Vercel CLI setup for session ${sessionId}:`,
        error,
      );
      return null;
    }),
  ]);

  const sandbox = await connectSandbox(sandboxState, {
    githubToken: githubToken ?? undefined,
    ports: DEFAULT_SANDBOX_PORTS,
  });

  if (vercelCliSetup) {
    try {
      await syncVercelCliAuthToSandbox({ sandbox, setup: vercelCliSetup });
    } catch (error) {
      console.warn(
        `Failed to sync Vercel CLI auth for session ${sessionId}:`,
        error,
      );
    }
  }

  const additionalSkillDirectories = await syncExternalUiSkillRepos(sandbox);

  const [skills, mcpRuntime] = await Promise.all([
    loadSessionSkills(
      sessionId,
      sandboxState,
      sandbox,
      additionalSkillDirectories,
    ),
    discoverMcpRuntime(),
  ]);
  const uiDesignContext = await buildUiDesignContext({ sandbox, skills });

  return {
    sandbox,
    skills,
    mcpRuntime,
    uiDesignContext,
  };
}
