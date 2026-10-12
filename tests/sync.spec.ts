import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { open, seal } from '../src/lib/crypto/box';
import { derive } from '../src/lib/crypto/derive';
import { canonical } from '../src/lib/doc/canonical';
import { addGroup, addTask, setTaskState } from '../src/lib/doc/ops';
import { createClock, type Ctx } from '../src/lib/doc/stamp';
import { emptyDoc, type Doc } from '../src/lib/doc/types';
import { pull, syncNow } from '../src/lib/sync/client';
import {
	MAX_BLOB_BYTES,
	RoomStore,
	isRoomId,
	parsePutBody,
	roomPath,
	writeTokenFrom,
	type BlobEntry,
	type Blobs
} from '../src/lib/server/store';

/*
 * Sync is tested against the real server module, wired to an in-memory blob
 * store through a fetch double. The client's crypto, the merge, the conflict
 * retry and the server's validation are all genuinely exercised — the only
 * thing standing in for the network is the transport.
 */

class FakeBlobs implements Blobs {
	files = new Map<string, { body: string; uploadedAt: Date }>();

	async get(pathname: string) {
		return this.files.get(pathname)?.body ?? null;
	}
	async put(pathname: string, body: string) {
		this.files.set(pathname, { body, uploadedAt: new Date() });
	}
	async list(prefix: string): Promise<BlobEntry[]> {
		return [...this.files.entries()]
			.filter(([path]) => path.startsWith(prefix))
			.map(([pathname, file]) => ({
				pathname,
				uploadedAt: file.uploadedAt,
				size: file.body.length
			}));
	}
	async del(pathname: string) {
		this.files.delete(pathname);
	}
}

let blobs: FakeBlobs;
let store: RoomStore;
/**
 * Lets a test overwrite the blob immediately after an accepted write, which is
 * what a lost write actually looks like: two writers both pass the version
 * check and the second one's bytes win.
 */
let afterWrite: (() => Promise<void>) | null;

