import { open, seal } from '$lib/crypto/box';
import { canonical } from '$lib/doc/canonical';
import { clampStamps } from '$lib/doc/clamp';
import { gc } from '$lib/doc/gc';
import { merge } from '$lib/doc/merge';
import type { Doc } from '$lib/doc/types';
import { validateDoc } from '$lib/doc/validate';
import { getRoom, putRoom, type RoomSnapshot } from './api';
import { trace } from './trace';

/**
 * One sync, start to finish, on the SYNC tap and nowhere else.
 *
 * There is no poll interval, no push debounce, and no queue that flushes on
 * reconnect. Pulling was the expensive part — every eight seconds, forever, per
 * open tab — and pushing without being asked is what turns a shared list into
 * something that happens to you. So both directions run here, together, when
 * someone asks for them.
 *
 * The cost is stated plainly rather than designed around: an edit nobody syncs
 * reaches nobody, and dies with the device.
 */

export type SyncOutcome =
	/** Everything matches: nothing to send, nothing to fetch. */
	| { status: 'synced'; doc: Doc; v: number }
	/** Nothing answered at all. The local document is untouched. */
	| { status: 'offline' }
	/** Our own origin answered and said no — a deployment problem, not a network one. */
	| { status: 'refused'; code: number }
	/** Decryption failed — almost always the wrong code. */
	| { status: 'wrong-code' }
	/** It decrypted but is not a document we can trust. */
	| { status: 'damaged' }
	/** Over the 128 KB cap. Nothing was written. */
	| { status: 'too-large' }
	/** Kept losing a race with another writer, or asked the server too often. */
	| { status: 'busy' }
	/** Something none of the above expected to happen — caught, not swallowed. */
	| { status: 'error'; message: string };

export type SyncInput = {
	roomId: string;
	key: CryptoKey;
	/** Sent with every write, so the server can tell the list's keepers apart. */
	writeToken: string;
	local: Doc;
	/** Version token from the last successful read, for a conditional fetch. */
	etag: string | null;
	/** What the remote held at that version, so a 304 has something to merge. */
	lastSynced: Doc | null;
	now?: () => number;
	/** Overridable so tests do not sit through the backoff. */
	wait?: (ms: number) => Promise<void>;
	/**
	 * Skips the initial pull, merging against this instead. JOIN already
	 * fetches the room once to confirm the code is good before touching
	 * anything local (see `join()` in state/sync.svelte.ts) — pulling a
	 * second time here would open a window where that first fetch succeeds
	 * but this one fails afterwards, leaving a wiped local doc with nothing
	 * to replace it.
	 */
	prefetched?: { remote: Doc | null; v: number };
};

const ATTEMPTS = 5;

export async function syncNow(input: SyncInput): Promise<SyncOutcome> {
	const now = input.now ?? Date.now;
	const wait = input.wait ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

	let remote: Doc | null;
	let remoteV: number;

	if (input.prefetched) {
		remote = input.prefetched.remote;
		remoteV = input.prefetched.v;
	} else {
		const pulled = await pull(input);
		if (pulled.status !== 'ok') return pulled.outcome;
		remote = pulled.remote;
		remoteV = pulled.v;
	}

	for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
		// Clamp before merging, never inside it: one device with a wrong clock
		// must not win every field forever, and merge has to stay pure.
		const incoming = remote ? clampStamps(remote, now()) : null;
		const merged = gc(incoming ? merge(input.local, incoming) : input.local, now());

		// Nothing to say: the remote already holds everything we have.
		if (incoming && canonical(merged) === canonical(incoming)) {
			trace(`sync: matched, nothing to push (${countOf(merged)})`);
			return { status: 'synced', doc: merged, v: remoteV };
		}

		trace(`sync: pushing #${attempt + 1} (${countOf(merged)})`);
		const blob = await seal(input.key, merged);
		const result = await putRoom(input.roomId, { baseV: remoteV, blob }, input.writeToken);

		if (result.status === 'offline') return { status: 'offline' };
		if (result.status === 'slow') return { status: 'busy' };
		if (result.status === 'refused') return { status: 'refused', code: result.code };
		if (result.status === 'too-large') return { status: 'too-large' };

		if (result.status === 'conflict') {
			const opened = await decrypt(input.key, result.room);
			if (opened.status !== 'ok') {
				trace(`sync: conflict winner didn't decrypt (${opened.outcome.status})`);
				return opened.outcome;
			}

			trace(`sync: conflict, retrying against v${result.room.v}`);
			remote = opened.doc;
			remoteV = result.room.v;

			// Jittered, so two phones that conflicted do not retry in lockstep.
			await wait(40 * 2 ** attempt + Math.random() * 60);
			continue;
		}

		/*
		 * The write landed — but Vercel Blob has no compare-and-set, so a
		 * simultaneous writer could have overwritten us between the read and the
		 * write. Read back once and check our own edits actually survived. This
		 * is what makes a lost write self-healing rather than merely survivable
		 * in principle.
		 */
		const check = await verify(input, merged);
		if (check.status === 'ok') {
			trace('sync: verified');
			return { status: 'synced', doc: merged, v: result.v };
		}
		if (check.status !== 'retry') return check.outcome;

		trace('sync: verify found a newer write, retrying');
		remote = check.remote;
		remoteV = check.v;
		await wait(40 * 2 ** attempt + Math.random() * 60);
	}

	trace('sync: out of attempts');
	return { status: 'busy' };
}

