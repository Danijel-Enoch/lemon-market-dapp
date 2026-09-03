/**
 * Tiny TTL cache for upstream responses.
 *
 * The the reference design pair catalog is documented as cached upstream "for a few
 * minutes", and KyberSwap rate-limits per client id. Re-fetching either on
 * every page load would burn quota for data that has not changed, so reads go
 * through here.
 */
export class TtlCache<T> {
	private entry: { value: T; expiresAt: number } | null = null;
	private inflight: Promise<T> | null = null;

	constructor(
		private readonly loader: () => Promise<T>,
		private readonly ttlMs: number,
	) {}

	async get(force = false): Promise<T> {
		if (!force && this.entry && Date.now() < this.entry.expiresAt) {
			return this.entry.value;
		}
		// Collapse concurrent misses into one upstream call.
		if (this.inflight) return this.inflight;

		this.inflight = this.loader()
			.then((value) => {
				this.entry = { value, expiresAt: Date.now() + this.ttlMs };
				return value;
			})
			.finally(() => {
				this.inflight = null;
			});

		try {
			return await this.inflight;
		} catch (error) {
			// Serve stale rather than failing the page when an upstream blips.
			if (this.entry) return this.entry.value;
			throw error;
		}
	}

	peek(): T | null {
		return this.entry?.value ?? null;
	}

	invalidate(): void {
		this.entry = null;
	}
}

export class KeyedTtlCache<T> {
	private readonly caches = new Map<string, TtlCache<T>>();

	constructor(
		private readonly loader: (key: string) => Promise<T>,
		private readonly ttlMs: number,
	) {}

	get(key: string, force = false): Promise<T> {
		let cache = this.caches.get(key);
		if (!cache) {
			cache = new TtlCache(() => this.loader(key), this.ttlMs);
			this.caches.set(key, cache);
		}
		return cache.get(force);
	}
}
