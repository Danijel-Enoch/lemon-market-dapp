"use client";

export function Header() {
	return (
		<div className="flex items-center w-[1430px] h-[69px]">
			<div
				className="flex relative flex-grow items-start"
				style={{ padding: "8px 5px 1px 22px" }}
			>
				{/* Logo */}
				<div
					className="flex items-center w-[80px] h-[27px] text-[#41c6b2] font-bold text-[23px] leading-none"
					style={{ margin: "10px 0px 0px" }}
				>
					contan
				</div>

				{/* Logo Image */}
				<div
					className="w-[29px] h-[23px] bg-gray-600"
					style={{ marginTop: "16px", marginLeft: "2px" }}
				></div>

				{/* Advanced */}
				<div
					className="flex items-center w-[68px] h-[17px] text-[#bbbdc0] font-bold text-[13px]"
					style={{ margin: "15px 0px 0px 39px" }}
				>
					Advanced
				</div>

				{/* New Badge */}
				<div
					className="flex absolute items-center bg-transparent w-[34px] h-[20px]"
					style={{ right: "712px", bottom: "36px", padding: "2px 1px 1px" }}
				>
					<div
						className="flex flex-grow items-start border border-[#077175] rounded-md bg-[#09222b]"
						style={{ padding: "1px 4px 3px 5px" }}
					>
						<div className="flex items-center justify-center w-[21px] h-[11px] text-[#198680] font-light text-[8px]">
							New
						</div>
					</div>
				</div>

				{/* Simplified */}
				<div
					className="flex items-start bg-transparent"
					style={{
						marginTop: "2px",
						marginLeft: "15px",
						padding: "13px 18px 28px 23px",
					}}
				>
					<div className="flex items-center w-[65px] h-[18px] text-[#797b81] font-bold text-[13px]">
						Simplified
					</div>
				</div>

				{/* Staking */}
				<div
					className="flex items-center w-[50px] h-[19px] text-[#808287] font-bold text-[13px]"
					style={{ margin: "15px 0px 0px 20px" }}
				>
					Staking
				</div>

				{/* oTango */}
				<div
					className="flex items-center w-[49px] h-[19px] text-[#7d7f84] font-bold text-[13px]"
					style={{ margin: "15px 0px 0px 38px" }}
				>
					oTango
				</div>

				{/* Profile */}
				<div
					className="flex items-center w-[42px] h-[17px] text-[#7b7d82] font-bold text-[13px]"
					style={{ margin: "14px 0px 0px 38px" }}
				>
					Profile
				</div>

				{/* Airdrop */}
				<div
					className="flex items-center z-10 w-[50px] h-[19px] text-[#7e8085] font-bold text-[13px]"
					style={{ margin: "14px 0px 0px 37px" }}
				>
					Airdrop
				</div>

				{/* Resources */}
				<div
					className="flex items-center w-[59px] h-[15px] text-[#6f7377] font-bold text-[10px]"
					style={{ margin: "16px 0px 0px 456px" }}
				>
					Resources
				</div>

				{/* Fee Profile */}
				<div
					className="w-[75px] text-[#85888c] text-[12px]"
					style={{ margin: "9px 0px 0px 15px", lineHeight: "15px" }}
				>
					Fee Profile
					<br />
					25 bps/5 bps
				</div>

				{/* Connect Wallet Button */}
				<div
					className="flex items-center bg-transparent"
					style={{ marginLeft: "4px", padding: "4px 3px 3px 4px" }}
				>
					<div
						className="flex flex-grow items-center border border-[#272a3b] bg-[#0a0b17]"
						style={{
							borderRadius: "6px 0px 0px 3px",
							padding: "10px 10px 11px 11px",
						}}
					>
						<div className="flex items-center w-[101px] h-[17px] text-[#b9b9bc] font-bold text-[13px]">
							Connect Wallet
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
