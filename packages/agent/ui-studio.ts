export type UiProviderCategory =
  | "component"
  | "animation"
  | "icon"
  | "asset"
  | "layout"
  | "skill"
  | "plugin"
  | "generic";

export type UiProviderSourceType =
  | "mcp"
  | "skill"
  | "internal"
  | "plugin"
  | "repo_memory";

export type UiProviderStatus =
  | "candidate"
  | "preferred"
  | "rejected"
  | "fallback";

export interface UiLayoutBlueprint {
  id: string;
  name: string;
  narrativeStructure: string;
  visualDensity: string;
  productRevealStrategy: string;
  proofPlacement: string;
  ctaCadence: string;
  scrollRhythm: string;
  pageRoles: string[];
}

export interface UiStyleDna {
  concept: string;
  tone: string;
  typographyMood: string;
  paletteDirection: string;
  surfaceLanguage: string;
  shapeLanguage: string;
  motionMood: string;
  backgroundStyle: string;
  distinguishingIdea: string;
}

export interface UiAssetFamily {
  role: string;
  intent: string;
  sourcePreference: "generated" | "stock" | "mixed" | "code";
  promptSeed: string;
  notes: string[];
}

export interface UiMotionBeat {
  phase: string;
  objective: string;
  style: string;
  restraint: string;
}

export interface UiMotionStoryboard {
  beats: UiMotionBeat[];
}

export interface UiComponentGenome {
  shapeLanguage: string;
  density: string;
  surfaceTreatment: string;
  interactionPosture: string;
  informationWeight: string;
  composability: string;
}

export interface UiIconLanguage {
  family: string;
  strokeStyle: string;
  fillMode: string;
  opticalSize: string;
  spacingRule: string;
  decorativeAccent: string;
}

export interface UiProviderCandidate {
  id: string;
  name: string;
  category: UiProviderCategory;
  sourceType: UiProviderSourceType;
  capabilities: string[];
  qualitySignals: string[];
  recommendedUse: string;
  status: UiProviderStatus;
  rationale: string;
}

export interface UiRemixInstruction {
  mode: string;
  goal: string;
  rationale: string;
}

export interface UiStudioProject {
  productBrief: string;
  audience: string;
  marketPosition: string;
  referenceSummary?: string;
  referenceUrl?: string;
  referenceScreenshot?: string | null;
  layoutBlueprints: UiLayoutBlueprint[];
  styleDna: UiStyleDna;
  assetPlan: UiAssetFamily[];
  motionStoryboard: UiMotionStoryboard;
  iconLanguage: UiIconLanguage;
  componentGenome: UiComponentGenome;
  providerDecisions: UiProviderCandidate[];
  critiqueHistory: string[];
  remixPlan: UiRemixInstruction[];
}

export interface UiStudioContextSummary {
  installedUiSkills: string[];
  preferredTokenArtifactPath: string;
  tokenArtifactPaths: string[];
  designMemoryPaths: string[];
  referencePaths: string[];
  providerCandidates: UiProviderCandidate[];
  studioSubagents: string[];
  hasDesignTokens: boolean;
  hasTweakcnTokens: boolean;
  activeProject?: UiStudioProject;
}
