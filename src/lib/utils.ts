import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

/**
 * Format price with $ and human readable for large values
 */
export function formatPrice(price: number): string {
	if (price >= 1000000000) {
		return `$${(price / 1000000000).toFixed(2)}B`;
	} else if (price >= 1000000) {
		return `$${(price / 1000000).toFixed(2)}M`;
	} else if (price >= 1000) {
		return `$${(price / 1000).toFixed(2)}K`;
	} else if (price >= 1) {
		return `$${price.toFixed(2)}`;
	} else if (price >= 0.01) {
		return `$${price.toFixed(4)}`;
	} else {
		return `$${price.toFixed(6)}`;
	}
}
