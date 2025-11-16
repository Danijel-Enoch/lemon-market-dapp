import type { FC } from "react";
import { FeatureCard } from "./FeatureCard";

export const FeaturesSection: FC = () => {
  return (
    <section className="py-20 px-6 md:px-10 max-w-7xl mx-auto">
      <div className="text-center mb-12">
        <div className="inline-flex items-center gap-3 rounded-full px-6 py-2 bg-neutral-900/60">
          <img src="/assets/homepage/section-features-icon.svg" alt="Features icon" className="h-5 w-5" />
          <span className="text-green-500/70 font-semibold text-xs tracking-wider">FEATURES</span>
          <img src="/assets/homepage/section-features-divider.png" alt="Divider" className="h-3 w-12 opacity-80" />
        </div>
        <h2 className="mt-6 text-4xl md:text-5xl font-semibold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
          Built For Infinite Markets
        </h2>
        <p className="mt-3 text-white/70 max-w-2xl mx-auto">
          Trade with confidence through the most efficient on-chain perpetual protocol.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <FeatureCard
          iconSrc="/assets/homepage/feature-icon-liquidity.png"
          alt="Liquidity icon"
          title="Unified Liquidity Model"
          description="All trades settle against a shared collateral reserve, unlocking deeper liquidity and capital efficiency across every asset."
        />
        <FeatureCard
          iconSrc="/assets/homepage/feature-icon-synthetic.png"
          alt="Synthetic icon"
          title="Synthetic Asset Support"
          description="Access perpetual markets for crypto, forex, and commodities without depending on fragmented DEX liquidity."
        />
        <FeatureCard
          iconSrc="/assets/homepage/feature-icon-oracle.png"
          alt="Oracle icon"
          title="Oracle-Powered Precision"
          description="Reliable, cryptographically verified price data keeps every trade fair and secured."
        />
      </div>
    </section>
  );
};
