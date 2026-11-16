import type { Metadata } from "next";
import { absoluteUrl } from "./cards";

// Open Graph + X card tags for one page. Every image is 1200x630 and every card is a large image card.
export function shareMeta(opts: {
  title: string;
  description: string;
  siteName: "FTN News" | "FTN+";
  image: string;
  imageAlt?: string;
  type?: "website" | "article" | "video.other";
}): Pick<Metadata, "openGraph" | "twitter"> {
  const image = absoluteUrl(opts.image) || opts.image;
  const isCard = image.includes("/og/");
  const images = [{ url: image, ...(isCard ? { width: 1200, height: 630 } : {}), alt: opts.imageAlt || opts.title }];
  return {
    openGraph: {
      title: opts.title,
      description: opts.description,
      siteName: opts.siteName,
      type: opts.type || "website",
      images,
    },
    twitter: {
      card: "summary_large_image",
      title: opts.title,
      description: opts.description,
      images: [image],
    },
  };
}
