import { Search } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SearchResults } from "@/components/ui/SearchResults";
import { useSearch, type SearchResult } from "@/hooks/useSearch";

interface SearchModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function SearchModal({ open, onOpenChange }: SearchModalProps) {
	const navigate = useNavigate();
	const [query, setQuery] = useState("");
	const { results, isLoading, error, search, clearResults } = useSearch({
		minQueryLength: 3
	});

	const handleSearch = (value: string) => {
		setQuery(value);
		if (value.trim().length >= 3) {
			search(value);
		} else {
			clearResults();
		}
	};

	const handleTradeClick = (result: SearchResult) => {
		// Navigate to perp page with the selected pair
		const params = new URLSearchParams();
		params.set("symbol", result.symbol);
		if (result.pairAddress) {
			params.set("pairAddress", result.pairAddress);
		}
		if (result.tokenAddress) {
			params.set("tokenAddress", result.tokenAddress);
		}
		params.set("chain", result.chain || "base");
		params.set("assetType", "crypto");
		navigate(`/perp?${params.toString()}`);
		onOpenChange(false);
		setQuery("");
		clearResults();
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[600px] bg-[#1a1a1a] border-[#333]">
				<DialogHeader>
					<DialogTitle className="text-white flex items-center gap-2">
						<Search className="w-5 h-5" />
						Search Tokens
					</DialogTitle>
				</DialogHeader>
				<div className="space-y-4">
					<Input
						placeholder="Paste contract address or search by name/symbol (3+ characters)"
						value={query}
						onChange={(e) => handleSearch(e.target.value)}
						className="bg-[#2a2a2a] border-[#444] text-white placeholder:text-[#888]"
						autoFocus
					/>
					<SearchResults
						results={results}
						isLoading={isLoading}
						error={error}
						query={query}
						onTradeClick={handleTradeClick}
					/>
				</div>
			</DialogContent>
		</Dialog>
	);
}
