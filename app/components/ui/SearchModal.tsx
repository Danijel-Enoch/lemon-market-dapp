// import {
//   Dialog,
//   DialogContent,
//   DialogHeader,
//   DialogTitle,
// } from "@app/components/ui/dialog";
// import { Input } from "@app/components/ui/input";
// import { SearchResults } from "@app/components/ui/SearchResults";
// import { type SearchResult, useSearch } from "@app/hooks/useSearch";
// import { Search } from "lucide-react";
// import { useState } from "react";
// import { useNavigate } from "react-router";

// interface SearchModalProps {
//   open: boolean;
//   onOpenChange: (open: boolean) => void;
//   header: string;
//   placeholder: string;
// }

// export function SearchModal({ open, onOpenChange, header, placeholder }: SearchModalProps) {
//   const navigate = useNavigate();
//   const [query, setQuery] = useState("");
//   const { results, isLoading, error, search, clearResults } = useSearch({
//     minQueryLength: 3,
//   });

//   const handleSearch = (value: string) => {
//     setQuery(value);
//     if (value.trim().length >= 3) {
//       search(value);
//     } else {
//       clearResults();
//     }
//   };

// //   const handleTradeClick = (result: SearchResult) => {
// //     // Navigate to perp page with the selected pair
// //     const params = new URLSearchParams();
// //     params.set("symbol", result.symbol);
// //     if (result.pairAddress) {
// //       params.set("pairAddress", result.pairAddress);
// //     }
// //     if (result.tokenAddress) {
// //       params.set("tokenAddress", result.tokenAddress);
// //     }
// //     params.set("chain", result.chain || "base");
// //     params.set("assetType", "crypto");
// //     navigate(`/perp?${params.toString()}`);
// //     onOpenChange(false);
// //     setQuery("");
// //     clearResults();
// //   };

//   return (
//     <Dialog open={open} onOpenChange={onOpenChange}>
//       <DialogContent className="sm:max-w-150 bg-[#1a1a1a] border-[#333]">
//         <DialogHeader>
//           <DialogTitle className="text-white flex items-center gap-2">
//             <Search className="w-5 h-5" />
//             {header}
//           </DialogTitle>
//         </DialogHeader>
//         <div className="space-y-4">
//           <Input
//             placeholder={placeholder}
//             value={query}
//             onChange={(e) => handleSearch(e.target.value)}
//             className="bg-[#2a2a2a] border-[#444] text-white placeholder:text-[#888]"
//             autoFocus
//           />
//           {/* <SearchResults
//             results={results}
//             isLoading={isLoading}
//             error={error}
//             query={query}
//             onTradeClick={handleTradeClick}
//           /> */}
//         </div>
//       </DialogContent>
//     </Dialog>
//   );
// }

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@app/components/ui/dialog";
import { Input } from "@app/components/ui/input";
import { Search } from "lucide-react";
import { type ReactNode, useState } from "react";

interface SearchModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	header: string;
	placeholder: string;
	minQueryLength?: number;
	onSearch: (query: string) => void;
	onClear?: () => void;
	children: ReactNode;
}

export function SearchModal({
	open,
	onOpenChange,
	header,
	placeholder,
	//   minQueryLength = 3,
	onSearch,
	onClear,
	children,
}: SearchModalProps) {
	const [query, setQuery] = useState("");

	const handleSearch = (value: string) => {
		setQuery(value);
		if (value.trim().length >= 3) {
			onSearch(value);
		} else {
			onClear?.();
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-150 bg-[#1a1a1a] border-[#333] px-4">
				<DialogHeader>
					<DialogTitle className="text-white flex items-center gap-2">
						<Search className="w-5 h-5" />
						{header}
					</DialogTitle>
				</DialogHeader>

				<div className="space-y-4">
					<Input
						autoFocus
						placeholder={placeholder}
						value={query}
						onChange={(e) => handleSearch(e.target.value)}
						className="bg-[#2a2a2a] border-[#444] text-white placeholder:text-[#888]"
					/>
					<div className="max-h-56 w-full sm:max-w-142 overflow-x-auto">{children}</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
