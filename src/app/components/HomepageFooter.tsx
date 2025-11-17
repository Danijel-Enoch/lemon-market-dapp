"use client";
import Image from "next/image";
import Link from "next/link";
import { memo } from "react";

export type LinkItem = Readonly<{ label: string; href: string; external?: boolean }>;

export type HomepageFooterProps = Readonly<{
  brand?: Readonly<{ name: string; logoSrc: string; tagline: string }>;
  navigation?: ReadonlyArray<LinkItem>;
  socials?: ReadonlyArray<LinkItem>;
  legal?: ReadonlyArray<LinkItem>;
}>;

const defaultBrand = {
  name: "Lemon Markets",
  logoSrc: "/assets/homepage/logo-footer.svg",
  tagline: "Join thousands trading perpetuals with Lemon markets. Simple setup,"
} as const;

const defaultNavigation: ReadonlyArray<LinkItem> = [
  { label: "Why Lemon Markets?", href: "/perp" },
  { label: "Trending", href: "/trending" },
  { label: "Positions", href: "/positions" },
  { label: "Leaderboard", href: "/leaderboard" },
  { label: "Stake", href: "/staking" }
];

const defaultSocials: ReadonlyArray<LinkItem> = [
  { label: "X(Twitter)", href: "https://x.com", external: true },
  { label: "Discord", href: "https://discord.com", external: true },
  { label: "Youtube", href: "https://youtube.com", external: true },
  { label: "LinkedIn", href: "https://linkedin.com", external: true }
];

const defaultLegal: ReadonlyArray<LinkItem> = [
  { label: "Terms Of Service", href: "#" },
  { label: "Privacy Policy", href: "#" }
];

export const HomepageFooter = memo(function HomepageFooter({
  brand = defaultBrand,
  navigation = defaultNavigation,
  socials = defaultSocials,
  legal = defaultLegal
}: HomepageFooterProps) {
  const navId = "footer-nav";
  const socialsId = "footer-socials";
  const legalId = "footer-legal";

  return (
    <footer role="contentinfo" className="px-6 md:px-10 pt-10 pb-16">
      <div className="max-w-7xl mx-auto">
        <div className="rounded-3xl p-6 md:p-10 bg-[linear-gradient(172.34deg,#0a1a0300_-34.4%,#0a1a031c_51.7%,#1c6200_161.09%)]">
          <div className="mt-10 h-px w-full bg-[#4dad31]" />
          <div className="mt-10 grid gap-8 md:grid-cols-4">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <Image src={brand.logoSrc} alt={brand.name} width={40} height={40} loading="lazy" decoding="async" />
                <p className="text-xl md:text-[34px] font-semibold bg-clip-text text-transparent bg-[linear-gradient(101.95deg,#ffffff_3.88%,#f8f8f8_60.64%)]">
                  {brand.name}
                </p>
              </div>
              <p className="max-w-xs bg-clip-text text-transparent bg-[linear-gradient(99.67deg,#ffffff_3.72%,#f8f8f8_60.28%)]">
                {brand.tagline}
              </p>
            </div>
            <nav aria-labelledby={navId}>
              <p id={navId} className="text-white/80 mb-3">Navigation</p>
              <ul className="space-y-2 text-white/70">
                {navigation.map((item) => (
                  <li key={item.label}>
                    <Link href={item.href} className="hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400">
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            <nav aria-labelledby={socialsId}>
              <p id={socialsId} className="text-white/80 mb-3">Socials</p>
              <ul className="space-y-2 text-white/70">
                {socials.map((item) => (
                  <li key={item.label}>
                    {item.external ? (
                      <a
                        href={item.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400"
                      >
                        {item.label}
                      </a>
                    ) : (
                      <Link href={item.href} className="hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400">
                        {item.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
            <nav aria-labelledby={legalId}>
              <p id={legalId} className="text-white/80 mb-3">Legal</p>
              <ul className="space-y-2 text-white/70">
                {legal.map((item) => (
                  <li key={item.label}>
                    <Link href={item.href} className="hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400">
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
          <p className="mt-10 text-white/50 text-sm">Copyright © 2025 Lemon Markets. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
});

export default HomepageFooter;
