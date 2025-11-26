import nextDynamic from "next/dynamic";
import { Suspense } from "react";
import { HeroSection } from "@/components/homepage/HeroSection";

// Force dynamic rendering
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Dynamically import heavy components to reduce initial bundle size
const TrendingCoinsSection = nextDynamic(
	() =>
		import("@/components/homepage/TrendingCoinsSection").then((mod) => ({
			default: mod.TrendingCoinsSection,
		})),
	{
		loading: () => <div className="h-64 w-full" />,
		ssr: true,
	},
);

const FeaturesSection = nextDynamic(
	() =>
		import("@/components/homepage/FeaturesSection").then((mod) => ({
			default: mod.FeaturesSection,
		})),
	{
		loading: () => <div className="h-150 w-full" />,
		ssr: true,
	},
);

// const TestimonialsSection = nextDynamic(
// 	() =>
// 		import("@/components/homepage/TestimonialsSection").then((mod) => ({
// 			default: mod.TestimonialsSection,
// 		})),
// 	{
// 		loading: () => <div className="h-128 w-full" />,
// 		ssr: true,
// 	},
// );

const VideoSection = nextDynamic(
	() => import("@/components/homepage/VideoSection").then((mod) => ({ default: mod.VideoSection })),
	{
		loading: () => <div className="h-96 w-full" />,
	},
);

const RoadmapSection = nextDynamic(
	() =>
		import("@/components/homepage/RoadmapSection").then((mod) => ({ default: mod.RoadmapSection })),
	{
		loading: () => <div className="h-150 w-full" />,
		ssr: true,
	},
);

const FAQSection = nextDynamic(
	() => import("@/components/homepage/FAQSection").then((mod) => ({ default: mod.FAQSection })),
	{
		loading: () => <div className="h-128 w-full" />,
		ssr: true,
	},
);

const CTASection = nextDynamic(
	() => import("@/components/homepage/CTASection").then((mod) => ({ default: mod.CTASection })),
	{
		loading: () => <div className="h-80 w-full" />,
		ssr: true,
	},
);

const HomepageFooter = nextDynamic(
	() =>
		import("@/components/homepage/HomepageFooter").then((mod) => ({ default: mod.HomepageFooter })),
	{
		loading: () => <div className="h-52 w-full" />,
		ssr: true,
	},
);

export default function Homepage() {
	return (
		<main className="text-white overflow-x-hidden">
			<HeroSection />
			{/* <section className="px-6 md:px-10 max-w-7xl mx-auto py-10">
				<div className="flex items-center justify-center gap-6 opacity-80">
					<Image
						src="/assets/homepage/partner-1.png"
						alt="Partner 1"
						width={120}
						height={32}
						loading="lazy"
						sizes="120px"
						style={{ width: "auto", height: "auto" }}
					/>
					<Image
						src="/assets/homepage/partner-2.png"
						alt="Partner 2"
						width={120}
						height={32}
						loading="lazy"
						sizes="120px"
						style={{ width: "auto", height: "auto" }}
					/>
					<Image
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
