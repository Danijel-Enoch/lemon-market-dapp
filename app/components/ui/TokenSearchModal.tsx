import { useNavigate } from "react-router";
import { SearchModal } from "./SearchModal";
import { SearchResults } from "./SearchResults";
import { useSearch, type SearchResult } from "@app/hooks/useSearch";
import { useState } from "react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TokenSearchModal({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const { results, isLoading, error, search, clearResults } = useSearch({
    minQueryLength: 3,
  });

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
    <SearchModal
      open={open}
      onOpenChange={onOpenChange}
      header="Search Tokens"
      placeholder="Paste contract address or search by symbol (3+ characters)"
      onSearch={search}
      onClear={clearResults}
    >
      <SearchResults
        results={results}
        isLoading={isLoading}
        error={error}
        query={query}
        onTradeClick={handleTradeClick}
      />
    </SearchModal>
  );
}
