import Image from "next/image";
import { HeroSection } from "@/components/homepage/HeroSection";
import { FeaturesSection } from "@/components/homepage/FeaturesSection";
import { TrendingCoinsSection } from "@/components/homepage/TrendingCoinsSection";
import { CTASection } from "@/components/homepage/CTASection";
import { HomepageFooter } from "@/components/homepage/HomepageFooter";
import { TestimonialsSection } from "@/components/homepage/TestimonialsSection";
import { VideoSection } from "@/components/homepage/VideoSection";
import { RoadmapSection } from "@/components/homepage/RoadmapSection";
import { FAQSection } from "@/components/homepage/FAQSection";

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
