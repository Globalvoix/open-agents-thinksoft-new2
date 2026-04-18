import { spawn } from "node:child_process";
import { tool, type ToolSet } from "ai";
import { z, type ZodTypeAny } from "zod";
import { getMcpServerConfigsFromEnv } from "./config";
import { normalizeMcpToolResult } from "./normalize";
import type {
  McpContextSummary,
  McpDiscoveredTool,
  McpRuntime,
  McpServerAvailability,
  McpServerConfig,
} from "./types";

type JsonRpcResponse = {
  id?: number;
  result?: unknown;
  error?: {
    code?: number;
    message?: string;
    data?: unknown;
  };
};

type JsonSchema = {
  type?: string | string[];
  description?: string;
  enum?: unknown[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  default?: unknown;
};

type McpListToolsResult = {
  tools?: Array<{
    name?: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
  }>;
  nextCursor?: string;
};

type McpToolCallResult = {
  content?: Array<{
    type?: string;
    text?: string;
    data?: string;
    mimeType?: string;
    uri?: string;
  }>;
  structuredContent?: unknown;
  isError?: boolean;
  [key: string]: unknown;
};

const JSON_RPC_VERSION = "2.0";
const MCP_PROTOCOL_VERSION = "2025-03-26";
const CLIENT_INFO = { name: "open-harness", version: "0.0.0" };

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function createJsonRpcPayload(id: number, method: string, params?: unknown): string {
  return JSON.stringify({
    jsonrpc: JSON_RPC_VERSION,
    id,
    method,
    ...(params === undefined ? {} : { params }),
  });
}

function buildUnionSchema(members: ZodTypeAny[]): ZodTypeAny {
  if (members.length === 0) {
    return z.unknown();
  }

  if (members.length === 1) {
    return members[0];
  }

  const [first, second, ...rest] = members;
  return z.union([first, second, ...rest]);
}

class StdioMcpClient {
  private readonly child;
  private readonly pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
    }
  >();
  private buffer = Buffer.alloc(0);
  private nextId = 1;

  constructor(private readonly server: McpServerConfig) {
    if (server.transport.type !== "stdio") {
      throw new Error("StdioMcpClient requires a stdio transport.");
    }

    this.child = spawn(server.transport.command, server.transport.args ?? [], {
      env: {
        ...process.env,
        ...server.transport.env,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.child.stdout.on("data", (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      try {
        this.flushBuffer();
      } catch (error) {
        this.rejectAll(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    });

    this.child.stderr.on("data", () => {
      // Some MCP servers log to stderr during startup. Keep quiet here and
      // surface real JSON-RPC failures through request rejections instead.
    });

    this.child.on("error", (error) => {
      this.rejectAll(error instanceof Error ? error : new Error(String(error)));
    });

    this.child.on("exit", (code) => {
      if (this.pending.size > 0) {
        this.rejectAll(
          new Error(
            `MCP server '${server.name}' exited before responding (code ${code ?? "unknown"}).`,
          ),
        );
      }
    });
  }

  private rejectAll(error: Error) {
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
  }

  private flushBuffer() {
    while (true) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) {
        return;
      }

      const headerText = this.buffer.slice(0, headerEnd).toString("utf-8");
      const contentLengthMatch = headerText.match(/Content-Length:\s*(\d+)/i);
      if (!contentLengthMatch) {
        this.buffer = Buffer.alloc(0);
        throw new Error(
          `Invalid MCP response from '${this.server.name}': missing Content-Length header.`,
        );
      }

      const contentLength = Number(contentLengthMatch[1]);
      const frameLength = headerEnd + 4 + contentLength;
      if (this.buffer.length < frameLength) {
        return;
      }

      const body = this.buffer
        .slice(headerEnd + 4, frameLength)
        .toString("utf-8");
      this.buffer = this.buffer.slice(frameLength);

      const response = JSON.parse(body) as JsonRpcResponse;
      if (typeof response.id !== "number") {
        continue;
      }

      const pending = this.pending.get(response.id);
      if (!pending) {
        continue;
      }

      this.pending.delete(response.id);

      if (response.error) {
        pending.reject(
          new Error(
            response.error.message ||
              `MCP request failed for server '${this.server.name}'.`,
          ),
        );
        continue;
      }

      pending.resolve(response.result);
    }
  }

  private async sendRequest(method: string, params?: unknown): Promise<unknown> {
    const id = this.nextId++;
    const payload = createJsonRpcPayload(id, method, params);
    const framedPayload = `Content-Length: ${Buffer.byteLength(payload, "utf-8")}\r\n\r\n${payload}`;

    const responsePromise = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });

    this.child.stdin.write(framedPayload);
    return responsePromise;
  }

  private async initialize() {
    await this.sendRequest("initialize", {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: CLIENT_INFO,
    });

    const payload = JSON.stringify({
      jsonrpc: JSON_RPC_VERSION,
      method: "notifications/initialized",
    });
    this.child.stdin.write(
      `Content-Length: ${Buffer.byteLength(payload, "utf-8")}\r\n\r\n${payload}`,
    );
  }

  async listTools(): Promise<McpListToolsResult> {
    await this.initialize();
    return (await this.sendRequest("tools/list", {})) as McpListToolsResult;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<McpToolCallResult> {
    await this.initialize();
    return (await this.sendRequest("tools/call", {
      name,
      arguments: args,
    })) as McpToolCallResult;
  }

  async close(): Promise<void> {
    this.child.kill();
  }
}

async function sendHttpRpcRequest(
  server: McpServerConfig,
  method: string,
  params?: unknown,
): Promise<unknown> {
  if (server.transport.type !== "http") {
    throw new Error("HTTP RPC requires an HTTP transport.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), server.timeoutMs);
  try {
    const response = await fetch(server.transport.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...server.transport.headers,
      },
      body: JSON.stringify({
        jsonrpc: JSON_RPC_VERSION,
        id: 1,
        method,
        ...(params === undefined ? {} : { params }),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status} while contacting MCP server '${server.name}'.`,
      );
    }

    const payload = (await response.json()) as JsonRpcResponse;
    if (payload.error) {
      throw new Error(
        payload.error.message || `MCP server '${server.name}' returned an error.`,
      );
    }

    return payload.result;
  } finally {
    clearTimeout(timeout);
  }
}

async function sendInitializedHttpRpcRequest(
  server: McpServerConfig,
  method: string,
  params?: unknown,
): Promise<unknown> {
  await sendHttpRpcRequest(server, "initialize", {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: CLIENT_INFO,
  });

  return sendHttpRpcRequest(server, method, params);
}

async function listServerTools(
  server: McpServerConfig,
): Promise<McpDiscoveredTool[]> {
  const result = (server.transport.type === "stdio"
    ? await withTimeout(
        (async () => {
          const client = new StdioMcpClient(server);
          try {
            return await client.listTools();
          } finally {
            await client.close();
          }
        })(),
        server.timeoutMs,
        `Listing MCP tools for ${server.name}`,
      )
    : await sendInitializedHttpRpcRequest(server, "tools/list", {})) as McpListToolsResult;

  return (result.tools ?? [])
    .filter((tool) => typeof tool.name === "string" && tool.name.trim())
    .map((tool) => ({
      serverId: server.id,
      serverName: server.name,
      providerKind: server.providerKind,
      toolName: tool.name as string,
      fullToolName: `mcp__${server.id}__${tool.name as string}`,
      description:
        typeof tool.description === "string"
          ? tool.description
          : `Tool '${tool.name as string}' exposed by ${server.name}`,
      inputSchema: tool.inputSchema,
    }));
}

function schemaToZod(schema: JsonSchema | undefined): ZodTypeAny {
  if (!schema || Object.keys(schema).length === 0) {
    return z.record(z.string(), z.unknown());
  }

  if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
    const members = schema.anyOf.map((entry) => schemaToZod(entry));
    return buildUnionSchema(members);
  }

  if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
    const members = schema.oneOf.map((entry) => schemaToZod(entry));
    return buildUnionSchema(members);
  }

  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    const stringValues = schema.enum.filter(
      (value): value is string => typeof value === "string",
    );
    if (stringValues.length === schema.enum.length && stringValues.length > 0) {
      const [first, ...rest] = stringValues;
      return z.enum([first, ...rest]);
    }

    return z.unknown();
  }

  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;
  switch (type) {
    case "string":
      return z.string();
    case "number":
      return z.number();
    case "integer":
      return z.number().int();
    case "boolean":
      return z.boolean();
    case "array":
      return z.array(schemaToZod(schema.items));
    case "object": {
      const properties = schema.properties ?? {};
      const required = new Set(schema.required ?? []);
      const shape = Object.fromEntries(
        Object.entries(properties).map(([key, value]) => {
          const parsed = schemaToZod(value);
          return [key, required.has(key) ? parsed : parsed.optional()];
        }),
      );
      return z.object(shape).passthrough();
    }
    default:
      return z.record(z.string(), z.unknown());
  }
}

async function callServerTool(params: {
  server: McpServerConfig;
  toolName: string;
  args: Record<string, unknown>;
}): Promise<McpToolCallResult> {
  const { server, toolName, args } = params;

  if (server.transport.type === "stdio") {
    return withTimeout(
      (async () => {
        const client = new StdioMcpClient(server);
        try {
          return await client.callTool(toolName, args);
        } finally {
          await client.close();
        }
      })(),
      server.timeoutMs,
      `Calling MCP tool ${toolName}`,
    );
  }

  return (await sendInitializedHttpRpcRequest(server, "tools/call", {
    name: toolName,
    arguments: args,
  })) as McpToolCallResult;
}

function createToolDescription(toolInfo: McpDiscoveredTool): string {
  const schemaDescription = toolInfo.inputSchema
    ? `\n\nInput schema:\n${JSON.stringify(toolInfo.inputSchema, null, 2)}`
    : "";
  return `${toolInfo.description}\n\nThis tool is exposed by ${toolInfo.serverName}.${schemaDescription}`;
}

function createAiTool(
  server: McpServerConfig,
  toolInfo: McpDiscoveredTool,
) {
  return tool({
    description: createToolDescription(toolInfo),
    inputSchema: schemaToZod(toolInfo.inputSchema as JsonSchema | undefined),
    execute: async (input) => {
      try {
        const result = await callServerTool({
          server,
          toolName: toolInfo.toolName,
          args: typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {},
        });

        return normalizeMcpToolResult({
          server,
          toolName: toolInfo.toolName,
          input,
          result,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          serverId: server.id,
          serverName: server.name,
          toolName: toolInfo.toolName,
          fallbackAllowed: true,
          error: message,
        };
      }
    },
  });
}

export async function discoverMcpRuntime(
  configs: McpServerConfig[] = getMcpServerConfigsFromEnv(),
): Promise<McpRuntime> {
  const servers: McpServerAvailability[] = [];
  const discoveredTools: McpDiscoveredTool[] = [];
  const toolSet: ToolSet = {};

  for (const server of configs) {
    if (!server.enabled) {
      servers.push({
        id: server.id,
        name: server.name,
        enabled: false,
        connected: false,
        toolCount: 0,
        providerKind: server.providerKind,
      });
      continue;
    }

    try {
      const tools = await listServerTools(server);
      for (const toolInfo of tools) {
        toolSet[toolInfo.fullToolName] = createAiTool(server, toolInfo);
      }

      discoveredTools.push(...tools);
      servers.push({
        id: server.id,
        name: server.name,
        enabled: true,
        connected: true,
        toolCount: tools.length,
        providerKind: server.providerKind,
      });
    } catch (error) {
      servers.push({
        id: server.id,
        name: server.name,
        enabled: true,
        connected: false,
        toolCount: 0,
        providerKind: server.providerKind,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const context: McpContextSummary = {
    servers,
    tools: discoveredTools,
  };

  return {
    tools: toolSet,
    context,
  };
}
