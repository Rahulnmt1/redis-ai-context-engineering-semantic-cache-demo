import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AUTHOR_ATTRIBUTION } from "@/lib/attribution";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Company Leaves — Redis, context engineering, semantic cache",
  description:
    "Handbook RAG with Redis 8 vector search, context inspector, and semantic caching.",
  authors: [{ name: "Rahul Choubey" }],
  other: {
    "demo-credit": AUTHOR_ATTRIBUTION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <footer
          className="mt-auto border-t border-zinc-800 bg-zinc-950 py-3 text-center text-xs text-zinc-500"
          aria-label="Author attribution"
        >
          {AUTHOR_ATTRIBUTION}
        </footer>
      </body>
    </html>
  );
}
