import type { Metadata } from "next";
import Link from "next/link";
import { Inter, Fraunces } from "next/font/google";
import { I18nProvider } from "@/components/i18n/I18nProvider";
import { SiteTopBar } from "@/components/shared/SiteTopBar";
import { AtmosphereLayer } from "@/components/visual/AtmosphereLayer";
import { ParticleField } from "@/components/visual/ParticleField";
import { PageTransition } from "@/components/visual/PageTransition";
import { JourneyRail } from "@/components/journey/JourneyRail";
import { resolveLocale } from "@/lib/i18n/server";
import { translate } from "@/lib/i18n/dictionaries";
import { LOCALE_HTML_TAGS } from "@/lib/i18n/config";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  fallback: ["Georgia", "Times New Roman", "serif"],
});

export async function generateMetadata(): Promise<Metadata> {
  const locale = await resolveLocale();
  return {
    title: translate(locale, "meta.title"),
    description: translate(locale, "meta.description"),
    metadataBase: new URL("http://localhost:3000"),
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await resolveLocale();

  return (
    <html
      lang={LOCALE_HTML_TAGS[locale]}
      className={`${inter.variable} ${fraunces.variable}`}
    >
      <body className="min-h-dvh antialiased">
        <AtmosphereLayer />
        <ParticleField />
        <div className="relative z-10">
          <I18nProvider initialLocale={locale}>
            <SiteTopBar />
            <JourneyRail />
            <PageTransition>{children}</PageTransition>
            <footer className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-4 border-t border-[var(--color-line)] px-8 py-6 text-xs text-[var(--color-silver-500)] sm:px-12 lg:px-16">
              <span>字形来源：崇羲篆體·中研院小學堂</span>
              <Link href="/about" className="underline underline-offset-4">关于印可道 · 字体与来源</Link>
            </footer>
          </I18nProvider>
        </div>
      </body>
    </html>
  );
}
