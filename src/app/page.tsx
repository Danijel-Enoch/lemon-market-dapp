import dynamic from "next/dynamic";
import Image from "next/image";
import { Suspense } from "react";
import { HeroSection } from "@/components/homepage/HeroSection";

// Dynamically import heavy components to reduce initial bundle size
const TrendingCoinsSection = dynamic(
	() =>
		import("@/components/homepage/TrendingCoinsSection").then((mod) => ({
			default: mod.TrendingCoinsSection,
		})),
	{
		loading: () => <div className="h-[273px] w-full" />,
		ssr: true,
	},
);

const FeaturesSection = dynamic(
	() =>
		import("@/components/homepage/FeaturesSection").then((mod) => ({
			default: mod.FeaturesSection,
		})),
	{
		loading: () => <div className="h-[600px] w-full" />,
		ssr: true,
	},
);

const TestimonialsSection = dynamic(
	() =>
		import("@/components/homepage/TestimonialsSection").then((mod) => ({
			default: mod.TestimonialsSection,
		})),
	{
		loading: () => <div className="h-[500px] w-full" />,
		ssr: true,
	},
);

const VideoSection = dynamic(
	() => import("@/components/homepage/VideoSection").then((mod) => ({ default: mod.VideoSection })),
	{
		loading: () => <div className="h-[400px] w-full" />,
	},
);

const RoadmapSection = dynamic(
	() =>
		import("@/components/homepage/RoadmapSection").then((mod) => ({ default: mod.RoadmapSection })),
	{
		loading: () => <div className="h-[600px] w-full" />,
		ssr: true,
	},
);

const FAQSection = dynamic(
	() => import("@/components/homepage/FAQSection").then((mod) => ({ default: mod.FAQSection })),
	{
		loading: () => <div className="h-[500px] w-full" />,
		ssr: true,
	},
);

const CTASection = dynamic(
	() => import("@/components/homepage/CTASection").then((mod) => ({ default: mod.CTASection })),
	{
		loading: () => <div className="h-[300px] w-full" />,
		ssr: true,
	},
);

const HomepageFooter = dynamic(
	() =>
		import("@/components/homepage/HomepageFooter").then((mod) => ({ default: mod.HomepageFooter })),
	{
		loading: () => <div className="h-[200px] w-full" />,
		ssr: true,
	},
);

export default function Homepage() {
	return (
		<main className="bg-black text-white overflow-x-hidden">
			<HeroSection />
			<section className="px-6 md:px-10 max-w-7xl mx-auto py-10">
				<div className="flex items-center justify-center gap-6 opacity-80">
					<Image
						src="/assets/homepage/partner-1.png"
						alt="Partner 1"
						width={120}
						height={32}
						style={{ width: "auto", height: "auto" }}
					/>
					<Image
						src="/assets/homepage/partner-2.png"
						alt="Partner 2"
						width={120}
						height={32}
						style={{ width: "auto", height: "auto" }}
					/>
					<Image
						src="/assets/homepage/partner-3.png"
						alt="Partner 3"
						width={120}
						height={32}
						style={{ width: "auto", height: "auto" }}
					/>
				</div>
			</section>
			<Suspense fallback={<div className="h-[273px] w-full" />}>
				<TrendingCoinsSection />
			</Suspense>
			<Suspense fallback={<div className="h-[600px] w-full" />}>
				<FeaturesSection />
			</Suspense>
			<Suspense fallback={<div className="h-[500px] w-full" />}>
				<TestimonialsSection />
			</Suspense>
			<Suspense fallback={<div className="h-[400px] w-full" />}>
				<VideoSection />
			</Suspense>
			<Suspense fallback={<div className="h-[600px] w-full" />}>
				<RoadmapSection />
			</Suspense>
			<Suspense fallback={<div className="h-[500px] w-full" />}>
				<FAQSection />
			</Suspense>
			<Suspense fallback={<div className="h-[300px] w-full" />}>
				<CTASection />
			</Suspense>
			<Suspense fallback={<div className="h-[200px] w-full" />}>
				<HomepageFooter />
			</Suspense>
		</main>
	);
}
