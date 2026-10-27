import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Bricolage_Grotesque, DM_Sans } from "next/font/google";
import "./globals.css";
import { SiteConfigProvider } from "@/lib/site-config-context";
import { ThemeProvider } from "@/lib/theme-context";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const gsDisplay = Bricolage_Grotesque({
  variable: "--font-gs-display",
  subsets: ["latin"],
  display: "swap",
});

const gsBody = DM_Sans({
  variable: "--font-gs-body",
  subsets: ["latin"],
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
