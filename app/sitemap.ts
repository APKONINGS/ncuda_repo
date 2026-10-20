import type { MetadataRoute } from "next";
import { site } from "@/lib/content/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/about", "/activities", "/contact"].map((path) => ({
    url: `${site.url}${path}`,
    changeFrequency: "monthly",
    priority: path === "" ? 1 : 0.7,
  }));
}
