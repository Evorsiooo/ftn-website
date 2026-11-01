import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { SiteConfigProvider } from "@/lib/site-config-context";
import { ThemeProvider } from "@/lib/theme-context";

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

export const viewport: Viewport = {
  themeColor: "#e2162b",
};

export const metadata: Metadata = {
  title: {
    default: "FTN News",
    template: "FTN News | %s",
  },
  description: "The #1 Roblox Ro-State news source, covering politics, sports, crime, and more.",
  icons: {
    icon: "/logos/ftn_favicon_transparent.png",
  },
  openGraph: {
    title: "FTN News",
    description: "The #1 Roblox Ro-State news source, covering politics, sports, crime, and more.",
    type: "website",
    siteName: "FTN News",
  },
  twitter: {
    card: "summary",
    title: "FTN News",
    description: "The #1 Roblox Ro-State news source, covering politics, sports, crime, and more.",
  },
  other: {
    "theme-color": "#e2162b",
  },
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
      <body className={`${geistSans.variable} ${geistMono.variable} ${gsDisplay.variable} ${gsBody.variable} font-sans antialiased bg-background text-foreground min-h-screen`} suppressHydrationWarning>
        <ThemeProvider>
          <SiteConfigProvider>
            {children}
          </SiteConfigProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
