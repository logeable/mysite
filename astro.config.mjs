// @ts-check
import { defineConfig } from "astro/config";

import expressiveCode from "astro-expressive-code";

import sitemap from "@astrojs/sitemap";

import mdx from "@astrojs/mdx";

// https://astro.build/config
export default defineConfig({
  site: "https://www.logeable.com",
  integrations: [
    expressiveCode({
      themes: ["dracula"],
    }),
    sitemap(),
    mdx(),
  ],
});
