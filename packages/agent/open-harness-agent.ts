import type { SandboxState } from "@open-harness/sandbox";
import { stepCountIs, ToolLoopAgent, type ToolSet } from "ai";
import { z } from "zod";
import { addCacheControl } from "./context-management";
import type { McpContextSummary } from "./mcp";
import {
  type GatewayModelId,
  gateway,
  type ProviderOptionsByProvider,
} from "./models";

import type { SkillMetadata } from "./skills/types";
import { buildSystemPrompt } from "./system-prompt";
import type { UiDesignContextSummary } from "./ui-specialist";
import type { UiStudioContextSummary } from "./ui-studio";
import {
  askUserQuestionTool,
  bashTool,
  editFileTool,
  embedTool,
  firecrawlScrapeTool,
  firecrawlSearchTool,
  globTool,
  grepTool,
  mediaSearchTool,
  readFileTool,
  skillTool,
  taskTool,
  thinkTool,
  togetherImageTool,
  todoWriteTool,
  webFetchTool,
  writeFileTool,
} from "./tools";

export interface AgentModelSelection {
  id: GatewayModelId;
  providerOptionsOverrides?: ProviderOptionsByProvider;
}

export type OpenHarnessAgentModelInput = GatewayModelId | AgentModelSelection;

export interface AgentSandboxContext {
  state: SandboxState;
  workingDirectory: string;
  currentBranch?: string;
  environmentDetails?: string;
}

const callOptionsSchema = z.object({
  sandbox: z.custom<AgentSandboxContext>(),
  model: z.custom<OpenHarnessAgentModelInput>().optional(),
  subagentModel: z.custom<OpenHarnessAgentModelInput>().optional(),
  customInstructions: z.string().optional(),
  skills: z.custom<SkillMetadata[]>().optional(),
  mcpTools: z.custom<ToolSet>().optional(),
  mcp: z.custom<McpContextSummary>().optional(),
  uiDesign: z.custom<UiDesignContextSummary>().optional(),
  uiStudio: z.custom<UiStudioContextSummary>().optional(),
});

export type OpenHarnessAgentCallOptions = z.infer<typeof callOptionsSchema>;

export const defaultModelLabel = "anthropic/claude-opus-4.6" as const;
export const defaultModel = gateway(defaultModelLabel);

function normalizeAgentModelSelection(
  selection: OpenHarnessAgentModelInput | undefined,
  fallbackId: GatewayModelId,
): AgentModelSelection {
  if (!selection) {
    return { id: fallbackId };
  }

  return typeof selection === "string" ? { id: selection } : selection;
}

const tools = {
  todo_write: todoWriteTool,
  read: readFileTool(),
  write: writeFileTool(),
  edit: editFileTool(),
  grep: grepTool(),
  glob: globTool(),
  bash: bashTool(),
  task: taskTool,
  ask_user_question: askUserQuestionTool,
  skill: skillTool,
  web_fetch: webFetchTool,
  embed: embedTool,
  think: thinkTool,
  firecrawl_scrape: firecrawlScrapeTool,
  firecrawl_search: firecrawlSearchTool,
  media_search: mediaSearchTool,
  together_image: togetherImageTool,
} satisfies ToolSet;

export const openHarnessAgent = new ToolLoopAgent({
  model: defaultModel,
  instructions: buildSystemPrompt({}),
  tools,
  stopWhen: stepCountIs(1),
  callOptionsSchema,
  prepareStep: ({ messages, model, steps: _steps }) => {
    return {
      messages: addCacheControl({
        messages,
        model,
      }),
    };
  },
  prepareCall: ({ options, ...settings }) => {
    if (!options) {
      throw new Error("Open Harness agent requires call options with sandbox.");
    }

    const mainSelection = normalizeAgentModelSelection(
      options.model,
      defaultModelLabel,
    );
    const subagentSelection = options.subagentModel
      ? normalizeAgentModelSelection(options.subagentModel, defaultModelLabel)
      : undefined;

    const callModel = gateway(mainSelection.id, {
      providerOptionsOverrides: mainSelection.providerOptionsOverrides,
    });
    const subagentModel = subagentSelection
      ? gateway(subagentSelection.id, {
          providerOptionsOverrides: subagentSelection.providerOptionsOverrides,
        })
      : undefined;
    const customInstructions = options.customInstructions;
    const sandbox = options.sandbox;
    const skills = options.skills ?? [];
    const mcp = options.mcp;
    const uiDesign = options.uiDesign;
    const uiStudio = options.uiStudio;
    const mergedTools = {
      ...(settings.tools ?? tools),
      ...(options.mcpTools ?? {}),
    } satisfies ToolSet;

    const instructions = buildSystemPrompt({
      cwd: sandbox.workingDirectory,
      currentBranch: sandbox.currentBranch,
      customInstructions,
      environmentDetails: sandbox.environmentDetails,
      skills,
      availableMcpServers: mcp?.servers,
      availableMcpTools: mcp?.tools,
      uiDesignContext: uiDesign,
      uiStudioContext: uiStudio,
      modelId: mainSelection.id,
    });

    return {
      ...settings,
      model: callModel,
      tools: addCacheControl({
        tools: mergedTools,
        model: callModel,
      }),
      instructions,
      experimental_context: {
        sandbox,
        skills,
        mcp,
        mcpTools: options.mcpTools,
        uiDesign,
        uiStudio,
        model: callModel,
        subagentModel,
      },
    };
  },
});

export type OpenHarnessAgent = typeof openHarnessAgent;
