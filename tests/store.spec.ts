import { beforeEach, describe, expect, it } from 'vitest';
import { bearerMatches, constantTimeEqual } from '../src/lib/server/secret';
import {
	EXPIRY_MS,
	MAX_BLOB_BYTES,
	RoomStore,
	isRoomId,
	parsePutBody,
	roomPath,
	type Blobs
} from '../src/lib/server/store';

/** An in-memory stand-in for blob storage, so the contract is tested without a network. */
class FakeBlobs implements Blobs {
	files = new Map<string, { body: string; uploadedAt: Date }>();
	calls = { get: 0, put: 0, list: 0, del: 0 };

	constructor(private now = () => Date.now()) {}

	async get(pathname: string) {
		this.calls.get++;
		return this.files.get(pathname)?.body ?? null;
	}

	async put(pathname: string, body: string) {
		this.calls.put++;
		this.files.set(pathname, { body, uploadedAt: new Date(this.now()) });
	}

	async list(prefix: string) {
		this.calls.list++;
		return [...this.files.entries()]
			.filter(([path]) => path.startsWith(prefix))
			.map(([pathname, file]) => ({
				pathname,
				uploadedAt: file.uploadedAt,
				size: file.body.length
			}));
	}

	async del(pathname: string) {
		this.calls.del++;
		this.files.delete(pathname);
	}

	/** Backdates a file, for testing the sweep. */
	backdate(pathname: string, at: number) {
		const file = this.files.get(pathname)!;
		this.files.set(pathname, { ...file, uploadedAt: new Date(at) });
	}
}

const ROOM = 'a'.repeat(32);
const TOKEN = 'b'.repeat(32);
let clock = 1_000_000;
let blobs: FakeBlobs;
let store: RoomStore;

beforeEach(() => {
	clock = 1_000_000;
	blobs = new FakeBlobs(() => clock);
	store = new RoomStore(blobs, { now: () => clock });
});

describe('room ids', () => {
	it('accepts exactly 32 lowercase hex characters', () => {
		expect(isRoomId(ROOM)).toBe(true);
		expect(isRoomId('0123456789abcdef0123456789abcdef')).toBe(true);
	});

	it('rejects anything that could escape the namespace', () => {
		// This is the path-traversal defence: the id is interpolated into a path.
		expect(isRoomId('../etc/passwd')).toBe(false);
		expect(isRoomId('..')).toBe(false);
		expect(isRoomId(`${ROOM}/../x`)).toBe(false);
		expect(isRoomId(`rooms/${ROOM}`)).toBe(false);
	});

	it('rejects the wrong length, case or alphabet', () => {
		expect(isRoomId('a'.repeat(31))).toBe(false);
		expect(isRoomId('a'.repeat(33))).toBe(false);
		expect(isRoomId('A'.repeat(32))).toBe(false);
		expect(isRoomId('g'.repeat(32))).toBe(false);
		expect(isRoomId('')).toBe(false);
		expect(isRoomId(undefined)).toBe(false);
	});

	it('builds a path inside the namespace', () => {
		expect(roomPath(ROOM)).toBe(`rooms/${ROOM}.json`);
	});
});

describe('the PUT body', () => {
	it('accepts exactly the two fields', () => {
		expect(parsePutBody({ baseV: 0, blob: 'AQID' })).toStrictEqual({ baseV: 0, blob: 'AQID' });
	});

	it('rejects unknown fields rather than ignoring them', () => {
		expect(parsePutBody({ baseV: 0, blob: 'AQID', extra: 1 })).toBeNull();
		expect(parsePutBody({ baseV: 0 })).toBeNull();
		expect(parsePutBody({ blob: 'AQID' })).toBeNull();
	});

	it('rejects anything that is not base64', () => {
		expect(parsePutBody({ baseV: 0, blob: 'not base64!' })).toBeNull();
		expect(parsePutBody({ baseV: 0, blob: '' })).toBeNull();
	});

	it('rejects a version that is not a whole non-negative number', () => {
		expect(parsePutBody({ baseV: -1, blob: 'AQID' })).toBeNull();
		expect(parsePutBody({ baseV: 1.5, blob: 'AQID' })).toBeNull();
		expect(parsePutBody({ baseV: '1', blob: 'AQID' })).toBeNull();
	});

	it('rejects things that are not objects', () => {
		expect(parsePutBody(null)).toBeNull();
		expect(parsePutBody([])).toBeNull();
		expect(parsePutBody('x')).toBeNull();
	});
});

