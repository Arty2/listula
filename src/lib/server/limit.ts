/**
 * How many requests one address may make in a window, counted in memory.
 *
 * Writing needs no account, so without this one address could fill the blob
 * store with lists nobody will ever open. A sync makes a handful of requests
 * and then waits out a ten-second cooldown, so the ceilings below are far
 * above anything a person can reach and far below what a script would want.
 *
 * Counted per function instance, not across them: a serverless deployment
 * runs several at once, so this is a floor rather than a wall. A rate-limit
 * rule in the host's own firewall is the layer that sees every instance, and
 * this is what still holds when nobody has set one up.
 */
export class RateLimiter {
	#hits = new Map<string, { start: number; count: number }>();
	#limit: number;
	#windowMs: number;
	#now: () => number;
	#maxKeys: number;

	constructor(
		limit: number,
		windowMs: number,
		options: { now?: () => number; maxKeys?: number } = {}
	) {
		this.#limit = limit;
		this.#windowMs = windowMs;
		this.#now = options.now ?? Date.now;
		this.#maxKeys = options.maxKeys ?? 10_000;
	}

	/** Counts one request from `key`, and says whether it is within the limit. */
	take(key: string): boolean {
		const now = this.#now();
		const entry = this.#hits.get(key);

		if (entry === undefined || now - entry.start >= this.#windowMs) {
			// A flood of distinct addresses must not grow this without end.
			if (entry === undefined && this.#hits.size >= this.#maxKeys) this.#prune(now);
			this.#hits.set(key, { start: now, count: 1 });
			return true;
		}

		entry.count++;
		return entry.count <= this.#limit;
	}

	#prune(now: number): void {
		for (const [key, entry] of this.#hits) {
			if (now - entry.start >= this.#windowMs) this.#hits.delete(key);
		}
		// Every window still open: forget them all rather than refuse a stranger.
		if (this.#hits.size >= this.#maxKeys) this.#hits.clear();
	}
}

/** One minute, per address. Reads are cheap and a sync makes several. */
export const READS_PER_MINUTE = 120;
/** A sync writes once, and up to five times when it keeps losing a race. */
export const WRITES_PER_MINUTE = 30;
