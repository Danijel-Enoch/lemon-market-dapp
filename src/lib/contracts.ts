const usdc = "0x109DAeF13DcA732B32B19b32f45A46E29d320C44" as `0x${string}`;
const SyntheticPerpetualContract =
	"0xe9Cf759F88b5870cd7EdA3c0Fb11526BA963D8E5" as `0x${string}`;

// ERC20 ABI for USDC token interactions
const ERC20Abi = [
	{
		constant: true,
		inputs: [{ name: "_owner", type: "address" }],
		name: "balanceOf",
		outputs: [{ name: "balance", type: "uint256" }],
		type: "function"
	},
	{
		constant: false,
		inputs: [
			{ name: "_spender", type: "address" },
			{ name: "_value", type: "uint256" }
		],
		name: "approve",
		outputs: [{ name: "", type: "bool" }],
		type: "function"
	},
	{
		constant: true,
		inputs: [
			{ name: "_owner", type: "address" },
			{ name: "_spender", type: "address" }
		],
		name: "allowance",
		outputs: [{ name: "", type: "uint256" }],
		type: "function"
	},
	{
		constant: true,
		inputs: [],
		name: "decimals",
		outputs: [{ name: "", type: "uint8" }],
		type: "function"
	},
	{
		constant: true,
		inputs: [],
		name: "symbol",
		outputs: [{ name: "", type: "string" }],
		type: "function"
	}
] as const;

