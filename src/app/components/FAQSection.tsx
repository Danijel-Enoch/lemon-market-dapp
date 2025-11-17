"use client";
import { ChevronDown } from "lucide-react";
import Image from "next/image";
import type { FC } from "react";
import { useState } from "react";

const items = [
  {
    q: "How does Lemon Markets use lemon markets in digital asset management?",
    a: "Lemon Perp leverages advanced market mechanisms to provide efficient trading solutions for digital assets."
  },
  { q: "Which cryptocurrencies does Lemon Markets support?", a: "Support for major assets including BTC, ETH, SOL and more." },
  { q: "How do I get started with Lemon Markets?", a: "Connect your wallet, choose a market and start trading." },
  { q: "Can I recover my wallet if I lose my device?", a: "Use your seed phrase or wallet backup to recover access." },
  { q: "Is Lemon Markets available globally?", a: "Available in most regions subject to local regulations." },
  { q: "Does Lemon Markets offer customer support?", a: "Yes — we provide multi-channel support including chat and email." }
];

export const FAQSection: FC = () => {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section className="flex items-center gap-8 py-20 px-6 md:px-10 max-w-5xl mx-auto">
      <div className="text-center mb-12">
        <div className="inline-flex items-center gap-8">
          <Image src="/assets/homepage/section-features-divider.png" alt="Divider" width={72} height={10} className="opacity-90" />
          <span className="text-[#9DEA29] font-medium text-sm leading-[19px]">FAQs</span>
          <Image src="/assets/homepage/section-features-divider.png" alt="Divider" width={72} height={10} className="opacity-90 rotate-180" />
        </div>
        <div className="mt-6">
          <h3 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">Quick answers for New users</h3>
          <p className="mt-3 text-white/70">Lorem ipsum dolor sit amet consectetur. Cursus diam malesuada molestie egestas. Viverra sit.</p>
        </div>
        <a
          href="/docs"
          className="mt-6 inline-flex items-center justify-center rounded-xl border border-white/20 px-6 py-3 text-sm font-semibold bg-gradient-to-r from-lime-600 via-lime-700 to-green-950 text-gray-100 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400"
        >
          Read Full Documentation
        </a>
      </div>

      <div className="space-y-2">
        {items.map((it, i) => (
          <div key={i} className="rounded-xl border border-white/10 bg-neutral-900/40">
            <button
              onClick={() => setOpen(open === i ? null : i)}
              className="w-full flex items-center justify-between px-4 md:px-6 py-4 text-left hover:bg-neutral-900/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400"
            >
              <span className="text-white/90">{it.q}</span>
              <ChevronDown className={`w-5 h-5 text-white/60 transition-transform ${open === i ? "rotate-180" : ""}`} />
            </button>
            {open === i && (
              <div className="px-4 md:px-6 pb-4 text-white/70">{it.a}</div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
};
