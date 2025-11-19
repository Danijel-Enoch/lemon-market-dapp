import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function middleware(_request: NextRequest) {
	const response = NextResponse.next();

	// Content Security Policy
	const cspHeader = `
    default-src 'self';
    script-src 'self' 'unsafe-inline' 'unsafe-eval' https://telegram.org https://*.telegram.org https://www.googletagmanager.com https://www.google-analytics.com;
    style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
    img-src 'self' data: blob: https: http:;
    font-src 'self' data: https://fonts.gstatic.com;
    connect-src 'self' https: wss: ws:;
    frame-src 'self' https://telegram.org https://*.telegram.org;
    frame-ancestors 'none';
    base-uri 'self';
    form-action 'self';
    upgrade-insecure-requests;
    block-all-mixed-content;
    object-src 'none';
    media-src 'self' https:;
    worker-src 'self' blob:;
    manifest-src 'self';
  `
		.replace(/\s{2,}/g, " ")
		.trim();

	// Set CSP header
	response.headers.set("Content-Security-Policy", cspHeader);

	// HSTS (HTTP Strict Transport Security)
	// max-age=31536000 (1 year), includeSubDomains, preload
	response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");

	// X-Frame-Options - Prevent clickjacking
	response.headers.set("X-Frame-Options", "DENY");

	// X-Content-Type-Options - Prevent MIME type sniffing
	response.headers.set("X-Content-Type-Options", "nosniff");

	// X-XSS-Protection - Enable XSS filter (legacy but still useful)
	response.headers.set("X-XSS-Protection", "1; mode=block");

	// Referrer-Policy - Control referrer information
	response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

	// Permissions-Policy - Control browser features
	response.headers.set(
		"Permissions-Policy",
		"camera=(), microphone=(), geolocation=(), interest-cohort=()",
	);

	// X-DNS-Prefetch-Control
	response.headers.set("X-DNS-Prefetch-Control", "on");

	// Remove X-Powered-By header (already done in next.config but extra safety)
	response.headers.delete("X-Powered-By");

	return response;
}

export const config = {
	matcher: [
		/*
		 * Match all request paths except for the ones starting with:
		 * - _next/static (static files)
		 * - _next/image (image optimization files)
		 * - favicon.ico (favicon file)
		 * - public files (public folder)
		 */
		"/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|otf)$).*)",
	],
};
