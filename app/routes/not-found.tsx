import { Link } from "react-router";

export default function NotFound() {
	return (
		<main className="text-white overflow-x-hidden">
			<section className="w-full flex items-center justify-center min-h-screen">
				<div className="max-w-7xl mx-auto px-6 mt-28 md:px-10 py-20">
					<div className="bg-[#0a0a0a] border border-gray-100/10 rounded-xl p-8 md:p-14 flex flex-col items-center text-center">
						<h1 className="text-4xl md:text-6xl font-semibold mb-3 bg-linear-to-b from-white to-gray-200 bg-clip-text text-transparent">
							404
						</h1>
						<h2 className="text-xl md:text-2xl mb-3">Page not found</h2>
						<p className="text-md md:text-lg text-white/80 mb-8 max-w-md">
							We couldn't find the page you're looking for. It may have been moved or deleted, or
							the URL is incorrect.
						</p>
						<Link
							to="/"
							className="inline-flex items-center justify-center rounded-xl border border-white/60 gap-2.5 px-4 md:px-6 py-2 md:py-3 text-white font-bold text-xs md:text-sm bg-linear-to-r from-lime-600 via-lime-700 to-[#004530]"
						>
							Go Home
						</Link>
					</div>
				</div>
			</section>
		</main>
	);
}
