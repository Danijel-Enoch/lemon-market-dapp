import { lazy, Suspense } from "react";
import { HeroSection } from "@/components/homepage/HeroSection";
import type { Metadata } from "@/lib/types";

// Dynamically import heavy components to reduce initial bundle size
const TrendingCoinsSection = lazy(() =>
	import("@/components/homepage/TrendingCoinsSection").then(({ TrendingCoinsSection }) => ({
		default: TrendingCoinsSection,
	})),
);

const FeaturesSection = lazy(() =>
	import("@/components/homepage/FeaturesSection").then(({ FeaturesSection }) => ({
		default: FeaturesSection,
	})),
);

// const TestimonialsSection = lazy(() => import("@/components/homepage/TestimonialsSection"));

const VideoSection = lazy(() =>
	import("@/components/homepage/VideoSection").then(({ VideoSection }) => ({
		default: VideoSection,
	})),
);

const RoadmapSection = lazy(() =>
	import("@/components/homepage/RoadmapSection").then(({ RoadmapSection }) => ({
		default: RoadmapSection,
	})),
);

const FAQSection = lazy(() =>
	import("@/components/homepage/FAQSection").then(({ FAQSection }) => ({
		default: FAQSection,
	})),
);

const CTASection = lazy(() =>
	import("@/components/homepage/CTASection").then(({ CTASection }) => ({
		default: CTASection,
	})),
);

const HomepageFooter = lazy(() =>
	import("@/components/homepage/HomepageFooter").then(({ HomepageFooter }) => ({
		default: HomepageFooter,
	})),
);

export const metadata: Metadata = {
	title: "Lemon Markets - Decentralized Perpetual Trading",
	description: "Trade perpetual futures with leverage on the blockchain",
};

export default function Homepage() {
	return (
		<main className="text-white overflow-x-hidden">
			<HeroSection />
			{/* <section className="px-6 md:px-10 max-w-7xl mx-auto py-10">
				<div className="flex items-center justify-center gap-6 opacity-80">
					<img
						src="/assets/homepage/partner-1.png"
						alt="Partner 1"
						width={120}
						height={32}
						loading="lazy"
						sizes="120px"
						style={{ width: "auto", height: "auto" }}
					/>
					<img
						src="/assets/homepage/partner-2.png"
						alt="Partner 2"
						width={120}
						height={32}
						loading="lazy"
						sizes="120px"
						style={{ width: "auto", height: "auto" }}
					/>
					<img
						src="/assets/homepage/partner-3.png"
						alt="Partner 3"
						width={120}
						height={32}
						loading="lazy"
						sizes="120px"
						style={{ width: "auto", height: "auto" }}
					/>
				</div>
			</section> */}
			<Suspense fallback={<div className="h-64 w-full" />}>
				<TrendingCoinsSection />
			</Suspense>
			<Suspense fallback={<div className="h-150 w-full" />}>
				<FeaturesSection />
			</Suspense>
			{/* <Suspense fallback={<div className="h-128 w-full" />}>
				<TestimonialsSection />
			</Suspense> */}
			<Suspense fallback={<div className="h-96 w-full" />}>
				<VideoSection />
			</Suspense>
			<Suspense fallback={<div className="h-150 w-full" />}>
				<RoadmapSection />
			</Suspense>
			<Suspense fallback={<div className="h-128 w-full" />}>
				<FAQSection />
			</Suspense>
			<Suspense fallback={<div className="h-80 w-full" />}>
				<CTASection />
			</Suspense>
			<Suspense fallback={<div className="h-52 w-full" />}>
				<HomepageFooter />
			</Suspense>
		</main>
	);
}
