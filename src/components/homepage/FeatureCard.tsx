"use client";
import Image from "next/image";
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
	const [transform, setTransform] = useState("");
	const animationRef = useRef<number>(0);

	useEffect(() => {
		let startTime = Date.now();

		const animate = () => {
			const elapsed = Date.now() - startTime;
			const time = elapsed / 1000; // Convert to seconds

			// Create smooth circular motion
			const rotateX = Math.sin(time * 0.8) * 8; // Slower, smoother tilt
			const rotateY = Math.cos(time * 0.6) * 8; // Different frequency for more natural movement

			setTransform(
				`perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`
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
		<div className="bg-gradient-to-br from-[#0A1A03BA] via-green-[#0A1A03E0] to-[#1C6200]/50 p-6 border border-[#1C6200]/10">
			<div className="flex flex-col items-center text-center">
				<div
					ref={iconRef}
					className="mx-16 my-24 w-48 h-48 md:w-56 md:h-56 lg:w-60 lg:h-60 transition-transform duration-100 ease-out"
					style={{ transform }}
				>
					<Image
						src={iconSrc}
						alt={alt}
						width={192}
						height={192}
						className="w-full h-full object-contain pointer-events-none"
						style={{ transformStyle: "preserve-3d" }}
					/>
				</div>
				<h3 className="text-xl font-bold mb-2 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
					{title}
				</h3>
				<p className="text-white/70 leading-relaxed text-sm">{description}</p>
			</div>
		</div>
	);
};
