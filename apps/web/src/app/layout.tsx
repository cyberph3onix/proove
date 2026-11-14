import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Roboto } from "next/font/google";
import "./globals.css";
import { AppProviders } from "@/components/app/providers";
import { Navbar } from "@/components/layout/navbar";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const roboto = Roboto({ variable: "--font-roboto", subsets: ["latin"], weight: ["400", "500", "700"] });

export const metadata: Metadata = {
  title: { default: "PROOVE | Freelance work you can prove", template: "%s | PROOVE" },
  description: "Milestone escrow on Solana with agreed terms, AI-checked deliveries, human-signed dispute verdicts and portable credentials.",
};

export const viewport: Viewport = { themeColor: "#050505", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${roboto.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[#050505] text-[#F5F5F5]">
        <AppProviders>
          <Navbar />
          <main className="flex-1">{children}</main>
          <footer className="border-t border-white/[0.06] mt-16">
            <div className="max-w-[1440px] mx-auto px-4 sm:px-6 md:px-12 py-8 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between text-xs text-[#71717A]">
              <span>
                PROOVE<span className="text-[#FF6FAF]">.</span> Non-custodial milestone escrow on Solana. Devnet preview.
              </span>
              <span>AI proposes, humans decide, escrow pays.</span>
            </div>
          </footer>
        </AppProviders>
      </body>
    </html>
  );
}
