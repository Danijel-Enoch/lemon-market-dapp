"use client";
import type { FC } from "react";
import { useEffect, useRef, useState } from "react";

export type FeatureCardProps = {
	title: string;
	description: string;
	iconSrc: string;
	alt: string;
};

export const FeatureCard: FC<FeatureCardProps> = ({ title, description, iconSrc, alt }) => {
	const iconRef = useRef<HTMLDivElement>(null);
	const [shadow, setShadow] = useState("");
	const animationRef = useRef<number>(0);

	useEffect(() => {
		const startTime = Date.now();

		const animate = () => {
			const elapsed = Date.now() - startTime;
			const time = elapsed / 1000; // Convert to seconds

			// Create smooth circular motion - faster speed
			const rotateX = Math.sin(time * 2) * 8; // Faster tilt
			const rotateY = Math.cos(time * 1.5) * 8; // Faster movement

			// Calculate shadow offset based on rotation (opposite direction for realism)
			const shadowX = rotateY * 0.3; // Much slower shadow movement
			const shadowY = -rotateX * 0.3; // Much slower shadow movement
			const shadowBlur = 25 + Math.abs(rotateX) + Math.abs(rotateY); // Dynamic blur

			setShadow(
				`drop-shadow(${shadowX}px ${shadowY}px ${shadowBlur}px rgba(157, 234, 41, 0.6)) drop-shadow(${shadowX * 0.5}px ${shadowY * 0.5}px ${shadowBlur * 0.5}px rgba(157, 234, 41, 0.4)) drop-shadow(0px 10px 30px rgba(0, 0, 0, 0.5))`,
			);

			animationRef.current = requestAnimationFrame(animate);
		};

		animationRef.current = requestAnimationFrame(animate);

		return () => {
			if (animationRef.current) {
				cancelAnimationFrame(animationRef.current);
			}
		};
	}, []);

	return (
		<div className="bg-linear-to-br from-[#0A1A03BA] via-green-[#0A1A03E0] to-[#1C6200]/50 p-6 border border-[#1C6200]/10">
			<div className="flex flex-col items-center text-center">
				<div
					ref={iconRef}
					className="mx-16 my-24 w-48 h-48 md:w-56 md:h-56 lg:w-60 lg:h-60 transition-all duration-100 ease-out"
					style={{
						transform: "perspective(1000px) scale3d(1.02, 1.02, 1.02)",
						filter: shadow,
					}}
				>
					<img
						src={iconSrc}
						alt={alt}
						width={192}
						height={192}
						loading="lazy"
						sizes="(max-width: 768px) 192px, (max-width: 1024px) 224px, 240px"
						className="w-full h-full object-contain pointer-events-none"
						style={{ transformStyle: "preserve-3d" }}
					/>
				</div>
				<h3 className="text-xl font-bold mb-2 bg-linear-to-r from-white to-gray-300 bg-clip-text text-transparent">
					{title}
				</h3>
				<p className="text-white/70 leading-relaxed text-sm">{description}</p>
			</div>
		</div>
	);
};