describe('reading and writing', () => {
	it('reports a room nobody has written as missing', async () => {
		expect(await store.read(ROOM, null)).toStrictEqual({ status: 'missing' });
	});

	it('writes the first version at baseV 0', async () => {
		const result = await store.write(ROOM, { baseV: 0, blob: 'AQID' }, TOKEN);
		expect(result).toStrictEqual({ status: 'ok', v: 1 });

		const read = await store.read(ROOM, null);
		expect(read.status).toBe('ok');
		if (read.status === 'ok') expect(read.room).toMatchObject({ v: 1, blob: 'AQID' });
	});

	it('returns 304-shaped unchanged when the version token matches', async () => {
		await store.write(ROOM, { baseV: 0, blob: 'AQID' }, TOKEN);

		const first = await store.read(ROOM, null);
		expect(first.status).toBe('ok');
		if (first.status !== 'ok') return;

		clock += 5000; // past the micro-cache
		const again = await store.read(ROOM, first.etag);

		expect(again).toStrictEqual({ status: 'unchanged', etag: first.etag });
	});

	it('sends the body again once the list has changed', async () => {
		await store.write(ROOM, { baseV: 0, blob: 'AQID' }, TOKEN);
		const first = await store.read(ROOM, null);
		if (first.status !== 'ok') throw new Error('expected ok');

		clock += 5000;
		await store.write(ROOM, { baseV: 1, blob: 'BAUG' }, TOKEN);

		const again = await store.read(ROOM, first.etag);
		expect(again.status).toBe('ok');
		if (again.status === 'ok') expect(again.room.blob).toBe('BAUG');
	});

	it('conflicts on a stale baseV and hands back the current state', async () => {
		await store.write(ROOM, { baseV: 0, blob: 'AQID' }, TOKEN);

		const result = await store.write(ROOM, { baseV: 0, blob: 'BAUG' }, TOKEN);

		expect(result.status).toBe('conflict');
		if (result.status === 'conflict') {
			expect(result.room).toMatchObject({ v: 1, blob: 'AQID' });
		}
	});

	it('conflicts when a first write arrives with a version already taken', async () => {
		const result = await store.write(ROOM, { baseV: 3, blob: 'AQID' }, TOKEN);
		expect(result.status).toBe('conflict');
	});

	it('refuses a blob over the cap', async () => {
		const huge = 'A'.repeat(MAX_BLOB_BYTES + 4);
		expect(await store.write(ROOM, { baseV: 0, blob: huge }, TOKEN)).toStrictEqual({
			status: 'too-large'
		});
	});

	it('reports a stored object it cannot parse as missing, not as an error', async () => {
		// Never build an oracle that distinguishes damaged from absent.
		await blobs.put(roomPath(ROOM), 'this is not json');
		expect(await store.read(ROOM, null)).toStrictEqual({ status: 'missing' });
	});

	it('collapses a burst of reads into one blob call', async () => {
		await store.write(ROOM, { baseV: 0, blob: 'AQID' }, TOKEN);
		blobs.calls.get = 0;

		await store.read(ROOM, null);
		await store.read(ROOM, null);
		await store.read(ROOM, null);

		// The write seeded the cache, so the burst costs nothing at all.
		expect(blobs.calls.get).toBe(0);

		clock += 5000;
		await store.read(ROOM, null);
		expect(blobs.calls.get).toBe(1);
	});

	it('does not serve a stale version to the device that just wrote it', async () => {
		/*
		 * Two writes inside the same millisecond, whose stored JSON happens to be
		 * the same length. An ETag built from the blob's upload time and size
		 * collides here and reports the second write as unchanged — which is a
		 * silently lost edit. The version token has to come from the document's
		 * own v.
		 */
		await store.write(ROOM, { baseV: 0, blob: 'AQID' }, TOKEN);
		const first = await store.read(ROOM, null);
		if (first.status !== 'ok') throw new Error('expected ok');

		// Immediately, inside the micro-cache window, with the clock unmoved.
		await store.write(ROOM, { baseV: 1, blob: 'BAUG' }, TOKEN);
		const again = await store.read(ROOM, first.etag);

		expect(again.status).toBe('ok');
		if (again.status === 'ok') {
			expect(again.room.blob).toBe('BAUG');
			expect(again.room.v).toBe(2);
		}
	});
});

