/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_API_BASE_URL: string;
}

// biome-ignore lint/correctness/noUnusedVariables: used imperatively
interface ImportMeta {
	readonly env: ImportMetaEnv;
}
