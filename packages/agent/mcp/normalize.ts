import type {
  McpNormalizationMode,
  McpProviderKind,
  McpServerConfig,
} from "./types";

interface McpContentBlock {
  type?: string;
  text?: string;
  data?: string;
  mimeType?: string;
  uri?: string;
}

interface McpToolCallResult {
  content?: McpContentBlock[];
  structuredContent?: unknown;
  isError?: boolean;
  [key: string]: unknown;
}

type ExtractedVariant = {
  id: string;
  label: string;
  summary?: string;
  code?: string;
  files?: Array<{ path?: string; content?: string }>;
  previewUrl?: string;
};

type ExtractedFile = {
  path?: string;
  content?: string;
};

type ExtractedDependency = {
  name: string;
  type?: string;
};

type NormalizedMcpResult = {
  success: boolean;
  provider: string;
  kind: McpProviderKind;
  framework?: string;
  requestedFramework?: string;
  componentIntent?: string;
  variants?: ExtractedVariant[];
  files?: ExtractedFile[];
  dependencies?: ExtractedDependency[];
  usageNotes?: string[];
  rawText?: string;
  fallbackAllowed: boolean;
  error?: string;
  source?: string;
  toolName?: string;
};

function toPlainText(content: McpContentBlock[] | undefined): string {
  if (!content) {
    return "";
  }

  return content
    .map((block) => {
      if (typeof block.text === "string") {
        return block.text;
      }

      if (typeof block.data === "string") {
        return block.data;
      }

      return "";
    })
    .filter(Boolean)
    .join("\n\n");
}

