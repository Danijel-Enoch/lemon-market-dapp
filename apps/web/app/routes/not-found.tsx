import { Brand } from "@lemon/ui";
import { Link } from "react-router";

/**
 * 404.
 *
 * Rendered outside the app shell, so it carries its own minimal chrome — the
 * brand and nothing else. The marketing header and footer this used to use went
 * with the landing page, and reinstating a nav here would advertise
 * destinations that no longer exist.
 */
export default function NotFound() {
	return (
		<main className="overflow-x-hidden bg-[var(--pon-bg)] text-[var(--pon-fg)]">
			<div className="mx-auto max-w-[var(--shell-max)]">
				<header className="px-5 py-6 sm:px-8">
					<Link to="/">
						<Brand size={26} />
					</Link>
				</header>

				<section className="flex min-h-[64vh] w-full items-center justify-center px-5 py-[var(--section-y)] sm:px-8">
					<div className="relative w-full max-w-[var(--content-max)]">
						<div
							aria-hidden
							className="aurora left-1/2 top-0 h-[300px] w-[600px] -translate-x-1/2"
							style={{ ["--aurora" as string]: "rgba(163,230,53,0.16)" }}
						/>

						<div className="relative z-10 overflow-hidden rounded-[var(--pon-r-2xl)] border border-[var(--pon-line)] bg-gradient-to-b from-[var(--pon-bg-2)] to-[var(--pon-bg)] p-8 text-center md:p-14">
							<div aria-hidden className="pon-bloom-lg" />

							<div className="relative flex flex-col items-center">
								<p className="t-eyebrow text-[var(--pon-lime)]">Error 404</p>
								<h1 className="font-display mt-4 text-[clamp(36px,6vw,64px)] font-bold leading-[1.05] tracking-[-0.02em] text-[var(--pon-fg-0)]">
									Page not found.
								</h1>
								<p className="mt-5 max-w-md text-[17px] leading-relaxed text-[var(--pon-fg-2)]">
									We couldn&apos;t find the page you&apos;re looking for. It may have been moved or
									deleted, or the URL is incorrect.
								</p>
								<Link
									to="/"
									className="mt-8 inline-flex items-center justify-center rounded-full bg-[var(--pon-lime)] px-7 py-3.5 text-[15px] font-semibold text-[var(--pon-on-lime)] transition-colors hover:bg-[var(--pon-lime-2)]"
								>
									Back to markets
								</Link>
							</div>
						</div>
					</div>
				</section>
			</div>
		</main>
	);
}
