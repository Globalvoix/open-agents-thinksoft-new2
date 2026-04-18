import { tool } from "ai";
import { z } from "zod";

const TOGETHER_IMAGE_TIMEOUT_MS = 90_000;
const DEFAULT_IMAGE_MODEL = "google/flash-image-3.1";

const togetherImageInputSchema = z.object({
  prompt: z
    .string()
    .describe("Describe the image to generate or edit in detail."),
  imageUrl: z
    .string()
    .url()
    .optional()
    .describe("Optional reference image URL for editing or transformation."),
  width: z
    .number()
    .int()
    .min(512)
    .max(4096)
    .default(1536)
    .describe("Output width in pixels."),
  height: z
    .number()
    .int()
    .min(512)
    .max(4096)
    .default(1024)
    .describe("Output height in pixels."),
  count: z
    .number()
    .int()
    .min(1)
    .max(4)
    .default(1)
    .describe("Number of images to generate."),
  styleHint: z
    .string()
    .optional()
    .describe("Optional style hint such as editorial, SaaS hero, or product mockup."),
});

export const togetherImageTool = tool({
  description: `Generate or edit premium visual assets using Together AI image generation.

Use this when UI work needs custom images rather than stock media:
- hero illustrations
- SaaS product mockups
- editorial visuals
- branded posters or feature art
- polished backgrounds that match a competitor-inspired design direction

Default model: google/flash-image-3.1 (Gemini 3.1 Flash Image / Nano Banana 2 via Together AI).
Requires TOGETHER_API_KEY.`,
  inputSchema: togetherImageInputSchema,
  execute: async ({
    prompt,
    imageUrl,
    width,
    height,
    count,
    styleHint,
  }) => {
    const apiKey = process.env.TOGETHER_API_KEY;
    if (!apiKey) {
      return {
        success: false,
        error:
          "TOGETHER_API_KEY environment variable is not set. Together image generation is unavailable.",
      };
    }

    const model =
      process.env.TOGETHER_IMAGE_MODEL?.trim() || DEFAULT_IMAGE_MODEL;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TOGETHER_IMAGE_TIMEOUT_MS);

    try {
      const response = await fetch("https://api.together.xyz/v1/images/generations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          prompt: styleHint ? `${prompt}\n\nStyle direction: ${styleHint}` : prompt,
          width,
          height,
          n: count,
          steps: 28,
          response_format: "url",
          ...(imageUrl ? { image_url: imageUrl } : {}),
        }),
        signal: controller.signal,
      });

      const payload = (await response.json()) as {
        error?: { message?: string } | string;
        data?: Array<{ url?: string; b64_json?: string }>;
      };

      if (!response.ok) {
        const errorMessage =
          typeof payload.error === "string"
            ? payload.error
            : payload.error?.message || response.statusText;
        return {
          success: false,
          error: `Together image generation failed: ${errorMessage}`,
        };
      }

      const images =
        payload.data?.flatMap((entry, index) => {
          if (typeof entry.url === "string" && entry.url.trim()) {
            return [
              {
                id: index + 1,
                url: entry.url,
              },
            ];
          }

          if (typeof entry.b64_json === "string" && entry.b64_json.trim()) {
            return [
              {
                id: index + 1,
                base64: entry.b64_json,
              },
            ];
          }

          return [];
        }) ?? [];

      if (images.length === 0) {
        return {
          success: false,
          error: "Together image generation returned no images.",
        };
      }

      return {
        success: true,
        provider: "together",
        model,
        width,
        height,
        images,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Together image generation failed: ${message}`,
      };
    } finally {
      clearTimeout(timeout);
    }
  },
});
