export type Metadata = {
	title?: string;
	description?: string;
	other?: Record<string, string>;
	openGraph?: {
		title?: string;
		description?: string;
		images?: string[];
	};
};
