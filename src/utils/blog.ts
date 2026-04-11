import { getCollection, type CollectionEntry } from "astro:content";

type BlogEntry = CollectionEntry<"blog">;

export const getBlogSlug = (blog: BlogEntry) => {
  return blog.data.seoSlug ?? blog.id;
};

export const getBlogUrl = (blog: BlogEntry) => {
  return `/blogs/${getBlogSlug(blog)}`;
};

export const getBlogBySlug = async (slug: string) => {
  const blogs = await getCollection("blog");
  return blogs.find((blog) => {
    return getBlogSlug(blog) === slug || blog.id === slug;
  });
};

export const getStaticBlogPaths = async () => {
  const blogs = await getCollection("blog");
  const usedSlugs = new Set<string>();
  const paths: { params: { blog: string } }[] = [];

  for (const blog of blogs) {
    const slug = getBlogSlug(blog);
    const aliases = slug === blog.id ? [slug] : [slug, blog.id];

    for (const alias of aliases) {
      if (usedSlugs.has(alias)) {
        throw new Error(`Duplicate blog slug detected: ${alias}`);
      }
      usedSlugs.add(alias);
      paths.push({
        params: { blog: alias },
      });
    }
  }

  return paths;
};

export const getBlogsByPublishDateDesc = async () => {
  const blogs = await getCollection("blog");
  return blogs.sort((a, b) => {
    return (
      new Date(b.data.publishDate).getTime() -
      new Date(a.data.publishDate).getTime()
    );
  });
};
