import { afterEach, describe, expect, test } from "bun:test";
import { buildSystemPrompt } from "../system-prompt";
import { getMcpServerConfigsFromEnv } from "./config";
import { normalizeMcpToolResult } from "./normalize";
import { discoverMcpRuntime } from "./runtime";

const originalEnv = {
  TWENTY_FIRST_MCP_ENABLED: process.env.TWENTY_FIRST_MCP_ENABLED,
  TWENTY_FIRST_API_KEY: process.env.TWENTY_FIRST_API_KEY,
  TWENTY_FIRST_MCP_URL: process.env.TWENTY_FIRST_MCP_URL,
  TWENTY_FIRST_MCP_TIMEOUT_MS: process.env.TWENTY_FIRST_MCP_TIMEOUT_MS,
  TWENTY_FIRST_MCP_COMMAND: process.env.TWENTY_FIRST_MCP_COMMAND,
  TWENTY_FIRST_MCP_ARGS: process.env.TWENTY_FIRST_MCP_ARGS,
  SHADCN_MCP_ENABLED: process.env.SHADCN_MCP_ENABLED,
  SHADCN_MCP_COMMAND: process.env.SHADCN_MCP_COMMAND,
  SHADCN_MCP_ARGS: process.env.SHADCN_MCP_ARGS,
  REACTBITS_MCP_ENABLED: process.env.REACTBITS_MCP_ENABLED,
  REACTBITS_MCP_COMMAND: process.env.REACTBITS_MCP_COMMAND,
  REACTBITS_MCP_ARGS: process.env.REACTBITS_MCP_ARGS,
  UI_STUDIO_MCP_CATALOG: process.env.UI_STUDIO_MCP_CATALOG,
};

afterEach(() => {
  process.env.TWENTY_FIRST_MCP_ENABLED = originalEnv.TWENTY_FIRST_MCP_ENABLED;
  process.env.TWENTY_FIRST_API_KEY = originalEnv.TWENTY_FIRST_API_KEY;
  process.env.TWENTY_FIRST_MCP_URL = originalEnv.TWENTY_FIRST_MCP_URL;
  process.env.TWENTY_FIRST_MCP_TIMEOUT_MS =
    originalEnv.TWENTY_FIRST_MCP_TIMEOUT_MS;
  process.env.TWENTY_FIRST_MCP_COMMAND = originalEnv.TWENTY_FIRST_MCP_COMMAND;
  process.env.TWENTY_FIRST_MCP_ARGS = originalEnv.TWENTY_FIRST_MCP_ARGS;
  process.env.SHADCN_MCP_ENABLED = originalEnv.SHADCN_MCP_ENABLED;
  process.env.SHADCN_MCP_COMMAND = originalEnv.SHADCN_MCP_COMMAND;
  process.env.SHADCN_MCP_ARGS = originalEnv.SHADCN_MCP_ARGS;
  process.env.REACTBITS_MCP_ENABLED = originalEnv.REACTBITS_MCP_ENABLED;
  process.env.REACTBITS_MCP_COMMAND = originalEnv.REACTBITS_MCP_COMMAND;
  process.env.REACTBITS_MCP_ARGS = originalEnv.REACTBITS_MCP_ARGS;
  process.env.UI_STUDIO_MCP_CATALOG = originalEnv.UI_STUDIO_MCP_CATALOG;
});

