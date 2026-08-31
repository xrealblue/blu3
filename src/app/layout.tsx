import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PlaylistsProvider } from "@/hooks/usePlaylists";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";

export const metadata: Metadata = {
  metadataBase: new URL("https://blu3.in"),
  title: {
    default: "Blu3 — Listen Together in Real-Time Music Rooms",
    template: "%s | Blu3",
  },
  description:
    "Blu3 is a real-time collaborative music listening platform. Create music rooms, listen together with friends, discover new songs from JioSaavn and YouTube, and share the vibe. Free, no ads, cross-platform.",
  keywords: [
    "blu3",
    "blu3 music",
    "blue music",
    "listen together",
    "music rooms",
    "listen with friends",
    "sync music",
    "real-time music",
    "collaborative playlist",
    "jiosaavn",
    "youtube music",
    "party music",
    "group listening",
  ],
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: "https://blu3.in",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Blu3",
  },
  other: {
    "mobile-web-app-capable": "yes",
    "google-site-verification": "",
  },
  openGraph: {
    title: "Blu3 — Listen Together in Real-Time Music Rooms",
    description:
      "Create music rooms and listen together with friends in real-time. Free, no ads, cross-platform. Powered by JioSaavn & YouTube.",
    url: "https://blu3.in",
    siteName: "Blu3",
    images: [{ url: "/homebanner.png" }],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Blu3 — Listen Together in Real-Time Music Rooms",
    description:
      "Create music rooms and listen together with friends in real-time. Free, no ads, cross-platform.",
    images: ["/XBanner.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`milano  text-black h-full antialiased`}>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/publiclogo.svg" type="image/svg+xml" />
        <link rel="canonical" href="https://blu3.in" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#000000" />
        <meta name="application-name" content="Blu3" />
        <script
          dangerouslySetInnerHTML={{
            __html: `console.log("%cBlu3 is developed by bluwwi", "font-size:26px;font-weight:500;color:#ABD2FA;padding:4px 8px;");`,
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              name: "Blu3",
              url: "https://blu3.in",
              description:
                "Real-time collaborative music listening platform. Create music rooms and listen together with friends.",
              applicationCategory: "MusicApplication",
              operatingSystem: "Web",
              offers: { "@type": "Offer", price: "0" },
              author: {
                "@type": "Organization",
                name: "Blu3",
                url: "https://blu3.in",
              },
            }),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebApplication",
              name: "Blu3",
              url: "https://blu3.in",
              description:
                "Create real-time collaborative music rooms. Listen together with friends, discover new songs from JioSaavn and YouTube, and share the vibe.",
              applicationCategory: "Multimedia",
              operatingSystem: "All",
              browserRequirements: "Requires JavaScript",
              offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
            }),
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <PlaylistsProvider>{children}</PlaylistsProvider>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
