import { SearchModal } from "@app/components/ui/SearchModal";
import type { LeaderboardEntry } from "@app/lib/leaderboard-service";
import { useState } from "react";
import { LeaderboardSearchResults } from "./LeaderboardSearchResults";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: LeaderboardEntry[];
}

export function LeaderboardSearchModal({ open, onOpenChange, data }: Props) {
  const [results, setResults] = useState<LeaderboardEntry[]>([]);
  const [query, setQuery] = useState("");

  const search = (value: string) => {
    setQuery(value);

    if (value.trim().length < 3) {
      setResults([]);
      return;
    }

    const filtered = data.filter((entry) =>
      entry.trader.toLowerCase().includes(value.toLowerCase())
    );

    setResults(filtered);
  };

  const clearResults = () => {
    setQuery("");
    setResults([]);
  };

  return (
    <SearchModal
      open={open}
      onOpenChange={onOpenChange}
      header="Search Traders"
      placeholder="Paste wallet address (3+ characters)"
      onSearch={search}
      onClear={clearResults}
    >
      {query.length >= 3 && <LeaderboardSearchResults results={results} />}
    </SearchModal>
  );
}
