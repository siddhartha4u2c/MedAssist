import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

import { THEME_STORAGE_KEY } from "@/lib/theme-constants";

export const metadata: Metadata = {
  title: "MedAssist AI",
  description: "Agentic medical assistant platform",
};

const themeInitScript = `try{var k=${JSON.stringify(THEME_STORAGE_KEY)};if(localStorage.getItem(k)==='dark')document.documentElement.classList.add('dark');}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen">
        <Script id="theme-init" strategy="beforeInteractive">
          {themeInitScript}
        </Script>
        <div className="medassist-app min-h-screen bg-slate-50 text-slate-900 transition-colors duration-200">
          {children}
        </div>
      </body>
    </html>
  );
}
