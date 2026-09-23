import { Brand } from "@lemon/ui";
import { data, Link } from "react-router";

/**
 * 404.
 *
 * Rendered outside the app shell, so it carries its own minimal chrome — the
 * brand and nothing else. The marketing header and footer this used to use went
 * with the landing page, and reinstating a nav here would advertise
 * destinations that no longer exist.
 */

/**
 * The status, not just the page.
 *
 * Rendering a 404 body with a 200 status tells every crawler and uptime check
 * that the URL is fine, which is how a broken link ends up indexed and how a
 * monitor stays green through a routing mistake. `data()` sets the status while
 * still rendering the component, which throwing a Response would not.
 */
export function loader() {
	return data(null, { status: 404 });
}
export default function NotFound() {
	return (
		<main className="relative min-h-screen overflow-x-hidden bg-[var(--pon-bg)] text-[var(--pon-fg)]">
			{/* The same ruled sheet the app runs on, with nothing printed on it. */}
			<div aria-hidden className="firm-rules" />

			<div className="relative z-10 mx-auto max-w-[var(--rule-max)] px-5 md:px-8">
				<header className="border-b border-[var(--pon-line-2)] py-3">
					<Brand size={26} />
				</header>

				<section className="flex min-h-[64vh] w-full flex-col justify-center py-[var(--section-y)]">
					<p className="firm-label text-[var(--pon-fg-2)]">Error 404 · Not found</p>
					<h1 className="t-display mt-5 text-[var(--pon-fg-0)]">
						Page
						<br />
						not found.
					</h1>

					<div className="mt-8 border-t border-[var(--pon-line)] pt-6">
						<p className="t-body max-w-[52ch] text-[var(--pon-fg-2)]">
							We couldn&apos;t find the page you&apos;re looking for. It may have been moved or
							deleted, or the URL is incorrect.
						</p>
						<Link
							to="/"
							className="mt-7 inline-flex items-center justify-center rounded-[var(--pon-r-lg)] border border-[var(--pon-ink)] bg-[var(--pon-ink)] px-5 py-3 font-mono text-[13px] tracking-[-0.02em] text-[var(--pon-on-lime)] transition-colors hover:bg-[var(--pon-lime-2)]"
						>
							Back to markets →
						</Link>
					</div>
				</section>
			</div>
		</main>
	);
}
