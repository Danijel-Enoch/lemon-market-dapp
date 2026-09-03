import { useEffect, useRef } from "react";

/**
 * Gooey pointer field.
 *
 * A short chain of blobs follows the cursor, each lerping toward the node ahead
 * of it. They live inside a container carrying an SVG goo filter — a Gaussian
 * blur followed by a colour-matrix alpha threshold — so overlapping blobs fuse
 * into one body and stretch into a liquid tail as the pointer accelerates.
 * Merging only reads if blur, threshold and spacing are tuned together: the
 * blur wide enough for neighbours to bleed into each other, the alpha ramp
 * steep enough to snap the union back to a hard edge.
 *
 * The filtered element is a small box that travels with the pointer, NOT a
 * full-viewport layer. An SVG filter forces the browser to rasterise its entire
 * filter region and re-run the blur every frame the contents move; at viewport
 * size that saturates the main thread and starves every other animation on the
 * page. Keeping the region to STAGE px bounds the cost to a fixed, tiny area.
 */

/** Side length of the filtered box. Also the ceiling on how far the tail spreads. */
const STAGE = 360;
const SIZES = [32, 28, 24, 20, 16, 13, 10];
/** Per-node follow strength. Lower = further behind, which stretches the tail. */
const EASE = [0.32, 0.26, 0.22, 0.19, 0.16, 0.14, 0.12];

export function LiquidCursor() {
	const stageRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const fine = window.matchMedia("(pointer: fine)").matches;
		const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		if (!fine || still) return;

		const node0 = stageRef.current;
		if (node0 === null) return;
		const stage: HTMLDivElement = node0;

		const blobs = Array.from(stage.querySelectorAll<HTMLElement>("[data-blob]"));
		if (blobs.length === 0) return;

		const pointer = { x: -500, y: -500 };
		const nodes = SIZES.map(() => ({ x: -500, y: -500 }));
		const half = STAGE / 2;
		let frame = 0;
		let awake = false;
		let idle = 0;

		function onMove(event: PointerEvent) {
			pointer.x = event.clientX;
			pointer.y = event.clientY;
			idle = 0;
			if (!awake) {
				awake = true;
				stage.style.opacity = "1";
			}
		}

		function onLeave() {
			awake = false;
			stage.style.opacity = "0";
		}

		function tick() {
			let targetX = pointer.x;
			let targetY = pointer.y;

			for (let i = 0; i < nodes.length; i += 1) {
				const node = nodes[i];
				node.x += (targetX - node.x) * EASE[i];
				node.y += (targetY - node.y) * EASE[i];
				// Each blob chases the one ahead of it, which is what makes the
				// chain stretch on fast moves and pool back together at rest.
				targetX = node.x;
				targetY = node.y;
			}

			// The box rides the lead node; blobs are placed relative to it, so the
			// filter only ever has a STAGE-sized region to work on.
			const originX = nodes[0].x - half;
			const originY = nodes[0].y - half;
			stage.style.transform = `translate3d(${originX}px, ${originY}px, 0)`;

			for (let i = 0; i < nodes.length; i += 1) {
				const size = SIZES[i];
				// Clamp into the box so a fast flick frays rather than clipping hard.
				const dx = Math.max(-half + size, Math.min(half - size, nodes[i].x - nodes[0].x));
				const dy = Math.max(-half + size, Math.min(half - size, nodes[i].y - nodes[0].y));
				blobs[i].style.transform =
					`translate3d(${half + dx - size / 2}px, ${half + dy - size / 2}px, 0)`;
			}

			// Once the chain has pooled back under a still cursor there is nothing
			// left to animate, so stop burning frames until the pointer moves again.
			idle += 1;
			const settled =
				Math.hypot(nodes[nodes.length - 1].x - pointer.x, nodes[nodes.length - 1].y - pointer.y) <
				0.5;
			if (settled && idle > 90) {
				frame = 0;
				return;
			}
			frame = requestAnimationFrame(tick);
		}

		function wake(event: PointerEvent) {
			onMove(event);
			if (!frame) frame = requestAnimationFrame(tick);
		}

		window.addEventListener("pointermove", wake, { passive: true });
		document.addEventListener("pointerleave", onLeave);

		return () => {
			if (frame) cancelAnimationFrame(frame);
			window.removeEventListener("pointermove", wake);
			document.removeEventListener("pointerleave", onLeave);
		};
	}, []);

	return (
		<>
			{/* The filter itself never paints; it is only referenced by the stage. */}
			<svg aria-hidden className="pointer-events-none fixed size-0" focusable="false">
				<title>Pointer effect filter</title>
				<defs>
					<filter id="lemon-goo" x="-10%" y="-10%" width="120%" height="120%">
						<feGaussianBlur in="SourceGraphic" stdDeviation="7" result="blur" />
						<feColorMatrix
							in="blur"
							mode="matrix"
							values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -8"
						/>
					</filter>
				</defs>
			</svg>

			<div
				ref={stageRef}
				aria-hidden
				className="pointer-events-none fixed left-0 top-0 z-[70] opacity-0 transition-opacity duration-500"
				style={{
					width: STAGE,
					height: STAGE,
					filter: "url(#lemon-goo)",
					willChange: "transform",
				}}
			>
				{SIZES.map((size, index) => (
					<span
						key={size}
						data-blob
						className="absolute left-0 top-0 rounded-full bg-[var(--pon-lime)]"
						style={{
							width: size,
							height: size,
							// The tail fades so the drip dissolves rather than ending
							// in a hard dot.
							opacity: 0.7 - index * 0.07,
							willChange: "transform",
						}}
					/>
				))}
			</div>
		</>
	);
}