const SyntheticAbi = [
	{
		inputs: [
			{
				internalType: "address",
				name: "_collateralToken",
				type: "address"
			},
			{
				internalType: "address",
				name: "_adminSigner",
				type: "address"
			},
			{
				internalType: "uint256",
				name: "_initialLiquidity",
				type: "uint256"
			}
		],
		stateMutability: "nonpayable",
		type: "constructor"
	},
	{
		inputs: [],
		name: "ECDSAInvalidSignature",
		type: "error"
	},
	{
		inputs: [
			{
				internalType: "uint256",
				name: "length",
				type: "uint256"
			}
		],
		name: "ECDSAInvalidSignatureLength",
		type: "error"
	},
	{
		inputs: [
			{
				internalType: "bytes32",
				name: "s",
				type: "bytes32"
			}
		],
		name: "ECDSAInvalidSignatureS",
		type: "error"
	},
	{
		inputs: [],
		name: "EnforcedPause",
		type: "error"
	},
	{
		inputs: [],
		name: "ExpectedPause",
		type: "error"
	},
	{
		inputs: [
			{
				internalType: "address",
				name: "owner",
				type: "address"
			}
		],
		name: "OwnableInvalidOwner",
		type: "error"
	},
	{
		inputs: [
			{
				internalType: "address",
				name: "account",
				type: "address"
			}
		],
		name: "OwnableUnauthorizedAccount",
		type: "error"
	},
	{
		inputs: [],
		name: "ReentrancyGuardReentrantCall",
		type: "error"
	},
	{
		inputs: [
			{
				internalType: "address",
				name: "token",
				type: "address"
			}
		],
		name: "SafeERC20FailedOperation",
		type: "error"
	},
	{
		anonymous: false,
		inputs: [
			{
				indexed: true,
				internalType: "address",
				name: "token",
				type: "address"
			},
			{
				indexed: true,
				internalType: "address",
				name: "to",
				type: "address"
			},
			{
				indexed: false,
				internalType: "uint256",
				name: "amount",
				type: "uint256"
			}
		],
		name: "EmergencyWithdraw",
		type: "event"
	},
	{
		anonymous: false,
		inputs: [
			{
				indexed: true,
				internalType: "address",
				name: "trader",
				type: "address"
			},
			{
				indexed: true,
				internalType: "uint256",
				name: "positionId",
				type: "uint256"
			},
			{
				indexed: false,
				internalType: "uint256",
				name: "feeAmount",
				type: "uint256"
			},
			{
				indexed: false,
				internalType: "string",
				name: "feeType",
				type: "string"
			}
		],
		name: "FeeCollected",
		type: "event"
	},
	{
		anonymous: false,
		inputs: [
			{
				indexed: true,
				internalType: "address",
				name: "treasury",
				type: "address"
			},
			{
				indexed: false,
				internalType: "uint256",
				name: "amount",
				type: "uint256"
			},
			{
				indexed: false,
				internalType: "uint256",
				name: "timestamp",
				type: "uint256"
			}
		],
		name: "FeesWithdrawn",
		type: "event"
	},
	{
		anonymous: false,
		inputs: [
			{
				indexed: false,
				internalType: "uint256",
				name: "newMinLeverage",
				type: "uint256"
			},
			{
				indexed: false,
				internalType: "uint256",
				name: "newMaxLeverage",
				type: "uint256"
			},
			{
				indexed: false,
				internalType: "uint256",
				name: "timestamp",
				type: "uint256"
			}
		],
		name: "LeverageLimitsUpdated",
		type: "event"
	},
	{
		anonymous: false,
		inputs: [
			{
				indexed: false,
				internalType: "uint256",
				name: "amount",
				type: "uint256"
			},
			{
				indexed: false,
				internalType: "uint256",
				name: "timestamp",
				type: "uint256"
			}
		],
		name: "LiquidityAdded",
		type: "event"
	},
	{
		anonymous: false,
		inputs: [
			{
				indexed: true,
				internalType: "string",
				name: "marketId",
				type: "string"
			},
			{
				indexed: false,
				internalType: "uint256",
				name: "amount",
				type: "uint256"
			},
			{
				indexed: false,
				internalType: "uint256",
				name: "totalAllocatedLiquidity",
				type: "uint256"
			},
			{
				indexed: false,
				internalType: "uint256",
				name: "timestamp",
				type: "uint256"
			}
		],
		name: "LiquidityAllocated",
		type: "event"
	},
	{
		anonymous: false,
		inputs: [
			{
				indexed: true,
				internalType: "string",
				name: "marketId",
				type: "string"
			},
			{
				indexed: false,
				internalType: "uint256",
				name: "amount",
				type: "uint256"
			},
			{
				indexed: false,
				internalType: "uint256",
				name: "totalAllocatedLiquidity",
				type: "uint256"
			},
			{
				indexed: false,
				internalType: "uint256",
				name: "timestamp",
				type: "uint256"
			}
		],
		name: "LiquidityDeallocated",
		type: "event"
	},
	{
		anonymous: false,
		inputs: [
			{
				indexed: true,
				internalType: "string",
				name: "fromMarket",
				type: "string"
			},
			{
				indexed: true,
				internalType: "string",
				name: "toMarket",
				type: "string"
			},
			{
				indexed: false,
				internalType: "uint256",
				name: "amount",
				type: "uint256"
			},
			{
				indexed: false,
				internalType: "uint256",
				name: "timestamp",
				type: "uint256"
			}
		],
		name: "LiquidityMovedBetweenMarkets",
		type: "event"
	},
	{
		anonymous: false,
		inputs: [
			{
				indexed: false,
				internalType: "uint256",
				name: "newMinMargin",
				type: "uint256"
			},
			{
				indexed: false,
				internalType: "uint256",
				name: "newMaxMargin",
				type: "uint256"
			},
			{
				indexed: false,
				internalType: "uint256",
				name: "timestamp",
				type: "uint256"
			}
		],
		name: "MarginLimitsUpdated",
		type: "event"
	},
	{
		anonymous: false,
		inputs: [
			{
				indexed: true,
				internalType: "address",
				name: "trader",
				type: "address"
			},
			{
				indexed: true,
				internalType: "uint256",
				name: "positionId",
				type: "uint256"
			},
			{
				indexed: false,
				internalType: "uint256",
				name: "marginReturned",
				type: "uint256"
			},
			{
				indexed: false,
				internalType: "string",
				name: "reason",
				type: "string"
			},
			{
				indexed: false,
				internalType: "uint256",
				name: "timestamp",
				type: "uint256"
			}
		],
		name: "MarginReturned",
		type: "event"
	},
	{
		anonymous: false,
		inputs: [
			{
				indexed: true,
				internalType: "address",
				name: "previousOwner",
				type: "address"
			},
			{
				indexed: true,
				internalType: "address",
				name: "newOwner",
				type: "address"
			}
		],
		name: "OwnershipTransferred",
		type: "event"
	},
	{
		anonymous: false,
		inputs: [
			{
				indexed: false,
				internalType: "address",
				name: "account",
				type: "address"
			}
		],
		name: "Paused",
		type: "event"
	},
	{
		anonymous: false,
		inputs: [
			{
				indexed: true,
				internalType: "address",
				name: "trader",
				type: "address"
			},
			{
				indexed: true,
				internalType: "uint256",
				name: "positionId",
				type: "uint256"
			},
			{
				indexed: false,
				internalType: "int256",
				name: "pnl",
				type: "int256"
			}
		],
		name: "PnlUpdated",
		type: "event"
	},
	{
		anonymous: false,
		inputs: [
			{
				indexed: true,
				internalType: "address",
				name: "trader",
				type: "address"
			},
			{
				indexed: true,
				internalType: "uint256",
				name: "positionId",
				type: "uint256"
			},
			{
				indexed: false,
				internalType: "uint256",
				name: "exitPrice",
				type: "uint256"
			},
			{
				indexed: false,
				internalType: "int256",
				name: "pnl",
				type: "int256"
			},
			{
				indexed: false,
				internalType: "uint256",
				name: "timestamp",
				type: "uint256"
			}
		],
		name: "PositionClosed",
		type: "event"
	},
	{
		anonymous: false,
		inputs: [
			{
				indexed: true,
				internalType: "address",
				name: "trader",
				type: "address"
			},
			{
				indexed: true,
				internalType: "uint256",
				name: "positionId",
				type: "uint256"
			},
			{
				indexed: false,
				internalType: "uint256",
				name: "liquidationPrice",
				type: "uint256"
			},
			{
				indexed: false,
				internalType: "uint256",
				name: "timestamp",
				type: "uint256"
			}
		],
		name: "PositionLiquidated",
		type: "event"
	},
	{
		anonymous: false,
		inputs: [
			{
				indexed: true,
				internalType: "address",
				name: "trader",
				type: "address"
			},
			{
				indexed: true,
				internalType: "uint256",
				name: "positionId",
				type: "uint256"
			},
			{
				indexed: false,
				internalType: "uint256",
				name: "newMargin",
				type: "uint256"
			},
			{
				indexed: false,
				internalType: "uint256",
				name: "newLeverage",
				type: "uint256"
			},
			{
				indexed: false,
				internalType: "uint256",
				name: "timestamp",
				type: "uint256"
			}
		],
		name: "PositionModified",
		type: "event"
	},
	{
		anonymous: false,
		inputs: [
			{
				indexed: true,
				internalType: "address",
				name: "trader",
				type: "address"
			},
			{
				indexed: true,
				internalType: "uint256",
				name: "positionId",
				type: "uint256"
			},
			{
				indexed: false,
				internalType: "string",
				name: "tokenSymbol",
				type: "string"
			},
			{
				indexed: false,
				internalType: "bool",
				name: "isLong",
				type: "bool"
			},
			{
				indexed: false,
				internalType: "uint256",
				name: "margin",
				type: "uint256"
			},
			{
				indexed: false,
				internalType: "uint256",
				name: "leverage",
				type: "uint256"
			},
			{
				indexed: false,
				internalType: "uint256",
				name: "entryPrice",
				type: "uint256"
			},
			{
				indexed: false,
				internalType: "uint256",
				name: "timestamp",
				type: "uint256"
			}
		],
		name: "PositionOpened",
		type: "event"
	},
	{
		anonymous: false,
		inputs: [
			{
				indexed: true,
				internalType: "address",
				name: "liquidated",
				type: "address"
			},
			{
				indexed: true,
				internalType: "uint256",
				name: "positionId",
				type: "uint256"
			},
			{
				indexed: false,
				internalType: "uint256",
				name: "marginDistributed",
				type: "uint256"
			},
			{
				indexed: false,
				internalType: "bool",
				name: "distributedToOpposing",
				type: "bool"
			},
			{
				indexed: false,
				internalType: "uint256",
				name: "timestamp",
				type: "uint256"
			}
		],
		name: "PvPLiquidation",
		type: "event"
	},
	{
		anonymous: false,
		inputs: [
			{
				indexed: true,
				internalType: "address",
				name: "winner",
				type: "address"
			},
			{
				indexed: true,
				internalType: "uint256",
				name: "positionId",
				type: "uint256"
			},
			{
				indexed: false,
				internalType: "uint256",
				name: "profitFromOpposing",
				type: "uint256"
			},
			{
				indexed: false,
				internalType: "uint256",
				name: "profitFromMarket",
				type: "uint256"
			},
			{
				indexed: false,
				internalType: "uint256",
				name: "timestamp",
				type: "uint256"
			}
		],
		name: "PvPPayout",
		type: "event"
	},
	{
		anonymous: false,
		inputs: [
			{
				indexed: true,
				internalType: "address",
				name: "oldTreasury",
				type: "address"
			},
			{
				indexed: true,
				internalType: "address",
				name: "newTreasury",
				type: "address"
			},
			{
				indexed: false,
				internalType: "uint256",
				name: "timestamp",
				type: "uint256"
			}
		],
		name: "TreasuryWalletUpdated",
		type: "event"
	},
	{
		anonymous: false,
		inputs: [
			{
				indexed: false,
				internalType: "address",
				name: "account",
				type: "address"
			}
		],
		name: "Unpaused",
		type: "event"
	},
	{
		anonymous: false,
		inputs: [
			{
				indexed: true,
				internalType: "string",
				name: "marketId",
				type: "string"
			},
			{
				indexed: false,
				internalType: "uint256",
				name: "initialVirtualFunding",
				type: "uint256"
			},
			{
				indexed: false,
				internalType: "uint256",
				name: "timestamp",
				type: "uint256"
			}
		],
		name: "VirtualMarketCreated",
		type: "event"
	},
	{
		anonymous: false,
		inputs: [
			{
				indexed: true,
				internalType: "string",
				name: "marketId",
				type: "string"
			},
			{
				indexed: false,
				internalType: "uint256",
				name: "oldFeeRate",
				type: "uint256"
			},
			{
				indexed: false,
				internalType: "uint256",
				name: "newFeeRate",
				type: "uint256"
			},
			{
				indexed: false,
				internalType: "uint256",
				name: "timestamp",
				type: "uint256"
			}
		],
		name: "VirtualMarketDurationFeeUpdated",
		type: "event"
	},
	{
		anonymous: false,
		inputs: [
			{
				indexed: false,
				internalType: "uint256",
				name: "oldRate",
				type: "uint256"
			},
			{
				indexed: false,
				internalType: "uint256",
				name: "newRate",
				type: "uint256"
			},
			{
				indexed: false,
				internalType: "uint256",
				name: "timestamp",
				type: "uint256"
			}
		],
		name: "VirtualMarketProfitRateUpdated",
		type: "event"
	},
	{
		inputs: [],
		name: "BASIS_POINTS",
		outputs: [
			{
				internalType: "uint256",
				name: "",
				type: "uint256"
			}
		],
		stateMutability: "view",
		type: "function"
	},
	{
		inputs: [],
		name: "CLOSING_FEE_RATE",
		outputs: [
			{
				internalType: "uint256",
				name: "",
				type: "uint256"
			}
		],
		stateMutability: "view",
		type: "function"
	},
	{
		inputs: [],
		name: "DEFAULT_DURATION_FEE_RATE",
		outputs: [
			{
				internalType: "uint256",
				name: "",
				type: "uint256"
			}
		],
		stateMutability: "view",
		type: "function"
	},
	{
		inputs: [],
		name: "LIQUIDATION_THRESHOLD",
		outputs: [
			{
				internalType: "uint256",
				name: "",
				type: "uint256"
			}
		],
		stateMutability: "view",
		type: "function"
	},
	{
		inputs: [],
		name: "MAX_PROFIT_RATE",
		outputs: [
			{
				internalType: "uint256",
				name: "",
				type: "uint256"
			}
		],
		stateMutability: "view",
		type: "function"
	},
	{
		inputs: [],
		name: "OPENING_FEE_RATE",
		outputs: [
			{
				internalType: "uint256",
				name: "",
				type: "uint256"
			}
		],
		stateMutability: "view",
		type: "function"
	},
	{
		inputs: [
			{
				internalType: "uint256",
				name: "amount",
				type: "uint256"
			}
		],
		name: "addLiquidity",
		outputs: [],
		stateMutability: "nonpayable",
		type: "function"
	},
	{
		inputs: [],
		name: "adminSigner",
		outputs: [
			{
				internalType: "address",
				name: "",
				type: "address"
			}
		],
		stateMutability: "view",
		type: "function"
	},
	{
		inputs: [
			{
				components: [
					{
						internalType: "string",
						name: "marketId",
						type: "string"
					},
					{
						internalType: "uint256",
						name: "amount",
						type: "uint256"
					},
					{
						internalType: "uint256",
						name: "timestamp",
						type: "uint256"
					},
					{
						internalType: "uint256",
						name: "nonce",
						type: "uint256"
					},
					{
						internalType: "address",
						name: "operator",
						type: "address"
					}
				],
				internalType:
					"struct SyntheticPerpetualWithVmarkets.LiquidityOperationData",
				name: "liquidityData",
				type: "tuple"
			},
			{
				internalType: "bytes",
				name: "signature",
				type: "bytes"
			}
		],
		name: "allocateVirtualMarketLiquidity",
		outputs: [],
		stateMutability: "nonpayable",
		type: "function"
	},
	{
		inputs: [
			{
				internalType: "string",
				name: "marketId",
				type: "string"
			},
			{
				internalType: "bool",
				name: "isLong",
				type: "bool"
			}
		],
		name: "checkPvPBalance",
		outputs: [
			{
				internalType: "bool",
				name: "isProfitable",
				type: "bool"
			},
			{
				internalType: "uint256",
				name: "opposingMargin",
				type: "uint256"
			},
			{
				internalType: "uint256",
				name: "sameDirectionMargin",
				type: "uint256"
			}
		],
		stateMutability: "view",
		type: "function"
	},
	{
		inputs: [
			{
				internalType: "uint256",
				name: "positionId",
				type: "uint256"
			},
			{
				components: [
					{
						internalType: "string",
						name: "tokenSymbol",
						type: "string"
					},
					{
						internalType: "uint256",
						name: "price",
						type: "uint256"
					},
					{
						internalType: "uint256",
						name: "timestamp",
						type: "uint256"
					},
					{
						internalType: "uint256",
						name: "nonce",
						type: "uint256"
					},
					{
						internalType: "uint256",
						name: "virtualFunding",
						type: "uint256"
					}
				],
				internalType:
					"struct SyntheticPerpetualWithVmarkets.OracleData",
				name: "oracleData",
				type: "tuple"
			},
			{
				internalType: "bytes",
				name: "signature",
				type: "bytes"
			}
		],
		name: "closePosition",
		outputs: [],
		stateMutability: "nonpayable",
		type: "function"
	},
	{
		inputs: [],
		name: "collateralToken",
		outputs: [
			{
				internalType: "contract IERC20",
				name: "",
				type: "address"
			}
		],
		stateMutability: "view",
		type: "function"
	},
	{
		inputs: [
			{
				components: [
					{
						internalType: "string",
						name: "marketId",
						type: "string"
					},
					{
						internalType: "uint256",
						name: "amount",
						type: "uint256"
					},
					{
						internalType: "uint256",
						name: "timestamp",
						type: "uint256"
					},
					{
						internalType: "uint256",
						name: "nonce",
						type: "uint256"
					},
					{
						internalType: "address",
						name: "operator",
						type: "address"
					}
				],
				internalType:
					"struct SyntheticPerpetualWithVmarkets.LiquidityOperationData",
				name: "liquidityData",
				type: "tuple"
			},
			{
				internalType: "bytes",
				name: "signature",
				type: "bytes"
			}
		],
		name: "deallocateVirtualMarketLiquidity",
		outputs: [],
		stateMutability: "nonpayable",
		type: "function"
	},
	{
		inputs: [
			{
				internalType: "address",
				name: "token",
				type: "address"
			},
			{
				internalType: "uint256",
				name: "amount",
				type: "uint256"
			},
			{
				internalType: "address",
				name: "to",
				type: "address"
			}
		],
		name: "emergencyWithdraw",
		outputs: [],
		stateMutability: "nonpayable",
		type: "function"
	},
	{
		inputs: [],
		name: "getAvailableLiquidity",
		outputs: [
			{
				internalType: "uint256",
				name: "",
				type: "uint256"
			}
		],
		stateMutability: "view",
		type: "function"
	},
	{
		inputs: [],
		name: "getLeverageLimits",
		outputs: [
			{
				internalType: "uint256",
				name: "",
				type: "uint256"
			},
			{
				internalType: "uint256",
				name: "",
				type: "uint256"
			}
		],
		stateMutability: "view",
		type: "function"
	},
	{
		inputs: [
			{
				internalType: "uint256",
				name: "positionId",
				type: "uint256"
			}
		],
		name: "getPositionDetails",
		outputs: [
			{
				components: [
					{
						internalType: "address",
						name: "trader",
						type: "address"
					},
					{
						internalType: "string",
						name: "tokenSymbol",
						type: "string"
					},
					{
						internalType: "bool",
						name: "isLong",
						type: "bool"
					},
					{
						internalType: "uint256",
						name: "margin",
						type: "uint256"
					},
					{
						internalType: "uint256",
						name: "leverage",
						type: "uint256"
					},
					{
						internalType: "uint256",
						name: "entryPrice",
						type: "uint256"
					},
					{
						internalType: "uint256",
						name: "liquidationPrice",
						type: "uint256"
					},
					{
						internalType: "uint256",
						name: "openTimestamp",
						type: "uint256"
					},
					{
						internalType: "bool",
						name: "isActive",
						type: "bool"
					},
					{
						internalType: "int256",
						name: "unrealizedPnl",
						type: "int256"
					}
				],
				internalType: "struct SyntheticPerpetualWithVmarkets.Position",
				name: "",
				type: "tuple"
			}
		],
		stateMutability: "view",
		type: "function"
	},
	{
		inputs: [
			{
				internalType: "uint256",
				name: "positionId",
				type: "uint256"
			},
			{
				internalType: "uint256",
				name: "currentPrice",
				type: "uint256"
			}
		],
		name: "getPositionPnLDetails",
		outputs: [
			{
				internalType: "int256",
				name: "grossPnL",
				type: "int256"
			},
			{
				internalType: "int256",
				name: "netPnL",
				type: "int256"
			},
			{
				internalType: "uint256",
				name: "totalFees",
				type: "uint256"
			},
			{
				internalType: "bool",
				name: "shouldLiquidate",
				type: "bool"
			}
		],
		stateMutability: "view",
		type: "function"
	},
	{
		inputs: [
			{
				internalType: "string",
				name: "marketId",
				type: "string"
			}
		],
		name: "getPvPMarketInfo",
		outputs: [
			{
				internalType: "uint256",
				name: "longMargin",
				type: "uint256"
			},
			{
				internalType: "uint256",
				name: "shortMargin",
				type: "uint256"
			},
			{
				internalType: "uint256",
				name: "longCount",
				type: "uint256"
			},
			{
				internalType: "uint256",
				name: "shortCount",
				type: "uint256"
			},
			{
				internalType: "uint256",
				name: "reservedLong",
				type: "uint256"
			},
			{
				internalType: "uint256",
				name: "reservedShort",
				type: "uint256"
			},
			{
				internalType: "uint256",
				name: "availableForProfits",
				type: "uint256"
			}
		],
		stateMutability: "view",
		type: "function"
	},
	{
		inputs: [
			{
				internalType: "address",
				name: "trader",
				type: "address"
			}
		],
		name: "getTraderPositions",
		outputs: [
			{
				internalType: "uint256[]",
				name: "",
				type: "uint256[]"
			}
		],
		stateMutability: "view",
		type: "function"
	},
	{
		inputs: [],
		name: "getTradingMarginLimits",
		outputs: [
			{
				internalType: "uint256",
				name: "",
				type: "uint256"
			},
			{
				internalType: "uint256",
				name: "",
				type: "uint256"
			}
		],
		stateMutability: "view",
		type: "function"
	},
	{
		inputs: [],
		name: "getTreasuryWallet",
		outputs: [
			{
				internalType: "address",
				name: "",
				type: "address"
			}
		],
		stateMutability: "view",
		type: "function"
	},
	{
		inputs: [
			{
				internalType: "string",
				name: "marketId",
				type: "string"
			}
		],
		name: "getVirtualMarket",
		outputs: [
			{
				components: [
					{
						internalType: "string",
						name: "marketId",
						type: "string"
					},
					{
						internalType: "uint256",
						name: "realLiquidity",
						type: "uint256"
					},
					{
						internalType: "uint256",
						name: "virtualLiquidity",
						type: "uint256"
					},
					{
						internalType: "uint256",
						name: "totalLiquidity",
						type: "uint256"
					},
					{
						internalType: "bool",
						name: "exists",
						type: "bool"
					},
					{
						internalType: "uint256",
						name: "createdTimestamp",
						type: "uint256"
					},
					{
						internalType: "uint256",
						name: "durationFeeRate",
						type: "uint256"
					},
					{
						internalType: "uint256",
						name: "totalLongMargin",
						type: "uint256"
					},
					{
						internalType: "uint256",
						name: "totalShortMargin",
						type: "uint256"
					},
					{
						internalType: "uint256",
						name: "longPositionCount",
						type: "uint256"
					},
					{
						internalType: "uint256",
						name: "shortPositionCount",
						type: "uint256"
					},
					{
						internalType: "uint256",
						name: "reservedMarginLong",
						type: "uint256"
					},
					{
						internalType: "uint256",
						name: "reservedMarginShort",
						type: "uint256"
					}
				],
				internalType:
					"struct SyntheticPerpetualWithVmarkets.VirtualMarket",
				name: "",
				type: "tuple"
			}
		],
		stateMutability: "view",
		type: "function"
	},
	{
		inputs: [
			{
				internalType: "string",
				name: "marketId",
				type: "string"
			}
		],
		name: "getVirtualMarketDurationFee",
		outputs: [
			{
				internalType: "uint256",
				name: "",
				type: "uint256"
			}
		],
		stateMutability: "view",
		type: "function"
	},
	{
		inputs: [
			{
				internalType: "string",
				name: "marketId",
				type: "string"
			}
		],
		name: "getVirtualMarketLiquidity",
		outputs: [
			{
				internalType: "uint256",
				name: "realLiquidity",
				type: "uint256"
			},
			{
				internalType: "uint256",
				name: "virtualLiquidity",
				type: "uint256"
			},
			{
				internalType: "uint256",
				name: "totalMarketLiquidity",
				type: "uint256"
			},
			{
				internalType: "uint256",
				name: "usableLiquidity",
				type: "uint256"
			}
		],
		stateMutability: "view",
		type: "function"
	},
	{
		inputs: [
			{
				internalType: "uint256",
				name: "positionId",
				type: "uint256"
			},
			{
				components: [
					{
						internalType: "string",
						name: "tokenSymbol",
						type: "string"
					},
					{
						internalType: "uint256",
						name: "price",
						type: "uint256"
					},
					{
						internalType: "uint256",
						name: "timestamp",
						type: "uint256"
					},
					{
						internalType: "uint256",
						name: "nonce",
						type: "uint256"
					},
					{
						internalType: "uint256",
						name: "virtualFunding",
						type: "uint256"
					}
				],
				internalType:
					"struct SyntheticPerpetualWithVmarkets.OracleData",
				name: "oracleData",
				type: "tuple"
			},
			{
				internalType: "bytes",
				name: "signature",
				type: "bytes"
			}
		],
		name: "liquidatePosition",
		outputs: [],
		stateMutability: "nonpayable",
		type: "function"
	},
	{
		inputs: [],
		name: "maxLeverage",
		outputs: [
			{
				internalType: "uint256",
				name: "",
				type: "uint256"
			}
		],
		stateMutability: "view",
		type: "function"
	},
	{
		inputs: [],
		name: "maxTradingMargin",
		outputs: [
			{
				internalType: "uint256",
				name: "",
				type: "uint256"
			}
		],
		stateMutability: "view",
		type: "function"
	},
	{
		inputs: [],
		name: "maxVirtualMarketProfitRate",
		outputs: [
			{
				internalType: "uint256",
				name: "",
				type: "uint256"
			}
		],
		stateMutability: "view",
		type: "function"
	},
	{
		inputs: [],
		name: "minLeverage",
		outputs: [
			{
				internalType: "uint256",
				name: "",
				type: "uint256"
			}
		],
		stateMutability: "view",
		type: "function"
	},
	{
		inputs: [],
		name: "minTradingMargin",
		outputs: [
			{
				internalType: "uint256",
				name: "",
				type: "uint256"
			}
		],
		stateMutability: "view",
		type: "function"
	},
	{
		inputs: [
			{
				internalType: "uint256",
				name: "positionId",
				type: "uint256"
			},
			{
				internalType: "uint256",
				name: "newMargin",
				type: "uint256"
			},
			{
				internalType: "uint256",
				name: "newLeverage",
				type: "uint256"
			},
			{
				components: [
					{
						internalType: "string",
						name: "tokenSymbol",
						type: "string"
					},
					{
						internalType: "uint256",
						name: "price",
						type: "uint256"
					},
					{
						internalType: "uint256",
						name: "timestamp",
						type: "uint256"
					},
					{
						internalType: "uint256",
						name: "nonce",
						type: "uint256"
					},
					{
						internalType: "uint256",
						name: "virtualFunding",
						type: "uint256"
					}
				],
				internalType:
					"struct SyntheticPerpetualWithVmarkets.OracleData",
				name: "oracleData",
				type: "tuple"
			},
			{
				internalType: "bytes",
				name: "signature",
				type: "bytes"
			}
		],
		name: "modifyPosition",
		outputs: [],
		stateMutability: "nonpayable",
		type: "function"
	},
	{
		inputs: [
			{
				internalType: "string",
				name: "fromMarket",
				type: "string"
			},
			{
				internalType: "string",
				name: "toMarket",
				type: "string"
			},
			{
				internalType: "uint256",
				name: "amount",
				type: "uint256"
			},
			{
				internalType: "bool",
				name: "moveFromVirtual",
				type: "bool"
			}
		],
		name: "moveLiquidityBetweenMarkets",
		outputs: [],
		stateMutability: "nonpayable",
		type: "function"
	},
	{
		inputs: [],
		name: "nextPositionId",
		outputs: [
			{
				internalType: "uint256",
				name: "",
				type: "uint256"
			}
		],
		stateMutability: "view",
		type: "function"
	},
	{
		inputs: [
			{
				internalType: "string",
				name: "tokenSymbol",
				type: "string"
			},
			{
				internalType: "bool",
				name: "isLong",
				type: "bool"
			},
			{
				internalType: "uint256",
				name: "margin",
				type: "uint256"
			},
			{
				internalType: "uint256",
				name: "leverage",
				type: "uint256"
			},
			{
				components: [
					{
						internalType: "string",
						name: "tokenSymbol",
						type: "string"
					},
					{
						internalType: "uint256",
						name: "price",
						type: "uint256"
					},
					{
						internalType: "uint256",
						name: "timestamp",
						type: "uint256"
					},
					{
						internalType: "uint256",
						name: "nonce",
						type: "uint256"
					},
					{
						internalType: "uint256",
						name: "virtualFunding",
						type: "uint256"
					}
				],
				internalType:
					"struct SyntheticPerpetualWithVmarkets.OracleData",
				name: "oracleData",
				type: "tuple"
			},
			{
				internalType: "bytes",
				name: "signature",
				type: "bytes"
			}
		],
		name: "openPosition",
		outputs: [],
		stateMutability: "nonpayable",
		type: "function"
	},
	{
		inputs: [],
		name: "owner",
		outputs: [
			{
				internalType: "address",
				name: "",
				type: "address"
			}
		],
		stateMutability: "view",
		type: "function"
	},
	{
		inputs: [],
		name: "pause",
		outputs: [],
		stateMutability: "nonpayable",
		type: "function"
	},
	{
		inputs: [],
		name: "paused",
		outputs: [
			{
				internalType: "bool",
				name: "",
				type: "bool"
			}
		],
		stateMutability: "view",
		type: "function"
	},
	{
		inputs: [
			{
				internalType: "uint256",
				name: "",
				type: "uint256"
			}
		],
		name: "positions",
		outputs: [
			{
				internalType: "address",
				name: "trader",
				type: "address"
			},
			{
				internalType: "string",
				name: "tokenSymbol",
				type: "string"
			},
			{
				internalType: "bool",
				name: "isLong",
				type: "bool"
			},
			{
				internalType: "uint256",
				name: "margin",
				type: "uint256"
			},
			{
				internalType: "uint256",
				name: "leverage",
				type: "uint256"
			},
			{
				internalType: "uint256",
				name: "entryPrice",
				type: "uint256"
			},
			{
				internalType: "uint256",
				name: "liquidationPrice",
				type: "uint256"
			},
			{
				internalType: "uint256",
				name: "openTimestamp",
				type: "uint256"
			},
			{
				internalType: "bool",
				name: "isActive",
				type: "bool"
			},
			{
				internalType: "int256",
				name: "unrealizedPnl",
				type: "int256"
			}
		],
		stateMutability: "view",
		type: "function"
	},
	{
		inputs: [],
		name: "renounceOwnership",
		outputs: [],
		stateMutability: "nonpayable",
		type: "function"
	},
	{
		inputs: [
			{
				internalType: "uint256",
				name: "positionId",
				type: "uint256"
			},
			{
				internalType: "uint256",
				name: "currentPrice",
				type: "uint256"
			}
		],
		name: "simulatePositionClosure",
		outputs: [
			{
				internalType: "uint256",
				name: "payoutAmount",
				type: "uint256"
			},
			{
				internalType: "int256",
				name: "liquidityChange",
				type: "int256"
			},
			{
				internalType: "uint256",
				name: "totalFeesCharged",
				type: "uint256"
			}
		],
		stateMutability: "view",
		type: "function"
	},
	{
		inputs: [
			{
				internalType: "uint256",
				name: "positionId",
				type: "uint256"
			},
			{
				internalType: "uint256",
				name: "currentPrice",
				type: "uint256"
			}
		],
		name: "simulatePvPClosure",
		outputs: [
			{
				internalType: "uint256",
				name: "payoutAmount",
				type: "uint256"
			},
			{
				internalType: "bool",
				name: "canPayProfit",
				type: "bool"
			},
			{
				internalType: "uint256",
				name: "profitFromOpposing",
				type: "uint256"
			},
			{
				internalType: "uint256",
				name: "profitFromMarket",
				type: "uint256"
			},
			{
				internalType: "string",
				name: "reasonIfLimited",
				type: "string"
			}
		],
		stateMutability: "view",
		type: "function"
	},
	{
		inputs: [],
		name: "totalAllocatedLiquidity",
		outputs: [
			{
				internalType: "uint256",
				name: "",
				type: "uint256"
			}
		],
		stateMutability: "view",
		type: "function"
	},
	{
		inputs: [],
		name: "totalFeesCollected",
		outputs: [
			{
				internalType: "uint256",
				name: "",
				type: "uint256"
			}
		],
		stateMutability: "view",
		type: "function"
	},
	{
		inputs: [],
		name: "totalLiquidity",
		outputs: [
			{
				internalType: "uint256",
				name: "",
				type: "uint256"
			}
		],
		stateMutability: "view",
		type: "function"
	},
	{
		inputs: [
			{
				internalType: "address",
				name: "",
				type: "address"
			},
			{
				internalType: "uint256",
				name: "",
				type: "uint256"
			}
		],
		name: "traderPositions",
		outputs: [
			{
				internalType: "uint256",
				name: "",
				type: "uint256"
			}
		],
		stateMutability: "view",
		type: "function"
	},
	{
		inputs: [
			{
				internalType: "address",
				name: "newOwner",
				type: "address"
			}
		],
		name: "transferOwnership",
		outputs: [],
		stateMutability: "nonpayable",
		type: "function"
	},
	{
		inputs: [],
		name: "treasuryWallet",
		outputs: [
			{
				internalType: "address",
				name: "",
				type: "address"
			}
		],
		stateMutability: "view",
		type: "function"
	},
	{
		inputs: [],
		name: "unpause",
		outputs: [],
		stateMutability: "nonpayable",
		type: "function"
	},
	{
		inputs: [
			{
				internalType: "address",
				name: "newAdminSigner",
				type: "address"
			}
		],
		name: "updateAdminSigner",
		outputs: [],
		stateMutability: "nonpayable",
		type: "function"
	},
	{
		inputs: [
			{
				internalType: "uint256",
				name: "newMinLeverage",
				type: "uint256"
			},
			{
				internalType: "uint256",
				name: "newMaxLeverage",
				type: "uint256"
			}
		],
		name: "updateLeverageLimits",
		outputs: [],
		stateMutability: "nonpayable",
		type: "function"
	},
	{
		inputs: [
			{
				internalType: "uint256",
				name: "newMinMargin",
				type: "uint256"
			},
			{
				internalType: "uint256",
				name: "newMaxMargin",
				type: "uint256"
			}
		],
		name: "updateMarginLimits",
		outputs: [],
		stateMutability: "nonpayable",
		type: "function"
	},
	{
		inputs: [
			{
				internalType: "uint256",
				name: "positionId",
				type: "uint256"
			},
			{
				internalType: "uint256",
				name: "newLeverage",
				type: "uint256"
			},
			{
				components: [
					{
						internalType: "string",
						name: "tokenSymbol",
						type: "string"
					},
					{
						internalType: "uint256",
						name: "price",
						type: "uint256"
					},
					{
						internalType: "uint256",
						name: "timestamp",
						type: "uint256"
					},
					{
						internalType: "uint256",
						name: "nonce",
						type: "uint256"
					},
					{
						internalType: "uint256",
						name: "virtualFunding",
						type: "uint256"
					}
				],
				internalType:
					"struct SyntheticPerpetualWithVmarkets.OracleData",
				name: "oracleData",
				type: "tuple"
			},
			{
				internalType: "bytes",
				name: "signature",
				type: "bytes"
			}
		],
		name: "updatePositionLeverage",
		outputs: [],
		stateMutability: "nonpayable",
		type: "function"
	},
	{
		inputs: [
			{
				internalType: "uint256",
				name: "positionId",
				type: "uint256"
			},
			{
				components: [
					{
						internalType: "string",
						name: "tokenSymbol",
						type: "string"
					},
					{
						internalType: "uint256",
						name: "price",
						type: "uint256"
					},
					{
						internalType: "uint256",
						name: "timestamp",
						type: "uint256"
					},
					{
						internalType: "uint256",
						name: "nonce",
						type: "uint256"
					},
					{
						internalType: "uint256",
						name: "virtualFunding",
						type: "uint256"
					}
				],
				internalType:
					"struct SyntheticPerpetualWithVmarkets.OracleData",
				name: "oracleData",
				type: "tuple"
			},
			{
				internalType: "bytes",
				name: "signature",
				type: "bytes"
			}
		],
		name: "updatePositionPnL",
		outputs: [],
		stateMutability: "nonpayable",
		type: "function"
	},
	{
		inputs: [
			{
				internalType: "address",
				name: "newTreasuryWallet",
				type: "address"
			}
		],
		name: "updateTreasuryWallet",
		outputs: [],
		stateMutability: "nonpayable",
		type: "function"
	},
	{
		inputs: [
			{
				internalType: "string",
				name: "marketId",
				type: "string"
			},
			{
				internalType: "uint256",
				name: "newFeeRate",
				type: "uint256"
			}
		],
		name: "updateVirtualMarketDurationFee",
		outputs: [],
		stateMutability: "nonpayable",
		type: "function"
	},
	{
		inputs: [
			{
				internalType: "uint256",
				name: "newProfitRate",
				type: "uint256"
			}
		],
		name: "updateVirtualMarketProfitRate",
		outputs: [],
		stateMutability: "nonpayable",
		type: "function"
	},
	{
		inputs: [
			{
				internalType: "address",
				name: "",
				type: "address"
			},
			{
				internalType: "uint256",
				name: "",
				type: "uint256"
			}
		],
		name: "usedNonces",
		outputs: [
			{
				internalType: "bool",
				name: "",
				type: "bool"
			}
		],
		stateMutability: "view",
		type: "function"
	},
	{
		inputs: [
			{
				internalType: "string",
				name: "marketId",
				type: "string"
			}
		],
		name: "virtualMarketExists",
		outputs: [
			{
				internalType: "bool",
				name: "",
				type: "bool"
			}
		],
		stateMutability: "view",
		type: "function"
	},
	{
		inputs: [
			{
				internalType: "string",
				name: "",
				type: "string"
			}
		],
		name: "virtualMarkets",
		outputs: [
			{
				internalType: "string",
				name: "marketId",
				type: "string"
			},
			{
				internalType: "uint256",
				name: "realLiquidity",
				type: "uint256"
			},
			{
				internalType: "uint256",
				name: "virtualLiquidity",
				type: "uint256"
			},
			{
				internalType: "uint256",
				name: "totalLiquidity",
				type: "uint256"
			},
			{
				internalType: "bool",
				name: "exists",
				type: "bool"
			},
			{
				internalType: "uint256",
				name: "createdTimestamp",
				type: "uint256"
			},
			{
				internalType: "uint256",
				name: "durationFeeRate",
				type: "uint256"
			},
			{
				internalType: "uint256",
				name: "totalLongMargin",
				type: "uint256"
			},
			{
				internalType: "uint256",
				name: "totalShortMargin",
				type: "uint256"
			},
			{
				internalType: "uint256",
				name: "longPositionCount",
				type: "uint256"
			},
			{
				internalType: "uint256",
				name: "shortPositionCount",
				type: "uint256"
			},
			{
				internalType: "uint256",
				name: "reservedMarginLong",
				type: "uint256"
			},
			{
				internalType: "uint256",
				name: "reservedMarginShort",
				type: "uint256"
			}
		],
		stateMutability: "view",
		type: "function"
	},
	{
		inputs: [
			{
				internalType: "uint256",
				name: "amount",
				type: "uint256"
			}
		],
		name: "withdrawFees",
		outputs: [],
		stateMutability: "nonpayable",
		type: "function"
	},
	{
		stateMutability: "payable",
		type: "receive"
	}
];

export { usdc, SyntheticPerpetualContract, SyntheticAbi, ERC20Abi };
