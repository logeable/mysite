// @ts-check
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
  redirects: {
    "/": {
      status: 302,
      destination: "/blogs",
    },
  },
  markdown: {
    shikiConfig: {
      theme: "dracula",
    },
  },
});
