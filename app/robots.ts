import type { MetadataRoute } from "next";
import { site } from "@/lib/content/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/dashboard", "/member-portal/forgot-password"] }],
    sitemap: `${site.url}/sitemap.xml`,
  };
}
