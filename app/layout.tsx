import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { ConvexClientProvider } from "@/app/ConvexClientProvider";
import { ThemeProvider } from "@/components/theme-provider";
import { getToken } from "@/lib/auth-server";

const fontSans = localFont({
  src: "../public/fonts/JetBrainsMono-Regular.ttf",
  variable: "--font-sans",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "https://bukmarks.vercel.app"
  ),
  title: { default: "Bukmarks", template: "%s | Bukmarks" },
  description: "Organize and manage your bookmarks with ease",
  keywords: [
    "bookmarks",
    "save links",
    "organize bookmarks",
    "bookmark manager",
  ],
  authors: [{ name: "Yashraj Maher", url: "https://yashrajmaher.vercel.app" }],
  creator: "Yashraj Maher",
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "Bukmarks",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "Bukmarks",
    description: "Organize and manage your bookmarks with ease",
    site: "@yashrajmaher",
    creator: "@yashrajmaher",
  },
  alternates: {
    canonical: "./",
  },
  other: (() => {
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? "https://bukmarks.vercel.app";
    return {
      "twitter:url": baseUrl,
      "twitter:domain": new URL(baseUrl).hostname,
    };
  })(),
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#000000",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const token = await getToken();

  return (
    <html lang="en" className={fontSans.variable} suppressHydrationWarning>
      <body className="antialiased">
        <ConvexClientProvider initialToken={token}>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            {children}
          </ThemeProvider>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
