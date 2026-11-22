import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { SITE_URL, STATIC_CARDS } from "@/lib/og/cards";
import { shareMeta } from "@/lib/og/meta";
import "@/components/plus/plus.css";
import { SiteConfigProvider } from "@/lib/site-config-context";
import { ThemeProvider } from "@/lib/theme-context";
import { RadioProvider } from "@/components/radio/radio-provider";
import { MaintenanceBanner } from "@/components/maintenance-banner";

const geistSans = localFont({
  src: "../node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2",
  variable: "--font-geist-sans",
  weight: "100 900",
  display: "swap",
});

const geistMono = localFont({
  src: "../node_modules/@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2",
  variable: "--font-geist-mono",
  weight: "100 900",
  display: "swap",
});

const gsDisplay = localFont({
  src: "../node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2",
  variable: "--font-gs-display",
  weight: "100 900",
  display: "swap",
});

const gsBody = localFont({
  src: "../node_modules/@fontsource-variable/dm-sans/files/dm-sans-latin-wght-normal.woff2",
  variable: "--font-gs-body",
  weight: "100 900",
  display: "swap",
});

const manrope = localFont({
  src: "../node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2",
  variable: "--font-manrope",
  weight: "200 800",
  display: "swap",
});

// Also the colour of the stripe beside a link preview on Discord.
export const viewport: Viewport = {
  themeColor: "#ffbb14",
};

export const metadata: Metadata = {
  // Makes every relative image URL in the share tags absolute (it was localhost on the live site).
  metadataBase: new URL(SITE_URL),
  title: {
    default: "FTN News",
    template: "%s | FTN News",
  },
  description: "The #1 Roblox Ro-State news source, covering politics, sports, crime, and more.",
  icons: {
    icon: "/logos/ftn_favicon_transparent.png",
  },
  ...shareMeta({
    title: "FTN News",
    description: "The #1 Roblox Ro-State news source, covering politics, sports, crime, and more.",
    siteName: "FTN News",
    image: STATIC_CARDS.home,
  }),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var t = localStorage.getItem('ftn_theme');
                if (t === 'dark') {
                  document.documentElement.classList.add('dark');
                } else {
                  document.documentElement.classList.remove('dark');
                }
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} ${gsDisplay.variable} ${gsBody.variable} ${manrope.variable} font-sans antialiased bg-background text-foreground min-h-screen`} suppressHydrationWarning>
        <MaintenanceBanner />
        <ThemeProvider>
          <SiteConfigProvider>
            <RadioProvider>{children}</RadioProvider>
          </SiteConfigProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