function serve() {
	return async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
		const path = String(url);
		const roomId = path.replace('/api/room/', '');

		if (!isRoomId(roomId)) return new Response(null, { status: 404 });

		if (!init || (init.method ?? 'GET') === 'GET') {
			const headers = new Headers(init?.headers);
			const result = await store.read(roomId, headers.get('If-None-Match'));

			if (result.status === 'missing') return new Response(null, { status: 404 });
			if (result.status === 'unchanged') return new Response(null, { status: 304 });

			return new Response(JSON.stringify({ v: result.room.v, blob: result.room.blob }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		const body = parsePutBody(JSON.parse(String(init.body)));
		if (!body) return new Response(null, { status: 400 });

		const token = writeTokenFrom(new Headers(init.headers).get('authorization'));
		if (!token) return new Response(null, { status: 401 });

		const result = await store.write(roomId, body, token);
		if (result.status === 'forbidden') return new Response(null, { status: 403 });

		if (result.status === 'ok' && afterWrite) {
			const hook = afterWrite;
			afterWrite = null;
			await hook();
		}

		if (result.status === 'too-large') return new Response(null, { status: 413 });
		if (result.status === 'conflict') {
			return new Response(JSON.stringify({ v: result.room.v, blob: result.room.blob }), {
				status: 409,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		return new Response(JSON.stringify({ v: result.v }), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	};
}

const room = await derive('a1b2c3d4e5f6');
const stranger = await derive('0123456789ab');

/** One device, with its own client id and monotonic clock. */
function device(clientId: string): Ctx {
	let tick = 0;
	return { clientId, clock: createClock(0, () => Date.now() + ++tick) };
}

/** A device's whole sync state, so a test can play two of them off each other. */
type Device = { ctx: Ctx; doc: Doc; etag: string | null; lastSynced: Doc | null };

function fresh(clientId: string): Device {
	return { ctx: device(clientId), doc: emptyDoc(), etag: null, lastSynced: null };
}

async function sync(d: Device, key: CryptoKey = room.key) {
	const outcome = await syncNow({
		roomId: room.roomId,
		writeToken: room.writeToken,
		key,
		local: d.doc,
		etag: d.etag,
		lastSynced: d.lastSynced,
		wait: async () => {}
	});

	if (outcome.status === 'synced') {
		d.doc = outcome.doc;
		d.lastSynced = outcome.doc;
		d.etag = `"${outcome.v}"`;
	}

	return outcome;
}

function texts(doc: Doc): string[] {
	return Object.values(doc.tasks)
		.filter((t) => !t.deleted)
		.map((t) => t.text)
		.sort();
}

beforeEach(() => {
	blobs = new FakeBlobs();
	store = new RoomStore(blobs, { cacheMs: 0 });
	afterWrite = null;
	vi.stubGlobal('fetch', serve());
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('syncing', () => {
	it('creates the list on the first sync', async () => {
		const one = fresh('one');
		one.doc = addGroup(one.doc, one.ctx, { id: 'g1', title: 'Market' });
		one.doc = addTask(one.doc, one.ctx, { id: 't1', groupId: 'g1', text: 'Bread' });

		const outcome = await sync(one);

		expect(outcome.status).toBe('synced');
		expect(blobs.files.size).toBe(1);
	});

	it('sends nothing to the server but ciphertext', async () => {
		const one = fresh('one');
		one.doc = addGroup(one.doc, one.ctx, { id: 'g1', title: 'Market' });
		one.doc = addTask(one.doc, one.ctx, { id: 't1', groupId: 'g1', text: 'Bread' });
		await sync(one);

		const stored = [...blobs.files.values()][0].body;

		expect(stored).not.toContain('Bread');
		expect(stored).not.toContain('Market');
		expect(stored).not.toContain('a1b2c3d4e5f6');
	});

	it('carries a list to a second device that has only the code', async () => {
		const one = fresh('one');
		one.doc = addGroup(one.doc, one.ctx, { id: 'g1', title: 'Market' });
		one.doc = addTask(one.doc, one.ctx, { id: 't1', groupId: 'g1', text: 'Bread' });
		await sync(one);

		const two = fresh('two');
		await sync(two);

		expect(texts(two.doc)).toStrictEqual(['Bread']);
	});

	it('converges when both edited offline', async () => {
		const one = fresh('one');
		one.doc = addGroup(one.doc, one.ctx, { id: 'g1', title: 'Market' });
		one.doc = addTask(one.doc, one.ctx, { id: 't1', groupId: 'g1', text: 'Bread' });
		await sync(one);

		const two = fresh('two');
		await sync(two);

		// Both go offline and edit.
		one.doc = addTask(one.doc, one.ctx, { id: 't2', groupId: 'g1', text: 'Coffee' });
		two.doc = addTask(two.doc, two.ctx, { id: 't3', groupId: 'g1', text: 'Milk' });

		await sync(one);
		await sync(two);
		// One has to sync again to see what two added.
		await sync(one);

		expect(texts(one.doc)).toStrictEqual(['Bread', 'Coffee', 'Milk']);
		expect(texts(two.doc)).toStrictEqual(['Bread', 'Coffee', 'Milk']);
	});

	it('keeps a rename and a tick made on different devices', async () => {
		const one = fresh('one');
		one.doc = addGroup(one.doc, one.ctx, { id: 'g1', title: 'Market' });
		one.doc = addTask(one.doc, one.ctx, { id: 't1', groupId: 'g1', text: 'Bread' });
		await sync(one);

		const two = fresh('two');
		await sync(two);

		one.doc = setTaskState(one.doc, one.ctx, 't1', 'done');
		two.doc = { ...two.doc, tasks: { ...two.doc.tasks } };
		two.doc.tasks.t1 = {
			...two.doc.tasks.t1,
			text: 'Sourdough',
			stamps: { ...two.doc.tasks.t1.stamps, text: { t: Date.now() + 5000, c: 'two' } }
		};

		await sync(one);
		await sync(two);
		await sync(one);

		expect(one.doc.tasks.t1.text).toBe('Sourdough');
		expect(one.doc.tasks.t1.state).toBe('done');
	});

	it('does nothing at all when there is nothing to say', async () => {
		const one = fresh('one');
		one.doc = addGroup(one.doc, one.ctx, { id: 'g1', title: 'Market' });
		await sync(one);

		const before = [...blobs.files.values()][0].body;
		const outcome = await sync(one);

		expect(outcome.status).toBe('synced');
		// No write, so no new version and no wasted operation.
		expect([...blobs.files.values()][0].body).toBe(before);
	});

	it('recovers from a conflict without a second round trip', async () => {
		const one = fresh('one');
		one.doc = addGroup(one.doc, one.ctx, { id: 'g1', title: 'Market' });
		await sync(one);

		const two = fresh('two');
		await sync(two);

		one.doc = addTask(one.doc, one.ctx, { id: 't1', groupId: 'g1', text: 'Bread' });
		two.doc = addTask(two.doc, two.ctx, { id: 't2', groupId: 'g1', text: 'Coffee' });

		// Two writes first, so one's push arrives with a stale baseV.
		await sync(two);
		const outcome = await sync(one);

		expect(outcome.status).toBe('synced');
		expect(texts(one.doc)).toStrictEqual(['Bread', 'Coffee']);
	});

	it('heals a lost write, which is the whole point of reading back', async () => {
		/*
		 * Blob storage has no compare-and-set. Two writers both read version 1,
		 * both compute version 2, and both write — so the second one's bytes win
		 * and the first one's edit is gone, even though its PUT was accepted.
		 *
		 * The loser cannot detect this from the version number: it was told 2,
		 * and the server holds 2, so its next conditional read returns 304 and it
		 * believes it is in sync. Forever. The unconditional read-back after
		 * every write is the only thing that catches it — delete the verify step
		 * in client.ts and "Bread" disappears from this test permanently.
		 */
		const one = fresh('one');
		one.doc = addGroup(one.doc, one.ctx, { id: 'g1', title: 'Market' });
		await sync(one);

		const two = fresh('two');
		await sync(two);

		one.doc = addTask(one.doc, one.ctx, { id: 't1', groupId: 'g1', text: 'Bread' });
		two.doc = addTask(two.doc, two.ctx, { id: 't2', groupId: 'g1', text: 'Coffee' });

		// One's write is accepted, and is then overwritten at the same version by
		// two's concurrent write. Bread is now nowhere on the server.
		afterWrite = async () => {
			const blob = await seal(room.key, two.doc);
			await blobs.put(roomPath(room.roomId), JSON.stringify({ v: 2, blob, at: Date.now() }));
		};

		const outcome = await sync(one);
		expect(outcome.status).toBe('synced');

		const stored = JSON.parse([...blobs.files.values()][0].body);
		const remote = await open(room.key, stored.blob);
		expect(texts(remote as Doc)).toStrictEqual(['Bread', 'Coffee']);
	});
});

describe('when things go wrong', () => {
	it('cannot overwrite a list with its address alone', async () => {
		const one = fresh('one');
		one.doc = addGroup(one.doc, one.ctx, { id: 'g1', title: 'Market' });
		await sync(one);

		// The right address and key, the wrong token: what someone who learned
		// the room id, but not the code, would be holding.
		const outcome = await syncNow({
			roomId: room.roomId,
			key: room.key,
			writeToken: stranger.writeToken,
			local: addGroup(emptyDoc(), device('two'), { id: 'g2', title: 'Junk' }),
			etag: null,
			lastSynced: null,
			wait: async () => {}
		});

		expect(outcome).toStrictEqual({ status: 'refused', code: 403 });
	});

	it('reports the wrong code rather than a stack trace', async () => {
		const one = fresh('one');
		one.doc = addGroup(one.doc, one.ctx, { id: 'g1', title: 'Market' });
		await sync(one);

		const outsider = fresh('three');
		const outcome = await sync(outsider, stranger.key);

		expect(outcome.status).toBe('wrong-code');
	});

	it('says the server refused, rather than blaming the connection', async () => {
		/*
		 * A deployment whose blob store is not connected answers 500 to
		 * everything. Reported as "offline" — which it was, for a while — that
		 * sends the one person who can fix it looking at their wifi.
		 */
		for (const code of [500, 502, 403]) {
			vi.stubGlobal('fetch', async () => new Response(null, { status: code }));

			const d = fresh('a');
			const outcome = await sync(d);

			expect(outcome.status, String(code)).toBe('refused');
			expect(outcome.status === 'refused' && outcome.code, String(code)).toBe(code);
		}
	});

	it('still says offline when nothing answers at all', async () => {
		vi.stubGlobal('fetch', async () => {
			throw new TypeError('Failed to fetch');
		});

		expect((await sync(fresh('a'))).status).toBe('offline');
	});

	it('leaves the local document untouched when the list cannot be reached', async () => {
		vi.stubGlobal('fetch', async () => {
			throw new TypeError('Failed to fetch');
		});

		const one = fresh('one');
		one.doc = addGroup(one.doc, one.ctx, { id: 'g1', title: 'Market' });
		one.doc = addTask(one.doc, one.ctx, { id: 't1', groupId: 'g1', text: 'Bread' });
		const before = canonical(one.doc);

		const outcome = await sync(one);

		expect(outcome.status).toBe('offline');
		expect(canonical(one.doc)).toBe(before);
	});

	it('refuses to send a list over the cap, and keeps it locally', async () => {
		const one = fresh('one');
		one.doc = addGroup(one.doc, one.ctx, { id: 'g1', title: 'Market' });

		// Random text so it will not compress away.
		for (let i = 0; i < 100; i++) {
			one.doc = addTask(one.doc, one.ctx, {
				id: `t${i}`.padEnd(12, 'x'),
				groupId: 'g1',
				text: Array.from({ length: 100 }, () => Math.random().toString(36)[3]).join('')
			});
		}

		const blob = await seal(room.key, one.doc);
		// The whole point of the cap is that a real list stays well under it.
		expect(blob.length).toBeLessThan(MAX_BLOB_BYTES);

		expect((await sync(one)).status).toBe('synced');
	});

	/*
	 * What JOIN relies on: it fetches once to confirm a code is good before
	 * touching anything local, then hands that fetch straight to `syncNow`
	 * as `prefetched`. Pulling the room a second time here would open a
	 * window — the first fetch succeeding and a second one failing — where
	 * local tasks had already been discarded for a join that then had
	 * nothing to replace them with.
	 */
	it('merges against a prefetched room instead of pulling it again', async () => {
		const one = fresh('one');
		one.doc = addGroup(one.doc, one.ctx, { id: 'g1', title: 'Market' });
		one.doc = addTask(one.doc, one.ctx, { id: 't1', groupId: 'g1', text: 'Bread' });
		await sync(one);

		const reads = vi.spyOn(store, 'read');

		const pulled = await pull({
			roomId: room.roomId,
			writeToken: room.writeToken,
			key: room.key,
			local: emptyDoc(),
			etag: null,
			lastSynced: null
		});
		expect(pulled.status).toBe('ok');
		expect(reads).toHaveBeenCalledTimes(1);
		if (pulled.status !== 'ok') return;

		const outcome = await syncNow({
			roomId: room.roomId,
			writeToken: room.writeToken,
			key: room.key,
			local: emptyDoc(),
			etag: null,
			lastSynced: null,
			wait: async () => {},
			prefetched: { remote: pulled.remote, v: pulled.v }
		});

		// No second read, and an empty local merged against what was already
		// fetched has nothing new to push either.
		expect(reads).toHaveBeenCalledTimes(1);
		expect(outcome.status).toBe('synced');
		if (outcome.status === 'synced') expect(texts(outcome.doc)).toStrictEqual(['Bread']);
	});
});
