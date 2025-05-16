import { glob } from "astro/loaders";
import { z, defineCollection } from "astro:content";

const blog = defineCollection({
  loader: glob({ pattern: "**/[^_]*.md", base: "./src/data/blog/" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    publishDate: z.date(),
    modifiedDate: z.date().optional(),
    tags: z.array(z.string()),
    featured: z.boolean().optional(),
    ogImage: z.string().optional(),
  }),
});

export const collections = { blog };
