import { glob } from "astro/loaders";
import { z, defineCollection } from "astro:content";

const blog = defineCollection({
  loader: glob({ pattern: "**/[^_]*.{md,mdx}", base: "./src/data/blog/" }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      seoSlug: z.string().optional(),
      description: z.string(),
      publishDate: z.date(),
      modifiedDate: z.date().optional(),
      tags: z.array(z.string()),
      featured: z.boolean().optional(),
      ogImage: z.union([z.string().url(), image()]).optional(),
      isAI: z.boolean().optional().default(false),
    }),
});

export const collections = { blog };
