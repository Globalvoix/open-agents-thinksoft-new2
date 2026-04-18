import type { ToolSet } from "ai";

export type McpNormalizationMode =
  | "generic"
  | "21st"
  | "component_registry"
  | "animation_library"
  | "icon_library";

export type McpProviderKind = "component" | "animation" | "icon" | "generic";

export type McpTransportConfig =
  | {
      type: "stdio";
      command: string;
      args?: string[];
      env?: Record<string, string>;
    }
  | {
      type: "http";
      url: string;
      headers?: Record<string, string>;
    };

export interface McpServerConfig {
  id: string;
  name: string;
  enabled: boolean;
  timeoutMs: number;
  transport: McpTransportConfig;
  normalization?: McpNormalizationMode;
  providerKind?: McpProviderKind;
  providerLabel?: string;
}

export interface McpDiscoveredTool {
  serverId: string;
  serverName: string;
  providerKind?: McpProviderKind;
  toolName: string;
  fullToolName: string;
  description: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpServerAvailability {
  id: string;
  name: string;
  enabled: boolean;
  connected: boolean;
  toolCount: number;
  providerKind?: McpProviderKind;
  error?: string;
}

export interface McpContextSummary {
  servers: McpServerAvailability[];
  tools: McpDiscoveredTool[];
}

export interface McpRuntime {
  tools: ToolSet;
  context: McpContextSummary;
}