function countOf(doc: Doc): string {
	const groups = Object.values(doc.groups).filter((g) => !g.deleted).length;
	const tasks = Object.values(doc.tasks).filter((t) => !t.deleted).length;
	return `${groups}g/${tasks}t`;
}

export type Pulled =
	{ status: 'ok'; remote: Doc | null; v: number } | { status: 'stop'; outcome: SyncOutcome };

/**
 * Fetches and decrypts one room, without merging or pushing anything.
 *
 * JOIN calls this directly (with `etag`/`lastSynced` both null, always a
 * full fetch) to confirm a code is good — reachable, and either decryptable
 * or genuinely new — before touching anything local, then hands the result
 * straight to `syncNow` as `prefetched` so the merge runs against the exact
 * same fetch rather than a second one that could disagree with, or fail
 * after, the first.
 */
export async function pull(input: SyncInput): Promise<Pulled> {
	/*
	 * A 304 is answered with `lastSynced`, so without one there is nothing to
	 * merge against: the remote would be taken as empty at the current version,
	 * and the push that follows would replace it with this device's copy alone.
	 */
	const result = await getRoom(input.roomId, input.lastSynced ? input.etag : null);

	if (result.status === 'offline') return { status: 'stop', outcome: { status: 'offline' } };
	if (result.status === 'slow') return { status: 'stop', outcome: { status: 'busy' } };
	if (result.status === 'refused') {
		return { status: 'stop', outcome: { status: 'refused', code: result.code } };
	}

	// Nobody has written this list yet. Ours becomes the first version.
	if (result.status === 'missing') return { status: 'ok', remote: null, v: 0 };

	if (result.status === 'unchanged') {
		// The server has exactly what we last saw, so what we last saw is what
		// we merge against — no need to fetch it again.
		return { status: 'ok', remote: input.lastSynced, v: versionFrom(input.etag) };
	}

	const opened = await decrypt(input.key, result.room);
	if (opened.status !== 'ok') {
		trace(`pull: ${opened.outcome.status}`);
		return { status: 'stop', outcome: opened.outcome };
	}

	trace(`pull: ${countOf(opened.doc)}`);
	return { status: 'ok', remote: opened.doc, v: result.room.v };
}

type Opened = { status: 'ok'; doc: Doc } | { status: 'stop'; outcome: SyncOutcome };

async function decrypt(key: CryptoKey, room: RoomSnapshot): Promise<Opened> {
	if (room.blob === '') return { status: 'ok', doc: { v: 1, groups: {}, tasks: {} } };

	const plain = await open(key, room.blob);
	// A failed decrypt is the expected shape of a wrong code, not an error.
	if (plain === null) return { status: 'stop', outcome: { status: 'wrong-code' } };

	const doc = validateDoc(plain);
	if (!doc) return { status: 'stop', outcome: { status: 'damaged' } };

	return { status: 'ok', doc };
}

type Verified =
	| { status: 'ok' }
	| { status: 'retry'; remote: Doc; v: number }
	| { status: 'stop'; outcome: SyncOutcome };

async function verify(input: SyncInput, pushed: Doc): Promise<Verified> {
	const result = await getRoom(input.roomId, null);

	// If the read-back cannot happen, the write still went out; treat it as
	// done rather than pushing again blindly.
	if (result.status !== 'ok') return { status: 'ok' };

	const opened = await decrypt(input.key, result.room);
	if (opened.status !== 'ok') return { status: 'stop', outcome: opened.outcome };

	// Merging ours into what came back should change nothing — if it does, some
	// of what we pushed is missing and another writer won.
	const remote = opened.doc;
	if (canonical(merge(remote, pushed)) === canonical(remote)) return { status: 'ok' };

	return { status: 'retry', remote, v: result.room.v };
}

/** The ETag is the document version in quotes, set by the server. */
function versionFrom(etag: string | null): number {
	const value = Number(etag?.replace(/^W\//, '').replaceAll('"', ''));
	return Number.isInteger(value) && value >= 0 ? value : 0;
}
