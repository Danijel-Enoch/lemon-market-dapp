import Image from "next/image";
import type { FC } from "react";

const phases = [
  {
    title: "Phase I",
    items: [
      "Deploy multi-chain support across Ethereum, Bitcoin, and EVM-compatible networks.",
      "Integrate Chainlink oracles and verified market data feeds.",
      "Conduct independent security audits to guarantee protocol integrity.",
      "Build the base liquidity engine for synthetic asset trading."
    ]
  },
  {
    title: "Phase III",
    items: [
      "Launch AI-driven analytics dashboards to surface market insights and trading intelligence.",
      "Roll out cross-chain swaps and portfolio rebalancing features.",
      "Optimise UI/UX and backend systems for high-speed, low-latency performance.",
      "Begin controlled user onboarding (1,000+ early testers)."
    ]
  },
  {
    title: "Phase IV",
    items: [
      "FX Markets — Add major currency pairs: EUR/USD, GBP/USD, USD/JPY.",
      "Introduce exotic pairs and emerging market currencies for broader exposure.",
      "Integrate real-time FX data feeds for transparency and precision.",
      "Commodities — Enable synthetic trading for Gold, Silver, Platinum; add Energy and Agricultural assets."
    ]
  },
  {
    title: "Phase V",
    items: [
      "Integrate DeFi protocols (Uniswap, Aave) and Layer-2 networks.",
      "Add staking, governance, and institutional tools."
    ]
  }
];

export const RoadmapSection: FC = () => {
  const left = phases.filter((_, i) => i % 2 === 0);
  const right = phases.filter((_, i) => i % 2 === 1);

  const Card = ({ title, items, align }: { title: string; items: string[]; align: "left" | "right" }) => (
    <div className="relative">
      <div className="absolute top-6" style={{ [align === "left" ? "right" : "left"]: "-0.5rem" }}>
        <span className="block w-3 h-3 rounded-full bg-gradient-to-r from-lime-300 to-green-950"></span>
      </div>
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 backdrop-blur-sm p-6 shadow-lg">
        <h3 className="text-2xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent mb-4">{title}</h3>
        <ul className="space-y-2 text-white/80">
          {items.map((it, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-2 w-1.5 h-1.5 rounded-full bg-lime-400"></span>
              <span>{it}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );

  return (
    <section className="py-20 px-6 md:px-10 max-w-7xl mx-auto">
      <div className="text-center mb-12">
        <div className="inline-flex items-center gap-8">
          <Image src="/assets/homepage/section-features-divider.png" alt="Divider" width={72} height={10} className="opacity-90" />
          <span className="text-[#9DEA29] font-medium text-sm leading-[19px]">Goals</span>
          <Image src="/assets/homepage/section-features-divider.png" alt="Divider" width={72} height={10} className="opacity-90 rotate-180" />
        </div>
        <h2 className="mt-6 text-4xl md:text-5xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">Roadmap</h2>
      </div>

      <div className="relative">
        <div className="hidden md:block absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-lime-300 to-green-950"></div>
        <div className="grid md:grid-cols-[1fr_1fr] gap-8">
          <div className="space-y-8">
            {left.map((phase, idx) => (
              <Card key={idx} title={phase.title} items={phase.items} align="left" />
            ))}
          </div>
          <div className="space-y-8">
            {right.map((phase, idx) => (
              <Card key={idx} title={phase.title} items={phase.items} align="right" />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
