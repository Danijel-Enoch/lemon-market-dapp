import Image from "next/image";
import type { FC } from "react";

export type FeatureCardProps = {
  title: string;
  description: string;
  iconSrc: string;
  alt: string;
};

export const FeatureCard: FC<FeatureCardProps> = ({ title, description, iconSrc, alt }) => {
  return (
    <div className="bg-gradient-to-br from-[#0A1A03BA] via-green-[#0A1A03E0] to-[#1C6200]/50 p-6 border border-[#1C6200]/10">
      <div className="flex flex-col items-center text-center">
        <Image src={iconSrc} alt={alt} width={192} height={192} className="mx-16 my-24 w-48 h-48 md:w-56 md:h-56 lg:w-60 lg:h-60 object-contain" />
        <h3 className="text-xl font-bold mb-2 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
          {title}
        </h3>
        <p className="text-white/70 leading-relaxed text-sm">
          {description}
        </p>
      </div>
    </div>
  );
};