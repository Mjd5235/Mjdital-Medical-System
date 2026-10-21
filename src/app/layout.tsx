import type { Metadata } from "next";
import { Cairo, Inter, Tajawal } from "next/font/google";
import { LocaleScript } from "@/components/providers/locale-script";
import { ThemeScript } from "@/components/providers/theme-script";
import { brand } from "@/config/brand";
import "./globals.css";

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  variable: "--font-cairo",
  display: "swap",
});

const tajawal = Tajawal({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "700", "800"],
  variable: "--font-tajawal",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: `${brand.nameAr} | ${brand.nameEn}`,
  description: "نظام تشغيل المراكز الطبية المتعددة التخصصات في الرياض",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className={`${cairo.variable} ${tajawal.variable} ${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
        <LocaleScript />
      </head>
      <body className="min-h-full overflow-x-hidden bg-background font-sans text-foreground">
        {children}
      </body>
    </html>
  );
}
