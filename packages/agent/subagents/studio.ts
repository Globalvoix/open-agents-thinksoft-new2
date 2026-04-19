import type { LanguageModel } from "ai";
import { gateway, stepCountIs, ToolLoopAgent, type ToolSet } from "ai";
import { z } from "zod";
import type { McpContextSummary } from "../mcp";
import { bashTool } from "../tools/bash";
import { globTool } from "../tools/glob";
import { grepTool } from "../tools/grep";
import { readFileTool } from "../tools/read";
import { editFileTool, writeFileTool } from "../tools/write";
import type { SandboxExecutionContext } from "../types";
import type { UiStudioContextSummary } from "../ui-studio";
import {
  SUBAGENT_BASH_RULES,
  SUBAGENT_COMPLETE_TASK_RULES,
  SUBAGENT_NO_QUESTIONS_RULES,
  SUBAGENT_REMINDER,
  SUBAGENT_RESPONSE_FORMAT,
  SUBAGENT_STEP_LIMIT,
  SUBAGENT_VALIDATE_RULES,
  SUBAGENT_WORKING_DIR,
} from "./constants";

const callOptionsSchema = z.object({
  task: z.string().describe("Short description of the task"),
  instructions: z.string().describe("Detailed instructions for the task"),
  sandbox: z
    .custom<SandboxExecutionContext["sandbox"]>()
    .describe("Sandbox for file system and shell operations"),
  model: z.custom<LanguageModel>().describe("Language model for this subagent"),
  mcpTools: z.custom<ToolSet>().optional(),
  mcp: z.custom<McpContextSummary>().optional(),
  uiStudio: z.custom<UiStudioContextSummary>().optional(),
});

type StudioCallOptions = z.infer<typeof callOptionsSchema>;

function createStudioPrompt(roleName: string, focus: string): string {
  return `You are the ${roleName} for a UI studio runtime. Your job is to produce extraordinary frontend work from your specific specialty, not generic design output.

## CRITICAL RULES

${SUBAGENT_NO_QUESTIONS_RULES}

${SUBAGENT_COMPLETE_TASK_RULES}

${SUBAGENT_RESPONSE_FORMAT}

${SUBAGENT_VALIDATE_RULES}

## ROLE FOCUS

${focus}

You are part of a studio system that treats layout, motion, assets, icons, and components as one cohesive product surface.

- Push beyond stock SaaS patterns
- Reject obvious templates and registry-looking composition
- Prefer memorable, intentional, market-appropriate decisions
- Use available MCP tools only when they improve the result
- Treat the active uiStudio project as the source of truth when present

## TOOLS
You have full access to file operations and bash commands.

${SUBAGENT_BASH_RULES}`;
}

function createStudioSubagent(roleName: string, focus: string) {
  const prompt = createStudioPrompt(roleName, focus);

  return new ToolLoopAgent({
    model: gateway("anthropic/claude-opus-4.6"),
    instructions: prompt,
    tools: {
      read: readFileTool(),
      write: writeFileTool(),
      edit: editFileTool(),
      grep: grepTool(),
      glob: globTool(),
      bash: bashTool(),
    },
    stopWhen: stepCountIs(SUBAGENT_STEP_LIMIT),
    callOptionsSchema,
    prepareCall: ({ options, ...settings }) => {
      if (!options) {
        throw new Error(`${roleName} requires task call options.`);
      }

      const mergedTools = {
        read: readFileTool(),
        write: writeFileTool(),
        edit: editFileTool(),
        grep: grepTool(),
        glob: globTool(),
        bash: bashTool(),
        ...(options.mcpTools ?? {}),
      } satisfies ToolSet;

      const uiStudioSummary = options.uiStudio?.activeProject
        ? `Active UI studio project:
- Product brief: ${options.uiStudio.activeProject.productBrief}
- Style DNA: ${options.uiStudio.activeProject.styleDna.concept}
- Remix modes: ${options.uiStudio.activeProject.remixPlan.map((entry) => entry.mode).join(", ")}`
        : "No active UI studio project provided.";

      return {
        ...settings,
        model: options.model ?? settings.model,
        tools: mergedTools,
        instructions: `${prompt}

${SUBAGENT_WORKING_DIR}

## UI Studio Context
${uiStudioSummary}

## Your Task
${options.task}

## Detailed Instructions
${options.instructions}

${SUBAGENT_REMINDER}`,
        experimental_context: {
          sandbox: options.sandbox,
          model: options.model ?? settings.model,
          mcp: options.mcp,
          uiStudio: options.uiStudio,
        },
      };
    },
  });
}

export const creativeDirectorSubagent = createStudioSubagent(
  "creative director",
  "Own the art direction, brand posture, market position, and visual concept. Define what makes the output feel singular and high-end.",
);

export const layoutComposerSubagent = createStudioSubagent(
  "layout composer",
  "Invent non-template page architecture, narrative pacing, section sequencing, and compositional rhythm before implementation.",
);

export const assetDirectorSubagent = createStudioSubagent(
  "asset director",
  "Own hero art, product mockups, editorial visuals, ambient textures, and the consistency of every visual asset on the page.",
);

export const motionDirectorSubagent = createStudioSubagent(
  "motion director",
  "Design motion as part of hierarchy and storytelling, including first paint, section transitions, hover language, and CTA emphasis.",
);

export const componentComposerSubagent = createStudioSubagent(
  "component composer",
  "Adapt sourced components into a custom system. Break registry-looking UI into reusable traits and rebuild it to fit the style DNA.",
);

export const uiCriticSubagent = createStudioSubagent(
  "ui critic",
  "Critique the work for template smell, weak composition, generic asset choices, and mismatched motion or iconography. Demand transformational remix instructions.",
);

export type { StudioCallOptions };
