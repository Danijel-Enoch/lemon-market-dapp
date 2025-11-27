"use client";

import type React from "react";
import { createContext, type ReactNode, useContext, useEffect, useReducer, useRef } from "react";
import toast from "react-hot-toast";
import { useAccount, useBalance } from "wagmi";
import { verifyTask } from "@/lib/kickoff-service";
import type { Chain, MoneyMarket, Position, TradingPair, Transaction } from "@/lib/mock-data";

interface AppState {
	selectedPair: TradingPair | null;
	selectedChain: string;
	selectedMoneyMarket: string;
	positions: Position[];
	transactions: Transaction[];
	tradingPairs: TradingPair[];
	chains: Chain[];
	moneyMarkets: MoneyMarket[];
	isConnected: boolean;
	walletAddress: string | null;
	balance: number;
	filters: {
		searchTerm: string;
		minROE: number;
		includeRewards: boolean;
	};

	// Kickoff verification state
	isVerifying: boolean;
	verifiedAddress: string | null;
	verificationMessage: string | null;
	verificationError: string | null;
}

type AppAction =
	| { type: "SET_SELECTED_PAIR"; payload: TradingPair | null }
	| { type: "SET_SELECTED_CHAIN"; payload: string }
	| { type: "SET_SELECTED_MONEY_MARKET"; payload: string }
	| { type: "SET_POSITIONS"; payload: Position[] }
	| { type: "ADD_POSITION"; payload: Position }
	| {
			type: "UPDATE_POSITION";
			payload: { id: string; updates: Partial<Position> };
	  }
	| { type: "REMOVE_POSITION"; payload: string }
	| { type: "SET_TRANSACTIONS"; payload: Transaction[] }
	| { type: "ADD_TRANSACTION"; payload: Transaction }
	| { type: "SET_TRADING_PAIRS"; payload: TradingPair[] }
	| { type: "SET_CHAINS"; payload: Chain[] }
	| { type: "SET_MONEY_MARKETS"; payload: MoneyMarket[] }
	| {
			type: "SET_WALLET_CONNECTION";
			payload: { isConnected: boolean; address: string | null };
	  }
	| { type: "SET_BALANCE"; payload: number }
	| { type: "UPDATE_FILTERS"; payload: Partial<AppState["filters"]> };

// Add verification-specific actions
type VerificationAction =
	| { type: "START_VERIFICATION" }
	| { type: "SET_VERIFIED"; payload: { address: string; message?: string | null } }
	| { type: "SET_VERIFICATION_ERROR"; payload: { message?: string | null } };

type AppActionExtended = AppAction | VerificationAction;

const initialState: AppState = {
	selectedPair: null,
	selectedChain: "ethereum",
	selectedMoneyMarket: "aave-v3",
	positions: [],
	transactions: [],
	tradingPairs: [],
	chains: [],
	moneyMarkets: [],
	isConnected: false,
	walletAddress: null,
	balance: 0,
	filters: {
		searchTerm: "",
		minROE: 0,
		includeRewards: false,
	},
	isVerifying: false,
	verifiedAddress: null,
	verificationMessage: null,
	verificationError: null,
};

function appReducer(state: AppState, action: AppActionExtended): AppState {
	switch (action.type) {
		case "SET_SELECTED_PAIR":
			return { ...state, selectedPair: action.payload };
		case "SET_SELECTED_CHAIN":
			return { ...state, selectedChain: action.payload };
		case "SET_SELECTED_MONEY_MARKET":
			return { ...state, selectedMoneyMarket: action.payload };
		case "SET_POSITIONS":
			return { ...state, positions: action.payload };
		case "ADD_POSITION":
			return { ...state, positions: [...state.positions, action.payload] };
		case "UPDATE_POSITION":
			return {
				...state,
				positions: state.positions.map((pos) =>
					pos.id === action.payload.id ? { ...pos, ...action.payload.updates } : pos,
				),
			};
		case "REMOVE_POSITION":
			return {
				...state,
				positions: state.positions.filter((pos) => pos.id !== action.payload),
			};
		case "SET_TRANSACTIONS":
			return { ...state, transactions: action.payload };
		case "ADD_TRANSACTION":
			return {
				...state,
				transactions: [action.payload, ...state.transactions],
			};
		case "SET_TRADING_PAIRS":
			return { ...state, tradingPairs: action.payload };
		case "SET_CHAINS":
			return { ...state, chains: action.payload };
		case "SET_MONEY_MARKETS":
			return { ...state, moneyMarkets: action.payload };
		case "SET_WALLET_CONNECTION":
			return {
				...state,
				isConnected: action.payload.isConnected,
				walletAddress: action.payload.address,
			};
		case "SET_BALANCE":
			return { ...state, balance: action.payload };
		case "UPDATE_FILTERS":
			return { ...state, filters: { ...state.filters, ...action.payload } };
		case "START_VERIFICATION":
			return { ...state, isVerifying: true, verificationError: null, verificationMessage: null };
		case "SET_VERIFIED":
			return {
				...state,
				isVerifying: false,
				verifiedAddress: action.payload?.address || null,
				verificationMessage: action.payload?.message || null,
				verificationError: null,
			};
		case "SET_VERIFICATION_ERROR":
			return {
				...state,
				isVerifying: false,
				verificationError: action.payload?.message || null,
			};
		default:
			return state;
	}
}

const AppContext = createContext<{
	state: AppState;
	dispatch: React.Dispatch<AppActionExtended>;
} | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
	const [state, dispatch] = useReducer(appReducer, initialState);
	const { address, isConnected } = useAccount();
	const { data: balance } = useBalance({
		address: address,
	});

	// Sync wallet connection state with app context
	useEffect(() => {
		dispatch({
			type: "SET_WALLET_CONNECTION",
			payload: { isConnected, address: address || null },
		});
	}, [isConnected, address]);

	// Sync balance with app context
	useEffect(() => {
		if (balance) {
			dispatch({
				type: "SET_BALANCE",
				payload: Number(balance.formatted),
			});
		}
	}, [balance]);

	// Deduplicate verification attempts across multiple components by storing last verified address
	const lastVerifiedRef = useRef<string | null>(null);

	useEffect(() => {
		if (!isConnected || !address) return;
		if (lastVerifiedRef.current === address) return;
		lastVerifiedRef.current = address;

		(async () => {
			try {
				dispatch({ type: "START_VERIFICATION" });
				toast.loading("Verifying wallet connection...");
				const { success, message } = await verifyTask(address, "connect_wallet");
				if (success) {
					dispatch({ type: "SET_VERIFIED", payload: { address, message } });
					toast.success(message || "Wallet connected and task verified!");
				} else {
					dispatch({ type: "SET_VERIFICATION_ERROR", payload: { message } });
					toast.error(message || "Verification failed");
				}
			} catch (err: unknown) {
				let msg = "Verification failed";
				if (err instanceof Error) msg = err.message;
				dispatch({ type: "SET_VERIFICATION_ERROR", payload: { message: msg } });
				toast.error(msg);
			}
		})();
	}, [isConnected, address]);

	return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>;
}

export function useAppContext() {
	const context = useContext(AppContext);
	if (!context) {
		throw new Error("useAppContext must be used within an AppProvider");
	}
	return context;
}
