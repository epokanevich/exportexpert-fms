import type { MetadataRoute } from "next";

/** Внутренняя система учёта: индексация поисковиками не нужна. */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