describe('the sweep', () => {
	const OTHER = 'b'.repeat(32);

	it('deletes what nobody has written to in six months, and nothing else', async () => {
		await store.write(ROOM, { baseV: 0, blob: 'AQID' }, TOKEN);
		await store.write(OTHER, { baseV: 0, blob: 'BAUG' }, TOKEN);

		blobs.backdate(roomPath(ROOM), clock - EXPIRY_MS - 1000);

		const deleted = await store.sweep(clock);

		expect(deleted).toBe(1);
		expect(blobs.files.has(roomPath(ROOM))).toBe(false);
		expect(blobs.files.has(roomPath(OTHER))).toBe(true);
	});

	it('keeps a list edited just inside the window', async () => {
		await store.write(ROOM, { baseV: 0, blob: 'AQID' }, TOKEN);
		blobs.backdate(roomPath(ROOM), clock - EXPIRY_MS + 1000);

		expect(await store.sweep(clock)).toBe(0);
		expect(blobs.files.has(roomPath(ROOM))).toBe(true);
	});
});

describe('environment prefixes', () => {
	const OTHER = 'b'.repeat(32);

	it('leaves production unprefixed, so existing lists keep their paths', () => {
		// A prefix on production would orphan every list that already exists.
		expect(roomPath(ROOM)).toBe(`rooms/${ROOM}.json`);
		expect(roomPath(ROOM, '')).toBe(`rooms/${ROOM}.json`);
	});

	it('puts other environments somewhere else entirely', () => {
		expect(roomPath(ROOM, 'preview/')).toBe(`preview/rooms/${ROOM}.json`);
		expect(roomPath(ROOM, 'dev/')).toBe(`dev/rooms/${ROOM}.json`);
	});

	it("cannot read or overwrite another environment's list", async () => {
		const preview = new RoomStore(blobs, { cacheMs: 0, now: () => clock, prefix: 'preview/' });

		await store.write(ROOM, { baseV: 0, blob: 'AQID' }, TOKEN);

		// The same room id in preview is a different list, starting from nothing.
		expect(await preview.read(ROOM, null)).toStrictEqual({ status: 'missing' });

		await preview.write(ROOM, { baseV: 0, blob: 'BAUG' }, TOKEN);

		const live = await store.read(ROOM, null);
		expect(live.status).toBe('ok');
		if (live.status === 'ok') expect(live.room.blob).toBe('AQID');
	});

	it('sweeps only its own environment', async () => {
		/*
		 * The one that would actually hurt: a production cron reaching into a
		 * preview namespace, or the reverse, and deleting real lists.
		 */
		const preview = new RoomStore(blobs, { cacheMs: 0, now: () => clock, prefix: 'preview/' });

		await store.write(ROOM, { baseV: 0, blob: 'AQID' }, TOKEN);
		await preview.write(OTHER, { baseV: 0, blob: 'BAUG' }, TOKEN);

		blobs.backdate(roomPath(ROOM), clock - EXPIRY_MS - 1000);
		blobs.backdate(roomPath(OTHER, 'preview/'), clock - EXPIRY_MS - 1000);

		expect(await preview.sweep(clock)).toBe(1);

		// Production's blob is old too, and untouched by preview's sweep.
		expect(blobs.files.has(roomPath(ROOM))).toBe(true);
		expect(blobs.files.has(roomPath(OTHER, 'preview/'))).toBe(false);
	});
});

describe('the cron guard', () => {
	it('matches only the exact secret', () => {
		expect(bearerMatches('Bearer hunter2', 'hunter2')).toBe(true);
		expect(bearerMatches('Bearer hunter3', 'hunter2')).toBe(false);
		expect(bearerMatches('Bearer hunter2 ', 'hunter2')).toBe(false);
	});

	it('refuses anything that is not a bearer token', () => {
		expect(bearerMatches('hunter2', 'hunter2')).toBe(false);
		expect(bearerMatches('Basic hunter2', 'hunter2')).toBe(false);
		expect(bearerMatches(null, 'hunter2')).toBe(false);
	});

	it('refuses when no secret is configured, rather than letting everything through', () => {
		expect(bearerMatches('Bearer anything', undefined)).toBe(false);
		expect(bearerMatches('Bearer ', '')).toBe(false);
	});

	it('compares without short-circuiting on length', () => {
		expect(constantTimeEqual('abc', 'abc')).toBe(true);
		expect(constantTimeEqual('abc', 'abcd')).toBe(false);
		expect(constantTimeEqual('', '')).toBe(true);
	});
});
