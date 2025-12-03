import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { BackgroundRippleEffect } from "@/components/ui/background-ripple-effect";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI DB Agent - Query Your Database with Natural Language",
  description: "Convert natural language to database queries using AI",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {/* Global Background Ripple Effect */}
        <div className="fixed inset-0 z-0">
          <BackgroundRippleEffect />
        </div>
        
        {/* Content Layer */}
        <div className="relative z-10">
          {children}
        </div>
      </body>
    </html>
  );
}