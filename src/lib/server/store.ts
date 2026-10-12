/**
 * The only module in the app that talks to blob storage.
 *
 * The browser never reaches the blob host: reads and writes both go to /api on
 * our own origin and the function fetches server-side. That costs an
 * invocation per sync and buys three things worth more — a CSP with
 * `connect-src 'self'` and nothing else, no CORS surface at all, and a store
 * that can stay private.
 *
 * Nothing here imports from src/lib/crypto, and it never could usefully: what
 * arrives is ciphertext and a room id, and that is all the server is ever in a
 * position to see.
 */

import { createHash } from 'node:crypto';
import { constantTimeEqual } from './secret';

/**
 * Validated before it touches a blob path, in every handler, always.
 *
 * This is the path-traversal defence: the id is interpolated into
 * `rooms/${roomId}.json`, so a roomId of `../` would write outside the
 * namespace. Deliberately duplicated rather than imported from
 * src/lib/crypto/derive.ts — server code must not depend on that module, and
 * scripts/gates.sh fails the build if it does.
 */
export const ROOM_ID_PATTERN = /^[0-9a-f]{32}$/;

/** 128 KB. Anything larger is refused with 413 rather than stored. */
export const MAX_BLOB_BYTES = 128 * 1024;

/** Six months since the last write. Editing keeps a list alive; reading does not. */
export const EXPIRY_MS = 182 * 24 * 60 * 60 * 1000;

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * What a client proves it may write with: 32 hex characters derived from the
 * code alongside the room id, and independent of both it and the key. Knowing
 * a room's address is enough to read its ciphertext and no longer enough to
 * overwrite it.
 */
export const WRITE_TOKEN_PATTERN = /^[0-9a-f]{32}$/;
const TOKEN_HASH = /^[0-9a-f]{64}$/;

/**
 * `w` is the hash of the write token, set by the first write that carried one
 * and checked on every write after. Only the hash is stored, so the store
 * itself holds nothing a write could be made with. Rooms written before the
 * token existed have none, and are claimed by the next write that brings one.
 */
export type StoredRoom = { v: number; blob: string; at: number; w?: string };

export type BlobEntry = { pathname: string; uploadedAt: Date; size: number };

/**
 * The slice of blob storage this app needs, so the routes can be tested
 * against an in-memory double rather than the network.
 */
export interface Blobs {
	get(pathname: string): Promise<string | null>;
	put(pathname: string, body: string): Promise<void>;
	list(prefix: string): Promise<BlobEntry[]>;
	del(pathname: string): Promise<void>;
}

export type PutBody = { baseV: number; blob: string };

export type ReadResult =
	| { status: 'missing' }
	| { status: 'unchanged'; etag: string }
	| { status: 'ok'; etag: string; room: StoredRoom };

export type WriteResult =
	| { status: 'ok'; v: number }
	| { status: 'conflict'; room: StoredRoom }
	| { status: 'too-large' }
	| { status: 'forbidden' };

/**
 * Where a room lives, optionally under an environment prefix.
 *
 * Production's prefix is empty, deliberately: adding one there would change
 * every existing path and orphan every list that already exists, exactly as
 * changing the salt would. Only the non-production environments are namespaced
 * away from it.
 */
export function roomPath(roomId: string, prefix = ''): string {
	return `${prefix}rooms/${roomId}.json`;
}

export function isRoomId(value: string | undefined): value is string {
	return typeof value === 'string' && ROOM_ID_PATTERN.test(value);
}

export function isWriteToken(value: string | null | undefined): value is string {
	return typeof value === 'string' && WRITE_TOKEN_PATTERN.test(value);
}

/** `Authorization: Bearer <token>`, or null when it is missing or malformed. */
export function writeTokenFrom(header: string | null): string | null {
	const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
	return isWriteToken(token) ? token : null;
}

export function hashToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

/**
 * The version token a conditional read compares against.
 *
 * Derived from the document's own `v`, which increments on every accepted
 * write. An earlier draft used the blob's upload time and size instead, to
 * answer a conditional read without fetching the body — but two writes in the
 * same millisecond whose JSON happens to be the same length produce an
 * identical token, and the second one is then reported as unchanged. The saved
 * fetch is not worth a lost edit.
 */
export function etagFor(room: StoredRoom): string {
	return `"${room.v}"`;
}

/**
 * Validates a PUT body strictly: exactly these two fields, nothing else.
 * Unknown fields are rejected rather than ignored, so a future field cannot be
 * smuggled past a handler that predates it.
 */
export function parsePutBody(value: unknown): PutBody | null {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;

	const keys = Object.keys(value);
	if (keys.length !== 2 || !keys.includes('baseV') || !keys.includes('blob')) return null;

	const { baseV, blob } = value as Record<string, unknown>;

	if (typeof baseV !== 'number' || !Number.isInteger(baseV) || baseV < 0) return null;
	if (typeof blob !== 'string' || blob.length === 0 || !BASE64.test(blob)) return null;

	return { baseV, blob };
}

