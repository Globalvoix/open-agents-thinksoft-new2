import type { McpServerConfig } from "./types";

function parseBooleanEnv(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function parseNumberEnv(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseArgsEnv(value: string | undefined, fallback: string[]): string[] {
  if (!value?.trim()) {
    return fallback;
  }

  return value
    .split(/\s+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function hasRemoteOrCommandConfig(prefix: string): boolean {
  return Boolean(
    process.env[`${prefix}_MCP_URL`]?.trim() ||
      process.env[`${prefix}_MCP_COMMAND`]?.trim(),
  );
}

function buildServerConfig(params: {
  prefix: string;
  id: string;
  name: string;
  normalization: McpServerConfig["normalization"];
  providerKind: McpServerConfig["providerKind"];
  providerLabel?: string;
  defaultCommand?: string;
  defaultArgs?: string[];
  defaultHeaders?: Record<string, string>;
  defaultEnv?: Record<string, string>;
  apiKeyEnv?: string;
  stdioCredentialEnvName?: string;
  apiKeyHeaderName?: string;
  apiKeyBearer?: boolean;
}): McpServerConfig {
  const {
    prefix,
    id,
    name,
    normalization,
    providerKind,
    providerLabel,
    defaultCommand = "npx",
    defaultArgs = [],
    defaultHeaders,
    defaultEnv,
    apiKeyEnv,
    stdioCredentialEnvName,
    apiKeyHeaderName = "Authorization",
    apiKeyBearer = true,
  } = params;

  const explicitEnabled = parseBooleanEnv(process.env[`${prefix}_MCP_ENABLED`]);
  const implicitlyEnabled = hasRemoteOrCommandConfig(prefix);
  const enabled = explicitEnabled || implicitlyEnabled;
  const timeoutMs = parseNumberEnv(process.env[`${prefix}_MCP_TIMEOUT_MS`], 45_000);
  const apiKey = apiKeyEnv ? process.env[apiKeyEnv]?.trim() : undefined;
  const serverUrl = process.env[`${prefix}_MCP_URL`]?.trim();

  const authValue = apiKey
    ? apiKeyBearer
      ? `Bearer ${apiKey}`
      : apiKey
    : undefined;

  const transport = serverUrl
    ? ({
        type: "http",
        url: serverUrl,
        headers: {
          ...defaultHeaders,
          ...(authValue ? { [apiKeyHeaderName]: authValue } : {}),
        },
      } as const)
    : ({
        type: "stdio",
        command: process.env[`${prefix}_MCP_COMMAND`]?.trim() || defaultCommand,
        args: parseArgsEnv(process.env[`${prefix}_MCP_ARGS`], defaultArgs),
        env: {
          ...defaultEnv,
          ...(stdioCredentialEnvName && apiKey
            ? { [stdioCredentialEnvName]: apiKey }
            : {}),
        },
      } as const);

  return {
    id,
    name,
    enabled,
    timeoutMs,
    transport,
    normalization,
    providerKind,
    providerLabel,
  };
}

export function getMcpServerConfigsFromEnv(): McpServerConfig[] {
  return [
    buildServerConfig({
      prefix: "TWENTY_FIRST",
      id: "21st_magic",
      name: "21st.dev Magic MCP",
      normalization: "21st",
      providerKind: "component",
      providerLabel: "21st.dev",
      defaultArgs: ["-y", "@21st-dev/magic@latest"],
      apiKeyEnv: "TWENTY_FIRST_API_KEY",
      stdioCredentialEnvName: "API_KEY",
    }),
    buildServerConfig({
      prefix: "SHADCN",
      id: "shadcn",
      name: "shadcn/ui MCP",
      normalization: "component_registry",
      providerKind: "component",
      providerLabel: "shadcn/ui",
      defaultArgs: ["shadcn@latest", "mcp"],
    }),
    buildServerConfig({
      prefix: "REACTBITS",
      id: "reactbits",
      name: "ReactBits MCP",
      normalization: "animation_library",
      providerKind: "animation",
      providerLabel: "ReactBits",
      defaultArgs: ["-y", "reactbits-dev-mcp-server"],
      apiKeyEnv: "REACTBITS_GITHUB_TOKEN",
      stdioCredentialEnvName: "GITHUB_TOKEN",
    }),
    buildServerConfig({
      prefix: "MOTION",
      id: "motion",
      name: "Motion MCP",
      normalization: "animation_library",
      providerKind: "animation",
      providerLabel: "Motion",
      defaultArgs: [
        "-y",
        "https://api.motion.dev/registry.tgz?package=motion-studio-mcp&version=latest",
      ],
      apiKeyEnv: "MOTION_TOKEN",
      stdioCredentialEnvName: "TOKEN",
    }),
    buildServerConfig({
      prefix: "ICONS8",
      id: "icons8",
      name: "Icons8 MCP",
      normalization: "icon_library",
      providerKind: "icon",
      providerLabel: "Icons8",
      defaultArgs: [
        "mcp-remote",
        "https://mcp.icons8.com/mcp/",
        "--header",
        "Authorization:${AUTH_HEADER}",
      ],
      defaultEnv: {
        AUTH_HEADER: process.env.ICONS8_API_KEY
          ? `Bearer ${process.env.ICONS8_API_KEY}`
          : "",
      },
      apiKeyEnv: "ICONS8_API_KEY",
      apiKeyHeaderName: "Authorization",
    }),
    buildServerConfig({
      prefix: "ICONIFY",
      id: "iconify",
      name: "Iconify MCP",
      normalization: "icon_library",
      providerKind: "icon",
      providerLabel: "Iconify",
    }),
  ];
}
