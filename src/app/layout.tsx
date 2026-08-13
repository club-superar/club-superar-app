import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { PwaRegister } from "@/app/pwa-register";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: "Club SUPER.AR",
  description: "Sorteos, beneficios y comunidad de SUPER.AR.",
  applicationName: "Club SUPER.AR",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Club SUPER.AR" },
};

export const viewport: Viewport = {
  themeColor: "#050708",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={`${geist.variable} ${geistMono.variable}`}>
      <head>
        <link rel="stylesheet" href="/club.css" />
        <link rel="stylesheet" href="/canjes.css" />
      </head>
      <body><PwaRegister />{children}</body>
    </html>
  );
}