function inferRequestedFramework(input: unknown): string | undefined {
  if (!input || typeof input !== "object") {
    return undefined;
  }

  const record = input as Record<string, unknown>;
  for (const key of ["framework", "stack", "target", "technology"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function inferComponentIntent(input: unknown): string | undefined {
  if (!input || typeof input !== "object") {
    return undefined;
  }

  const record = input as Record<string, unknown>;
  for (const key of ["prompt", "description", "component", "request", "query"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function extractCodeFence(text: string): string | undefined {
  const match = text.match(/```[a-zA-Z0-9_-]*\n([\s\S]*?)```/);
  return match?.[1]?.trim();
}

function extractPreviewUrls(text: string): string[] {
  return Array.from(text.matchAll(/https?:\/\/[^\s)]+/g), (match) => match[0]);
}

function extractVariantsFromStructuredContent(
  structuredContent: unknown,
): ExtractedVariant[] {
  if (!structuredContent || typeof structuredContent !== "object") {
    return [];
  }

  if (Array.isArray(structuredContent)) {
    return structuredContent.flatMap((entry, index) => {
      if (!entry || typeof entry !== "object") {
        return [];
      }

      const record = entry as Record<string, unknown>;
      return [
        {
          id: String(record.id ?? index + 1),
          label: String(
            record.label ?? record.name ?? record.title ?? `Variant ${index + 1}`,
          ),
          summary:
            typeof record.summary === "string"
              ? record.summary
              : typeof record.description === "string"
                ? record.description
                : undefined,
          code:
            typeof record.code === "string"
              ? record.code
              : typeof record.tsx === "string"
                ? record.tsx
                : undefined,
          files: Array.isArray(record.files)
            ? record.files
                .filter(
                  (
                    file,
                  ): file is {
                    path?: string;
                    content?: string;
                  } => typeof file === "object" && file !== null,
                )
                .map((file) => ({
                  path: file.path,
                  content: file.content,
                }))
            : undefined,
          previewUrl:
            typeof record.previewUrl === "string" ? record.previewUrl : undefined,
        },
      ];
    });
  }

  const record = structuredContent as Record<string, unknown>;
  if (Array.isArray(record.variants)) {
    return extractVariantsFromStructuredContent(record.variants);
  }

  return [];
}

function extractFiles(structuredContent: unknown): ExtractedFile[] {
  if (!structuredContent || typeof structuredContent !== "object") {
    return [];
  }

  const record = structuredContent as Record<string, unknown>;
  if (!Array.isArray(record.files)) {
    return [];
  }

  return record.files
    .filter(
      (file): file is Record<string, unknown> =>
        typeof file === "object" && file !== null,
    )
    .map((file) => ({
      path: typeof file.path === "string" ? file.path : undefined,
      content: typeof file.content === "string" ? file.content : undefined,
    }));
}

function extractDependencies(structuredContent: unknown): ExtractedDependency[] {
  if (!structuredContent || typeof structuredContent !== "object") {
    return [];
  }

  const record = structuredContent as Record<string, unknown>;
  const rawDependencies = [
    ...(Array.isArray(record.dependencies) ? record.dependencies : []),
    ...(Array.isArray(record.packages) ? record.packages : []),
  ];

  return rawDependencies.flatMap((dependency) => {
    if (typeof dependency === "string") {
      return [{ name: dependency }];
    }

    if (!dependency || typeof dependency !== "object") {
      return [];
    }

    const entry = dependency as Record<string, unknown>;
    const name =
      typeof entry.name === "string"
        ? entry.name
        : typeof entry.package === "string"
          ? entry.package
          : undefined;

    if (!name) {
      return [];
    }

    return [
      {
        name,
        type: typeof entry.type === "string" ? entry.type : undefined,
      },
    ];
  });
}

function extractUsageNotes(
  structuredContent: unknown,
  plainText: string,
): string[] {
  const notes: string[] = [];

  if (structuredContent && typeof structuredContent === "object") {
    const record = structuredContent as Record<string, unknown>;
    for (const key of ["usageNotes", "notes", "instructions"]) {
      const value = record[key];
      if (Array.isArray(value)) {
        for (const item of value) {
          if (typeof item === "string" && item.trim()) {
            notes.push(item.trim());
          }
        }
      } else if (typeof value === "string" && value.trim()) {
        notes.push(value.trim());
      }
    }
  }

  if (notes.length === 0 && plainText.trim()) {
    notes.push(plainText.trim());
  }

  return Array.from(new Set(notes));
}

function inferKind(server: McpServerConfig): McpProviderKind {
  return server.providerKind ?? "generic";
}

function inferFramework(
  server: McpServerConfig,
  requestedFramework: string | undefined,
  structuredContent: unknown,
): string | undefined {
  if (structuredContent && typeof structuredContent === "object") {
    const record = structuredContent as Record<string, unknown>;
    for (const key of ["framework", "stack", "targetFramework"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
  }

  if (server.normalization === "icon_library") {
    return "asset";
  }

  return requestedFramework;
}

function normalizeSpecializedResult(params: {
  server: McpServerConfig;
  toolName: string;
  input: unknown;
  result: McpToolCallResult;
  normalization: McpNormalizationMode;
}): NormalizedMcpResult {
  const requestedFramework = inferRequestedFramework(params.input);
  const componentIntent = inferComponentIntent(params.input);
  const plainText = toPlainText(params.result.content);
  const variants =
    extractVariantsFromStructuredContent(params.result.structuredContent);
  const previewUrls = extractPreviewUrls(plainText);

  if (variants.length === 0) {
    const code = extractCodeFence(plainText);
    if (code) {
      variants.push({
        id: "1",
        label:
          params.normalization === "icon_library"
            ? "Icon result"
            : params.normalization === "animation_library"
              ? "Animation example"
              : "Primary result",
        code,
        previewUrl: previewUrls[0],
      });
    }
  }

  const files = extractFiles(params.result.structuredContent);
  const dependencies = extractDependencies(params.result.structuredContent);
  const usageNotes = extractUsageNotes(
    params.result.structuredContent,
    plainText,
  );
  const success = !params.result.isError && (variants.length > 0 || files.length > 0);

  return {
    success,
    provider: params.server.providerLabel ?? params.server.name,
    kind: inferKind(params.server),
    framework: inferFramework(
      params.server,
      requestedFramework,
      params.result.structuredContent,
    ),
    requestedFramework,
    componentIntent,
    variants,
    files,
    dependencies,
    usageNotes,
    rawText: plainText || undefined,
    fallbackAllowed: !success,
    ...(params.result.isError
      ? {
          error: plainText || "The MCP server reported an error.",
        }
      : {}),
    ...(params.normalization === "21st"
      ? {}
      : {
          toolName: params.toolName,
        }),
  };
}

export function normalizeMcpToolResult(params: {
  server: McpServerConfig;
  toolName: string;
  input: unknown;
  result: McpToolCallResult;
}) {
  const plainText = toPlainText(params.result.content);

  if (params.server.normalization === "21st") {
    return normalizeSpecializedResult({
      ...params,
      normalization: "21st",
    });
  }

  if (
    params.server.normalization === "component_registry" ||
    params.server.normalization === "animation_library" ||
    params.server.normalization === "icon_library"
  ) {
    return normalizeSpecializedResult({
      ...params,
      normalization: params.server.normalization,
    });
  }

  if (params.result.isError) {
    return {
      success: false,
      provider: params.server.providerLabel ?? params.server.name,
      kind: inferKind(params.server),
      source: params.server.name,
      toolName: params.toolName,
      fallbackAllowed: true,
      error: plainText || "The MCP server reported an error.",
      rawText: plainText || undefined,
    };
  }

  return {
    success: true,
    provider: params.server.providerLabel ?? params.server.name,
    kind: inferKind(params.server),
    source: params.server.name,
    toolName: params.toolName,
    rawText: plainText || undefined,
    fallbackAllowed: false,
  };
}
