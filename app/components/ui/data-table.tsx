import { Search } from "lucide-react";
import type { ReactNode } from "react";
import { Input } from "./input";
import { Skeleton } from "./skeleton";
import { Tabs, TabsList, TabsTrigger } from "./tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";

// Column definition for the table
export interface ColumnDef<T> {
	/** Unique key for the column */
	key: string;
	/** Header label */
	header: string;
	/** Header alignment */
	headerAlign?: "left" | "center" | "right";
	/** Cell alignment */
	cellAlign?: "left" | "center" | "right";
	/** Column width class (e.g. "w-[120px]") */
	width?: string;
	/** Render function for the cell content */
	render: (item: T, index: number) => ReactNode;
	/** Render function for the skeleton loading state */
	skeleton?: () => ReactNode;
}

export interface FilterTab {
	key: string;
	label: string;
}

export interface ChainOption {
	value: string;
	label: string;
}

export interface DataTableProps<T> {
	/** Data items to display */
	data: T[];
	/** Loading state */
	isLoading?: boolean;
	/** Number of skeleton rows to show when loading */
	skeletonCount?: number;

	// Search
	/** Placeholder text for search input */
	searchPlaceholder?: string;
	/** Current search value */
	searchValue?: string;
	/** Callback when search value changes */
	onSearchChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;

	// Filter tabs
	/** Filter tab options */
	filterTabs?: FilterTab[];
	/** Currently active filter key */
	activeFilter?: string;
	/** Callback when filter changes */
	onFilterChange?: (key: string) => void;

	// Chain selector
	/** Show chain filter dropdown */
	showChainFilter?: boolean;
	/** Chain options */
	chainOptions?: ChainOption[];
	/** Current chain filter value */
	chainFilter?: string;
	/** Callback when chain changes */
	onChainChange?: (chain: string) => void;

	// Table configuration
	/** Column definitions */
	columns: ColumnDef<T>[];
	/** Unique key for each row */
	getRowKey: (item: T, index: number) => string;
	/** Callback when row is clicked */
	onRowClick?: (item: T) => void;

	// Empty state
	/** Title for empty state */
	emptyTitle?: string;
	/** Description for empty state */
	emptyDescription?: string;
	/** Custom action button for empty state */
	emptyAction?: ReactNode;

	// Footer
	/** Custom footer content */
	footer?: ReactNode;

	// Min table width
	minTableWidth?: string;
}

const alignmentClasses = {
	left: "text-left",
	center: "text-center",
	right: "text-right",
};

function DefaultSkeleton({ align = "left" }: { align?: "left" | "center" | "right" }) {
	const widthClass = "w-16";
	const marginClass = align === "right" ? "ml-auto" : align === "center" ? "mx-auto" : "";
	return <Skeleton className={`h-4 ${widthClass} ${marginClass}`} />;
}