describe("MCP config", () => {
  test("reads 21st.dev stdio configuration from env", () => {
    process.env.TWENTY_FIRST_MCP_ENABLED = "true";
    process.env.TWENTY_FIRST_API_KEY = "secret-key";
    process.env.TWENTY_FIRST_MCP_COMMAND = "npx";
    process.env.TWENTY_FIRST_MCP_ARGS = "-y @21st-dev/magic@latest";
    process.env.TWENTY_FIRST_MCP_TIMEOUT_MS = "60000";

    const [server] = getMcpServerConfigsFromEnv();

    expect(server.enabled).toBe(true);
    expect(server.timeoutMs).toBe(60_000);
    expect(server.transport).toEqual({
      type: "stdio",
      command: "npx",
      args: ["-y", "@21st-dev/magic@latest"],
      env: {
        API_KEY: "secret-key",
      },
    });
  });

  test("builds multi-provider UI MCP configs", () => {
    process.env.SHADCN_MCP_ENABLED = "true";
    process.env.REACTBITS_MCP_ENABLED = "true";

    const configs = getMcpServerConfigsFromEnv();
    const shadcn = configs.find((entry) => entry.id === "shadcn");
    const reactbits = configs.find((entry) => entry.id === "reactbits");

    expect(shadcn).toMatchObject({
      enabled: true,
      normalization: "component_registry",
      providerKind: "component",
    });
    expect(reactbits).toMatchObject({
      enabled: true,
      normalization: "animation_library",
      providerKind: "animation",
    });
  });

  test("adds open-ended UI studio MCP catalog entries from env", () => {
    process.env.UI_STUDIO_MCP_CATALOG = JSON.stringify([
      {
        id: "custom-animation-lab",
        name: "Custom Animation Lab",
        providerKind: "animation",
        normalization: "animation_library",
        url: "https://mcp.example.com",
      },
    ]);

    const configs = getMcpServerConfigsFromEnv();
    const custom = configs.find((entry) => entry.id === "custom-animation-lab");

    expect(custom).toMatchObject({
      enabled: true,
      providerKind: "animation",
      normalization: "animation_library",
      transport: {
        type: "http",
        url: "https://mcp.example.com",
      },
    });
  });

  test("keeps disabled servers out of the runtime toolset", async () => {
    const runtime = await discoverMcpRuntime([
      {
        id: "disabled",
        name: "Disabled MCP",
        enabled: false,
        timeoutMs: 1000,
        normalization: "generic",
        transport: {
          type: "stdio",
          command: "npx",
          args: ["server"],
        },
      },
    ]);

    expect(runtime.context.servers).toEqual([
      {
        id: "disabled",
        name: "Disabled MCP",
        enabled: false,
        connected: false,
        toolCount: 0,
      },
    ]);
    expect(runtime.tools).toEqual({});
  });
});

