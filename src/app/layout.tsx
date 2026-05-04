import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "De-Jargonizer | Simple Truths",
  description:
    "Instant clarity for complex ideas. Paste jargon-heavy text and get intuitive explanations and structured breakdowns powered by AI.",
  keywords: [
    "AI",
    "de-jargonizer",
    "jargon",
    "simplifier",
    "complexity",
    "explainer",
    "education",
    "plain language",
  ],
  authors: [{ name: "The Imperialists" }],
  openGraph: {
    title: "De-Jargonizer | Simple Truths",
    description:
      "Instant clarity for complex ideas. Paste jargon-heavy text and get intuitive explanations powered by AI.",
    type: "website",
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
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body suppressHydrationWarning className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