export function DataTable<T>({
	data,
	isLoading = false,
	skeletonCount = 10,
	searchPlaceholder = "Search...",
	searchValue = "",
	onSearchChange,
	filterTabs,
	activeFilter,
	onFilterChange,
	showChainFilter = false,
	chainOptions = [],
	chainFilter,
	onChainChange,
	columns,
	getRowKey,
	onRowClick,
	emptyTitle = "No items found",
	emptyDescription = "No data available",
	emptyAction,
	footer,
	minTableWidth = "900px",
}: DataTableProps<T>) {
	const hasData = data.length > 0;
	const showSkeletons = isLoading && !hasData;

	return (
		<>
			<div className="border-l border-r border-[#202020]">
				<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
					<div className="flex-1 min-w-0 flex items-center gap-4 w-full">
						<div className="relative w-full md:w-80">
							<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
							<Input
								type="text"
								placeholder={searchPlaceholder}
								value={searchValue}
								onChange={onSearchChange}
								className="py-6 pl-10 h-full border-0 border-r rounded-none focus-visible:ring-0 focus-visible:border-0 w-full"
							/>
						</div>
					</div>

					<div className="flex-none w-full sm:w-auto flex items-center gap-2">
						{showChainFilter && chainOptions.length > 0 && (
							<Select value={chainFilter} onValueChange={onChainChange}>
								<SelectTrigger className="w-[120px] bg-transparent border-0 border-r rounded-none hover:text-[#a3e635] focus:ring-0 shadow-none py-6">
									<SelectValue placeholder="Chain" />
								</SelectTrigger>
								<SelectContent>
									{chainOptions.map((option) => (
										<SelectItem key={option.value} value={option.value}>
											{option.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						)}
						{filterTabs && filterTabs.length > 0 && (
							<Tabs
								value={activeFilter}
								onValueChange={onFilterChange}
								className="w-full sm:w-auto"
							>
								<TabsList className="h-auto p-0 bg-transparent border-b-0 space-x-4">
									{filterTabs.map((tab) => (
										<TabsTrigger
											key={tab.key}
											value={tab.key}
											className="text-sm font-medium px-3 py-2 -mb-px hover:text-foreground data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-[#a3e635] data-[state=active]:text-[#a3e635] rounded-none shadow-none"
										>
											{tab.label}
										</TabsTrigger>
									))}
								</TabsList>
							</Tabs>
						)}
					</div>
				</div>
			</div>

			<div className="space-y-8">
				<div className="relative">
					<div className="overflow-hidden border border-[#202020] bg-[#060606] shadow-[0_6px_24px_rgba(0,0,0,0.6)]">
						<div className="p-0">
							<div className="overflow-x-auto">
								<table className="w-full border-collapse" style={{ minWidth: minTableWidth }}>
									<thead>
										<tr className="border-b border-[#222022] bg-[#070707] p-0">
											{columns.map((col) => (
												<th
													key={col.key}
													className={`px-4 py-3 text-[#BFC7C7] font-semibold text-xs uppercase tracking-wider ${
														alignmentClasses[col.headerAlign || "left"]
													} ${col.width || ""}`}
												>
													{col.header}
												</th>
											))}
										</tr>
									</thead>
									<tbody>
										{showSkeletons ? (
											Array.from({ length: skeletonCount }).map((_, i) => (
												<tr key={`skeleton-${i}`} className="border-b border-[#1e1e1e]">
													{columns.map((col) => (
														<td
															key={col.key}
															className={`px-4 py-4 ${alignmentClasses[col.cellAlign || "left"]}`}
														>
															{col.skeleton ? (
																col.skeleton()
															) : (
																<DefaultSkeleton align={col.cellAlign || "left"} />
															)}
														</td>
													))}
												</tr>
											))
										) : hasData ? (
											data.map((item, idx) => (
												<tr
													key={getRowKey(item, idx)}
													className={`border-b border-[#1e1e1e] hover:bg-[#0b0b0b] transition-colors hover:border hover:border-[#a3e635]/40 ${onRowClick ? "cursor-pointer" : ""}`}
													onClick={onRowClick ? () => onRowClick(item) : undefined}
												>
													{columns.map((col) => (
														<td
															key={col.key}
															className={`px-4 py-4 ${alignmentClasses[col.cellAlign || "left"]}`}
														>
															{col.render(item, idx)}
														</td>
													))}
												</tr>
											))
										) : (
											<tr>
												<td colSpan={columns.length} className="p-12 text-center">
													<div className="flex flex-col items-center gap-2">
														<div className="text-muted-foreground">{emptyTitle}</div>
														<div className="text-sm text-muted-foreground">{emptyDescription}</div>
														{emptyAction}
													</div>
												</td>
											</tr>
										)}
									</tbody>
								</table>
							</div>
						</div>
					</div>
					<div className="pointer-events-none absolute left-0 top-0 bottom-0 w-12 bg-linear-to-r from-[#1a2e14]/10 to-transparent" />
				</div>
			</div>

			{footer && (
				<div className="border-t border-[#222222] bg-[#060606] p-3 flex items-center justify-between text-sm text-[#9AA0A0] mb-16 lg:mb-10">
					{footer}
				</div>
			)}
		</>
	);
}
