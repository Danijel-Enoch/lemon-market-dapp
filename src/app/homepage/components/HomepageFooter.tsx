import Image from "next/image";
import type { FC } from "react";

export const HomepageFooter: FC = () => {
  return (
    <footer className="px-6 md:px-10 pt-10 pb-16 border-t border-white/10">
      <div className="max-w-7xl mx-auto">
        <div className="rounded-3xl border border-white/10 p-6 md:p-10 bg-neutral-900/40">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="flex items-center gap-3">
              <Image src="/assets/homepage/logo-footer.png" alt="Lemon Markets" width={40} height={40} />
              <p className="text-white font-semibold">Lemon Markets</p>
            </div>
            <a
              href="/perp"
              className="inline-flex items-center justify-center rounded-xl border border-white/20 px-6 py-3 text-sm font-semibold bg-gradient-to-r from-lime-600 via-lime-700 to-green-950 text-gray-100 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400"
            >
              Launch App
            </a>
          </div>
          <div className="mt-6 border-t border-white/10" />
          <div className="mt-6 grid md:grid-cols-4 gap-8">
            <div>
              <p className="text-white/80 mb-3">Navigation</p>
              <div className="space-y-2 text-white/60">
                <a href="/perp" className="hover:text-white">Why Lemon Markets?</a>
                <a href="/trending" className="hover:text-white">Trending</a>
                <a href="/positions" className="hover:text-white">Positions</a>
                <a href="/leaderboard" className="hover:text-white">Leaderboard</a>
                <a href="/staking" className="hover:text-white">Stake</a>
              </div>
            </div>
            <div>
              <p className="text-white/80 mb-3">Socials</p>
              <div className="space-y-2 text-white/60">
                <a href="https://x.com" className="hover:text-white">X(Twitter)</a>
                <a href="https://discord.com" className="hover:text-white">Discord</a>
                <a href="https://youtube.com" className="hover:text-white">Youtube</a>
                <a href="https://linkedin.com" className="hover:text-white">LinkedIn</a>
              </div>
            </div>
            <div>
              <p className="text-white/80 mb-3">Legal</p>
              <div className="space-y-2 text-white/60">
                <a href="#" className="hover:text-white">Terms Of Service</a>
                <a href="#" className="hover:text-white">Privacy Policy</a>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Image src="/assets/homepage/logo-footer.png" alt="Lemon Markets" width={32} height={32} />
              <p className="text-white/70">Join thousands trading perpetuals with Lemon markets.</p>
            </div>
          </div>
          <p className="mt-6 text-white/50 text-sm">Copyright © 2025 Lemon Markets. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
};
