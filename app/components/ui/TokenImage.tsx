import { useState } from "react";

interface TokenImageProps {
	src?: string;
	symbol: string;
	size?: number;
	className?: string;
}

export function TokenImage({
	src,
	symbol,
	size = 32,
	className = "rounded-full",
}: TokenImageProps) {
	const [imageError, setImageError] = useState(false);

	// If no src or image failed to load, show fallback
	if (!src || imageError) {
		return (
			<div
				className={`flex items-center justify-center bg-muted text-muted-foreground font-medium ${className}`}
				style={{
					width: size,
					height: size,
					fontSize: `${size * 0.4}px`,
				}}
			>
				{symbol.slice(0, 2).toUpperCase()}
			</div>
		);
	}

	return (
		<img
			src={src}
			alt={symbol}
			width={size}
			height={size}
			className={className}
			onError={() => setImageError(true)}
		/>
	);
}
