import dynamic from "next/dynamic";
import Image from "next/image";
import { HeroSection } from "./components/HeroSection";
import { FeaturesSection } from "./components/FeaturesSection";
import { TrendingCoinsSection } from "./components/TrendingCoinsSection";
const TestimonialsSection = dynamic(() => import("./components/TestimonialsSection").then(m => m.TestimonialsSection), { ssr: true });
const VideoSection = dynamic(() => import("./components/VideoSection").then(m => m.VideoSection), { ssr: true });
const RoadmapSection = dynamic(() => import("./components/RoadmapSection").then(m => m.RoadmapSection), { ssr: true });
const FAQSection = dynamic(() => import("./components/FAQSection").then(m => m.FAQSection));
import { CTASection } from "./components/CTASection";
import { HomepageFooter } from "./components/HomepageFooter";

export default function Homepage() {
  return (
    <main className="bg-black text-white">
      <HeroSection />
      <section className="px-6 md:px-10 max-w-7xl mx-auto py-10">
        <div className="flex items-center justify-center gap-6 opacity-80">
          <Image src="/assets/homepage/partner-1.png" alt="Partner 1" width={120} height={32} />
          <Image src="/assets/homepage/partner-2.png" alt="Partner 2" width={120} height={32} />
          <Image src="/assets/homepage/partner-3.png" alt="Partner 3" width={120} height={32} />
        </div>
      </section>
      <TrendingCoinsSection />
      <FeaturesSection />
      <TestimonialsSection />
      <VideoSection />
      <RoadmapSection />
      <FAQSection />
      <CTASection />
      <HomepageFooter />
    </main>
  );
}
