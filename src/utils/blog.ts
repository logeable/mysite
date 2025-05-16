import { getCollection, type CollectionEntry } from "astro:content";

export const getBlogsByPublishDateDesc = async () => {
  const blogs = await getCollection("blog");
  return blogs.sort((a, b) => {
    return (
      new Date(b.data.publishDate).getTime() -
      new Date(a.data.publishDate).getTime()
    );
  });
};
