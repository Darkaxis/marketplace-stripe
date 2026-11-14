import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/layout/header";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Marketplace - Buy and Sell Items Locally",
  description:
    "Discover, buy, and sell items locally on Marketplace. Browse electronics, vehicles, furniture, apparel, and more in Palo Alto, CA.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-[#F0F2F5] font-sans text-[#050505] antialiased`}
      >
        <Header />
        <div className="flex min-h-[calc(100vh-3.5rem)] flex-col">
          {children}
        </div>
      </body>
    </html>
  );
}
