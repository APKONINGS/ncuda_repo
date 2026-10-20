import type { Metadata, Viewport } from "next";
import { Fraunces, Instrument_Sans } from "next/font/google";
import { site } from "@/lib/content/site";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz", "SOFT", "WONK"],
  style: ["normal", "italic"],
  display: "swap",
});

const instrument = Instrument_Sans({
  variable: "--font-instrument",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: site.title, template: `%s — ${site.shortName}` },
  description: site.description,
  applicationName: site.shortName,
  openGraph: {
    type: "website",
    siteName: site.title,
    title: site.title,
    description: site.description,
    locale: "en_GB",
    images: [{ url: "/images/hero/momo-hills-batibo.jpg", width: 2200, height: 1650, alt: "Hills of Momo Division" }],
  },
  twitter: { card: "summary_large_image", title: site.title, description: site.description },
};

export const viewport: Viewport = {
  themeColor: "#142a20",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-scroll-behavior="smooth" className={`${fraunces.variable} ${instrument.variable} antialiased`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
