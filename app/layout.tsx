import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chief of Staff",
  description: "Your tasks, habits, journal, money and notes in one place.",
  applicationName: "Chief of Staff",
  appleWebApp: { capable: true, title: "Chief of Staff", statusBarStyle: "default" },
  icons: { icon: "/icon-192.png", apple: "/icon-180.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#EDF0EE" },
    { media: "(prefers-color-scheme: dark)", color: "#0D1211" },
  ],
};

const registerServiceWorker = `
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () { navigator.serviceWorker.register('/sw.js').catch(function () {}); });
}
if (navigator.storage && navigator.storage.persist) { navigator.storage.persist().catch(function () {}); }
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap"
        />
      </head>
      <body>
        {children}
        <script dangerouslySetInnerHTML={{ __html: registerServiceWorker }} />
      </body>
    </html>
  );
}
