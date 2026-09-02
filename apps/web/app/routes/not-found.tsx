import { Footer } from "@app/components/site/Footer";
import { GlowOrb } from "@app/components/site/motion";
import { SiteHeader } from "@app/components/site/SiteHeader";
import { Link } from "react-router";

export default function NotFound() {
	return (
		<main className="overflow-x-hidden bg-black text-white">
			<div className="mx-auto max-w-[var(--shell-max)]">
				<SiteHeader />

				<section className="flex min-h-[70vh] w-full items-center justify-center px-[var(--section-x)] py-[var(--section-y)]">
					<div className="relative w-full max-w-[var(--content-max)]">
						<GlowOrb className="left-1/2 top-0 h-[300px] w-[600px] -translate-x-1/2" />
						<div className="relative z-10 flex flex-col items-center rounded-3xl bg-[var(--surface-3)] p-8 text-center md:p-14">
							<p className="t-eyebrow font-fono text-lime-400">Error 404</p>
							<h1 className="mt-4 t-display font-medium text-white">Page not found.</h1>
							<p className="mt-6 max-w-md t-body-lg text-[var(--ink-2)]">
								We couldn&apos;t find the page you&apos;re looking for. It may have been moved or
								deleted, or the URL is incorrect.
							</p>
							<Link
								to="/"
								className="mt-8 inline-flex items-center justify-center rounded-md bg-lime-500 px-6 py-3 t-body font-semibold text-black transition-colors hover:bg-lime-400"
							>
								Back to markets
							</Link>
						</div>
					</div>
				</section>

				<Footer />
			</div>
		</main>
	);
}
