// @ts-check
import { defineConfig } from "astro/config";

import expressiveCode from "astro-expressive-code";

// https://astro.build/config
export default defineConfig({
  redirects: {
    "/": {
      status: 302,
      destination: "/blogs",
    },
  },

  integrations: [
    expressiveCode({
      themes: ["dracula"],
    }),
  ],
});
