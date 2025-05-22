import { glob } from "astro/loaders";
import { z, defineCollection } from "astro:content";

const blog = defineCollection({
  loader: glob({ pattern: "**/[^_]*.{md,mdx}", base: "./src/data/blog/" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    publishDate: z.date(),
    modifiedDate: z.date().optional(),
    tags: z.array(z.string()),
    featured: z.boolean().optional(),
    ogImage: z.string().optional(),
    isAI: z.boolean().optional().default(false),
  }),
});

export const collections = { blog };
