import Image from "next/image";
import type { FC } from "react";

export const VideoSection: FC = () => {
  return (
    <section className="py-16 px-6 md:px-10 max-w-5xl mx-auto text-center">
      <div className="inline-flex items-center gap-3 rounded-full px-6 py-2 bg-neutral-900/60">
        <img src="/assets/homepage/section-video-icon.svg" alt="Video section icon" className="h-5 w-5" />
        <span className="text-green-500/70 font-semibold text-xs tracking-wider">FEATURES</span>
        <img src="/assets/homepage/section-features-divider.png" alt="Divider" className="h-3 w-12 opacity-80" />
      </div>
      <h3 className="mt-6 text-3xl md:text-4xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
        Watch How Lemon Markets Works
      </h3>
      <p className="mt-3 text-white/70 max-w-2xl mx-auto">
        A simple platform for traders who want clarity, speed, and control.
      </p>
      <div className="mt-10 rounded-3xl overflow-hidden">
        <Image src="/assets/homepage/video-placeholder.svg" alt="Video" width={1024} height={576} className="w-full h-auto" />
      </div>
    </section>
  );
};