describe("21st.dev normalization", () => {
  test("normalizes multi-variant structured responses", () => {
    const normalized = normalizeMcpToolResult({
      server: {
        id: "21st_magic",
        name: "21st.dev Magic MCP",
        enabled: true,
        timeoutMs: 1000,
        normalization: "21st",
        transport: {
          type: "stdio",
          command: "npx",
          args: ["-y", "@21st-dev/magic@latest"],
        },
      },
      toolName: "component_builder",
      input: {
        framework: "nextjs",
        prompt: "Create a responsive pricing section",
      },
      result: {
        structuredContent: {
          variants: [
            {
              id: "a",
              label: "Editorial",
              description: "Large headline with card grid",
              code: "export function Pricing() {}",
            },
            {
              id: "b",
              label: "Minimal",
              description: "Compact cards",
              code: "export function PricingMinimal() {}",
            },
          ],
        },
      },
    });

    expect(normalized).toMatchObject({
      success: true,
      requestedFramework: "nextjs",
      componentIntent: "Create a responsive pricing section",
      fallbackAllowed: false,
    });

    const variants =
      normalized && typeof normalized === "object" && "variants" in normalized
        ? (normalized.variants as Array<{ label: string }>)
        : [];
    expect(variants.map((variant) => variant.label)).toEqual([
      "Editorial",
      "Minimal",
    ]);
  });

  test("marks empty results as fallback-capable", () => {
    const normalized = normalizeMcpToolResult({
      server: {
        id: "21st_magic",
        name: "21st.dev Magic MCP",
        enabled: true,
        timeoutMs: 1000,
        normalization: "21st",
        transport: {
          type: "stdio",
          command: "npx",
          args: ["-y", "@21st-dev/magic@latest"],
        },
      },
      toolName: "component_builder",
      input: {
        framework: "vue",
      },
      result: {
        content: [{ type: "text", text: "No component could be generated." }],
      },
    });

    expect(normalized).toMatchObject({
      success: false,
      fallbackAllowed: true,
      requestedFramework: "vue",
    });
  });

  test("normalizes component registry results", () => {
    const normalized = normalizeMcpToolResult({
      server: {
        id: "shadcn",
        name: "shadcn/ui MCP",
        enabled: true,
        timeoutMs: 1000,
        normalization: "component_registry",
        providerKind: "component",
        transport: {
          type: "stdio",
          command: "npx",
          args: ["shadcn@latest", "mcp"],
        },
      },
      toolName: "search_components",
      input: {
        framework: "nextjs",
        prompt: "pricing section with cards",
      },
      result: {
        structuredContent: {
          framework: "nextjs",
          variants: [{ id: "pricing", label: "Pricing Cards" }],
          files: [{ path: "components/ui/pricing.tsx", content: "export {}" }],
          dependencies: ["lucide-react"],
          usageNotes: ["Install required components before rendering."],
        },
      },
    });

    expect(normalized).toMatchObject({
      success: true,
      kind: "component",
      framework: "nextjs",
      fallbackAllowed: false,
    });
  });

  test("normalizes animation library results", () => {
    const normalized = normalizeMcpToolResult({
      server: {
        id: "motion",
        name: "Motion MCP",
        enabled: true,
        timeoutMs: 1000,
        normalization: "animation_library",
        providerKind: "animation",
        transport: {
          type: "stdio",
          command: "npx",
          args: ["motion-mcp"],
        },
      },
      toolName: "find_examples",
      input: {
        framework: "react",
        query: "magnetic button interaction",
      },
      result: {
        content: [
          {
            type: "text",
            text: "Use a spring-based hover transition.\n```tsx\nexport function MagneticButton() {}\n```",
          },
        ],
      },
    });

    expect(normalized).toMatchObject({
      success: true,
      kind: "animation",
      framework: "react",
    });
  });
});

describe("system prompt MCP routing", () => {
  test("includes MCP routing guidance when tools are available", () => {
    const prompt = buildSystemPrompt({
      availableMcpServers: [
        {
          id: "21st_magic",
          name: "21st.dev Magic MCP",
          enabled: true,
          connected: true,
          toolCount: 1,
        },
      ],
      availableMcpTools: [
        {
          serverId: "21st_magic",
          serverName: "21st.dev Magic MCP",
          toolName: "component_builder",
          fullToolName: "mcp__21st_magic__component_builder",
          description: "Generate polished frontend components",
        },
      ],
    });

    expect(prompt).toContain("prefer connected 21st.dev MCP tools");
    expect(prompt).toContain("mcp__21st_magic__component_builder");
    expect(prompt).toContain("fallbackAllowed: true");
  });

  test("includes UI specialist context when available", () => {
    const prompt = buildSystemPrompt({
      uiDesignContext: {
        installedUiSkills: ["frontend-design", "gsap-reference"],
        preferredTokenArtifactPath: "design-system/tweakcn.tokens.json",
        tokenArtifactPaths: ["design-system/theme.css"],
        referencePaths: ["design-system/MASTER.md"],
        hasDesignTokens: true,
        hasTweakcnTokens: true,
      },
    });

    expect(prompt).toContain("UI Specialist Runtime");
    expect(prompt).toContain("design-system/theme.css");
    expect(prompt).toContain(
      "Competitor screenshot and Firecrawl reference research first",
    );
  });

  test("forces first-turn website cloning guidance into the system prompt", () => {
    const prompt = buildSystemPrompt({});

    expect(prompt).toContain('skill("website-cloning")');
    expect(prompt).toContain("Clone the design");
    expect(prompt).toContain("together_image");
  });
});
