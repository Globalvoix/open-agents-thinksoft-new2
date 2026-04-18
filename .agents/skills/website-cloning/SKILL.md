---
name: website-cloning
description: Clone the design language, structure, and interaction quality of a category-leading website using Firecrawl screenshots and extracted layout cues, while rewriting all branding and product details for the user's app.
---

Use this skill for the user's first prompt when they ask to build a website, landing page, SaaS product, dashboard, or app UI and they have not provided a complete design system already.

## Goal

Produce category-leading UI by grounding the design in a real competitor reference instead of inventing structure from scratch.

## Required Workflow

1. Identify the product category and the strongest competitor or reference site.
2. Use Firecrawl search to find the competitor site.
3. Use Firecrawl scrape with screenshot output on the selected competitor page.
4. Extract a concise design brief from the screenshot and page structure:
   - section order
   - grid/layout patterns
   - typography hierarchy
   - spacing rhythm
   - accent colors
   - visual density
   - icon/logo treatment
   - motion style
5. Rebuild the user's requested product using that brief.

## Cloning Rules

- Clone the visual language, not the brand.
- Replace all names, copy, product specifics, logos, and business details with the user's product.
- Keep the quality bar of the reference: spacing, composition, hierarchy, and polish should feel equally intentional.
- If the screenshot reveals custom illustrations, photography, icons, or logos, use the available image, icon, and MCP tools to recreate that quality level.
- If the reference uses motion or layered visuals, reproduce the feel with safe production-ready animation patterns rather than generic fade-ins.

## Tool Routing

- First use `firecrawl_search`, then `firecrawl_scrape`.
- Use screenshots as the primary source of visual truth.
- Use `think` to summarize the design brief before implementation.
- Use component, animation, and icon MCP tools when they can recreate parts of the reference more accurately than hand-rolling.
- Use generated images when the page needs custom hero art, polished mockups, or branded editorial visuals that stock media cannot match.

## Output Standard

The result should feel like a premium product in the same category, not a wireframe and not a generic template. Favor sharp hierarchy, better composition, stronger art direction, and more deliberate visual choices than the default path.