export class RoomStore {
	#blobs: Blobs;
	/**
	 * Collapses a burst of reads from several devices into one blob call.
	 * Two seconds is short enough that a sync never serves a stale version to
	 * the person who just wrote it — the cache is dropped on write regardless —
	 * and long enough to matter on a warm instance.
	 */
	#cache = new Map<string, { at: number; room: StoredRoom | null }>();
	#ttl: number;
	#now: () => number;
	#prefix: string;

	constructor(
		blobs: Blobs,
		options: { cacheMs?: number; now?: () => number; prefix?: string } = {}
	) {
		this.#blobs = blobs;
		this.#ttl = options.cacheMs ?? 2000;
		this.#now = options.now ?? Date.now;
		this.#prefix = options.prefix ?? '';
	}

	async read(roomId: string, ifNoneMatch: string | null): Promise<ReadResult> {
		const room = await this.#load(roomPath(roomId, this.#prefix));

		// A stored object we cannot parse is reported as missing rather than as
		// an error: never build an oracle that tells the difference.
		if (!room) return { status: 'missing' };

		const etag = etagFor(room);
		if (ifNoneMatch !== null && matches(ifNoneMatch, etag)) {
			return { status: 'unchanged', etag };
		}

		return { status: 'ok', etag, room };
	}

	/**
	 * Vercel Blob has no compare-and-set, so this read-then-write can lose a
	 * race between two simultaneous writers. That is accepted rather than
	 * papered over: the client re-reads after every write and pushes again if
	 * its own stamps did not come back, which is what actually makes a lost
	 * write self-healing.
	 */
	async write(roomId: string, body: PutBody, token: string): Promise<WriteResult> {
		if (!isWriteToken(token)) return { status: 'forbidden' };
		if (byteLength(body.blob) > MAX_BLOB_BYTES) return { status: 'too-large' };

		const path = roomPath(roomId, this.#prefix);
		const existing = parseStored((await this.#blobs.get(path)) ?? '');
		const current = existing?.v ?? 0;
		const hash = hashToken(token);

		// Checked before the version, so a refused writer is told nothing a
		// read would not have told it anyway.
		if (existing?.w !== undefined && !constantTimeEqual(existing.w, hash)) {
			return { status: 'forbidden' };
		}

		if (body.baseV !== current) {
			return { status: 'conflict', room: existing ?? { v: 0, blob: '', at: 0 } };
		}

		const next: StoredRoom = {
			v: current + 1,
			blob: body.blob,
			at: this.#now(),
			w: existing?.w ?? hash
		};
		await this.#blobs.put(path, JSON.stringify(next));
		this.#cache.set(path, { at: this.#now(), room: next });

		return { status: 'ok', v: next.v };
	}

	/** The whole cleanup story: no TTL, no touch-on-read, no per-request logic. */
	async sweep(now = this.#now(), maxAge = EXPIRY_MS): Promise<number> {
		const cutoff = now - maxAge;
		// Scoped to this environment's prefix, so a production sweep can never
		// reach a preview's blobs — and vice versa.
		const entries = await this.#blobs.list(`${this.#prefix}rooms/`);

		let deleted = 0;
		for (const entry of entries) {
			if (entry.uploadedAt.getTime() >= cutoff) continue;
			await this.#blobs.del(entry.pathname);
			this.#cache.delete(entry.pathname);
			deleted++;
		}

		return deleted;
	}

	async #load(path: string): Promise<StoredRoom | null> {
		const cached = this.#cache.get(path);
		if (cached && this.#now() - cached.at < this.#ttl) return cached.room;

		const room = parseStored((await this.#blobs.get(path)) ?? '');
		this.#cache.set(path, { at: this.#now(), room });
		return room;
	}
}

function matches(ifNoneMatch: string, etag: string): boolean {
	return ifNoneMatch
		.split(',')
		.map((value) => value.trim().replace(/^W\//, ''))
		.includes(etag);
}

function parseStored(body: string): StoredRoom | null {
	try {
		const value: unknown = JSON.parse(body);
		if (typeof value !== 'object' || value === null) return null;

		const { v, blob, at, w } = value as Record<string, unknown>;
		if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) return null;
		if (typeof blob !== 'string') return null;
		if (typeof at !== 'number') return null;
		if (w !== undefined && (typeof w !== 'string' || !TOKEN_HASH.test(w))) return null;

		return w === undefined ? { v, blob, at } : { v, blob, at, w };
	} catch {
		return null;
	}
}

function byteLength(value: string): number {
	return new TextEncoder().encode(value).length;
}
