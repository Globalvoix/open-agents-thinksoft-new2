import { designSubagent } from "./design";
import { executorSubagent } from "./executor";
import { explorerSubagent } from "./explorer";
import {
  assetDirectorSubagent,
  componentComposerSubagent,
  creativeDirectorSubagent,
  layoutComposerSubagent,
  motionDirectorSubagent,
  uiCriticSubagent,
} from "./studio";

export const SUBAGENT_REGISTRY = {
  explorer: {
    shortDescription:
      "Use for read-only codebase exploration, tracing behavior, and answering questions without changing files",
    agent: explorerSubagent,
  },
  executor: {
    shortDescription:
      "Use for well-scoped implementation work, including edits, scaffolding, refactors, and other file changes",
    agent: executorSubagent,
  },
  design: {
    shortDescription:
      "Use for creating distinctive, production-grade frontend interfaces with high design quality. Generates creative, polished code that avoids generic AI aesthetics.",
    agent: designSubagent,
  },
  "creative-director": {
    shortDescription:
      "Use for art direction, brand posture, market position, and defining a memorable visual concept for premium UI work.",
    agent: creativeDirectorSubagent,
  },
  "layout-composer": {
    shortDescription:
      "Use for inventing non-template page architecture, section order, and narrative pacing before implementation.",
    agent: layoutComposerSubagent,
  },
  "asset-director": {
    shortDescription:
      "Use for hero art, mockups, textures, and keeping every visual asset stylistically cohesive.",
    agent: assetDirectorSubagent,
  },
  "motion-director": {
    shortDescription:
      "Use for first-paint choreography, scroll narrative, hover language, and intentional motion systems.",
    agent: motionDirectorSubagent,
  },
  "component-composer": {
    shortDescription:
      "Use for adapting MCP or library components into a custom UI language instead of shipping raw registry output.",
    agent: componentComposerSubagent,
  },
  "ui-critic": {
    shortDescription:
      "Use for anti-template critique, visual review, and forcing targeted remix passes when a UI feels generic.",
    agent: uiCriticSubagent,
  },
} as const;

export const SUBAGENT_TYPES = Object.keys(SUBAGENT_REGISTRY) as [
  keyof typeof SUBAGENT_REGISTRY,
  ...(keyof typeof SUBAGENT_REGISTRY)[],
];

export type SubagentType = keyof typeof SUBAGENT_REGISTRY;

export function buildSubagentSummaryLines(): string {
  return SUBAGENT_TYPES.map((type) => {
    const subagent = SUBAGENT_REGISTRY[type];
    return `- \`${type}\` - ${subagent.shortDescription}`;
  }).join("\n");
}
