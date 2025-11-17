import Image from "next/image";
import type { FC } from "react";
import { cn } from "@/lib/utils";

type Pill = {
  icon: string;
  title: string;
  price?: string;
  change?: string;
  changeColor?: "red" | "green" | "gray";
  width?: number;
  largeIcon?: boolean;
};

const basePill = "flex shrink-0 items-start justify-between border-2 border-[#686868] rounded-2xl bg-[#0a0a0a] overflow-hidden backdrop-blur-md";

const Title = ({ children }: { children: string }) => (
  <p className="text-[15px] leading-[18px] font-semibold text-white">{children}</p>
);

const Sub = ({ children, color = "#dedede" }: { children: string; color?: string }) => (
  <p className={cn("text-[13px] leading-[16px] font-semibold", `text-[${color}]`)}>{children}</p>
);

const Change = ({ value, color }: { value: string; color?: Pill["changeColor"] }) => {
  const map: Record<string, string> = {
    red: "text-[#ff4c4c]",
    green: "text-[#4dad31]",
    gray: "text-[#dedede]",
  };
  return <p className={cn("text-[13px] leading-[16px] font-semibold", color ? map[color] : "text-[#dedede]")}>{value}</p>;
};

const PillItem: FC<Pill> = ({ icon, title, price, change, changeColor = "gray", width, largeIcon }) => {
  return (
    <div
      className={cn(basePill, largeIcon ? "px-3 py-2" : "px-3.5 py-2")}
      style={{
        width: width ? `${width}px` : undefined,
        minWidth: width ? `${width}px` : undefined,
      }}
    >
      <Image
        src={icon}
        alt={title}
        width={largeIcon ? 44 : 40}
        height={largeIcon ? 44 : 40}
        className={cn(largeIcon ? "rounded-full w-[44px] h-[44px]" : "rounded-full w-[40px] h-[40px]")}
      />
      <div className="flex flex-col items-start self-stretch ml-2">
        <Title>{title}</Title>
        <div className="flex items-center justify-between self-stretch mt-1">
          {price ? <Sub>{price}</Sub> : null}
          {change ? <Change value={change} color={changeColor} /> : null}
        </div>
      </div>
    </div>
  );
};

export const TrendingCoinsSection: FC = () => {
  const top: Pill[] = [
    { icon: "/assets/trending-coins/leo-1.png", title: "LEO Token", price: "9.55$", change: "-0.16%", changeColor: "red", width: 153 },
    { icon: "/assets/trending-coins/leo-2.png", title: "LEO Token", price: "9.55$", change: "-0.16%", changeColor: "red", width: 153 },
    { icon: "/assets/trending-coins/sui.png", title: "Sui", price: "2.38$", change: "0.72%", changeColor: "green" },
    { icon: "/assets/trending-coins/weth.png", title: "WETH", price: "3894.91$", change: "1.15%", changeColor: "green", largeIcon: true },
    { icon: "/assets/trending-coins/hedera.png", title: "Hedera", price: "0.200515$", change: "3.11%", changeColor: "green" },
    { icon: "/assets/trending-coins/avalanche.png", title: "Avalanche", price: "0.200515$", change: "3.11%", changeColor: "green", width: 170, largeIcon: true },
  ];

  const bottom: Pill[] = [
    { icon: "/assets/trending-coins/bsol-1.png", title: "Binance Staked SOL", price: "201.24$", change: "-0.54%", changeColor: "red", width: 216 },
    { icon: "/assets/trending-coins/trump.png", title: "Official Trump", price: "7.92$", change: "-1.62%", changeColor: "red", width: 170, largeIcon: true },
    { icon: "/assets/trending-coins/algorand-1.png", title: "Algorand", price: "0.178258$", change: "0.54%", changeColor: "green", largeIcon: true },
    { icon: "/assets/trending-coins/pumpfun.png", title: "Pump.fun", price: "0.00451508$", change: "3.32%", changeColor: "green" },
    { icon: "/assets/trending-coins/algorand-2.png", title: "Algorand", price: "0.178258$", change: "0.54%", changeColor: "green", largeIcon: true },
    { icon: "/assets/trending-coins/bsol-2.png", title: "Binance Staked SOL", price: "201.24$", change: "-0.54%", changeColor: "red" },
  ];

  return (
    <section className="relative w-full">
      <div className="relative mx-auto max-w-[1248px] h-[273px] flex flex-col items-start justify-center">
        <div className="absolute inset-y-0 left-0 w-[351px] h-[273px] bg-[linear-gradient(90deg,#000_0%,#000000eb_100%)] blur-[20px]" />
        <div className="absolute inset-y-0 right-0 w-[352px] h-[273px] rotate-180 bg-[linear-gradient(90deg,#000_0%,#000000eb_100%)] blur-[20px]" />

        <div className="inline-flex items-center gap-5 ml-[152px] mr-[34px]">
          {top.map((p, i) => (
            <PillItem key={`top-${i}`} {...p} />
          ))}
        </div>

        <div className="inline-flex items-center gap-5 mt-5">
          {bottom.map((p, i) => (
            <PillItem key={`bottom-${i}`} {...p} />
          ))}
        </div>
      </div>
    </section>
  );
};
