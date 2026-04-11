// @ts-check
import { defineConfig } from "astro/config";

import expressiveCode from "astro-expressive-code";

import sitemap from "@astrojs/sitemap";

import mdx from "@astrojs/mdx";
import rehypeExternalLinks from "rehype-external-links";

// https://astro.build/config
export default defineConfig({
  site: "https://www.logeable.com",
  integrations: [
    expressiveCode({
      themes: ["github-light"],
    }),
    sitemap(),
    mdx(),
  ],
  markdown: {
    rehypePlugins: [
      [
        rehypeExternalLinks,
        { content: { type: "text", value: "⤴" }, target: "_blank" },
      ],
    ],
  },
});
