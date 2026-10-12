import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BlobEntry, Blobs } from '../src/lib/server/store';

/*
 * The API route itself, rather than a stand-in for it.
 *
 * tests/sync.spec.ts drives the client against a hand-written `fetch` double
 * that reproduces what the route is supposed to do. That is the right shape for
 * testing the client, but it means the route and the double could disagree and
 * both suites would still pass — the double would keep answering the way the
 * client expects while the deployed route did something else.
 *
 * So this file imports the real handlers and checks the contract the client
 * actually leans on: the status codes, the ETag, the state that has to travel
 * with a 409, and that nothing about a list is ever cacheable.
 *
 * Only the blob backend is faked, because it is the one part that genuinely
 * needs a network.
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

// A getter, so each test's fresh store picks up that test's blobs.
vi.mock('$lib/server/blobs', () => ({
	get vercelBlobs() {
		return blobs;
	}
}));

const ROOM = 'a'.repeat(32);
const BLOB = btoa('ciphertext');

/** The route builds its store at module scope, so each test needs a fresh one. */
async function route() {
	vi.resetModules();
	return import('../src/routes/api/room/[roomId]/+server');
}

const TOKEN = 'b'.repeat(32);

/** Where a request says it came from, for the rate limits. */
let address = '192.0.2.1';

function get(roomId: string, ifNoneMatch?: string) {
	const headers = new Headers();
	if (ifNoneMatch) headers.set('if-none-match', ifNoneMatch);
	return {
		params: { roomId },
		request: new Request('http://x/', { headers }),
		getClientAddress: () => address
	};
}

function put(roomId: string, body: unknown, token: string | null = TOKEN) {
	const text = JSON.stringify(body);
	const headers: Record<string, string> = { 'content-length': String(text.length) };
	if (token !== null) headers.authorization = `Bearer ${token}`;

	return {
		params: { roomId },
		request: new Request('http://x/', { method: 'PUT', body: text, headers }),
		getClientAddress: () => address
	};
}

/* The handlers take a full RequestEvent; these carry the parts they read. */
type Event = Parameters<Awaited<ReturnType<typeof route>>['GET']>[0];

beforeEach(() => {
	blobs = new FakeBlobs();
});

describe('the room route', () => {
	it('creates a list, then hands it back with a version', async () => {
		const { GET, PUT } = await route();

		const created = await PUT(put(ROOM, { baseV: 0, blob: BLOB }) as Event);
		expect(created.status).toBe(200);
		expect(await created.json()).toStrictEqual({ v: 1 });

		const read = await GET(get(ROOM) as Event);
		expect(read.status).toBe(200);
		expect(await read.json()).toStrictEqual({ v: 1, blob: BLOB });
	});

	it('tags a read so the next one can be conditional', async () => {
		const { GET, PUT } = await route();
		await PUT(put(ROOM, { baseV: 0, blob: BLOB }) as Event);

		const read = await GET(get(ROOM) as Event);
		const etag = read.headers.get('etag');
		expect(etag).toBeTruthy();

		// The whole point: the same token back means no body on the wire.
		const again = await GET(get(ROOM, etag!) as Event);
		expect(again.status).toBe(304);
		expect(again.headers.get('etag')).toBe(etag);
		expect(await again.text()).toBe('');
	});

	it('sends the body again once the list has moved on', async () => {
		const { GET, PUT } = await route();
		await PUT(put(ROOM, { baseV: 0, blob: BLOB }) as Event);
		const stale = (await GET(get(ROOM) as Event)).headers.get('etag');

		await PUT(put(ROOM, { baseV: 1, blob: btoa('newer') }) as Event);

		const read = await GET(get(ROOM, stale!) as Event);
		expect(read.status).toBe(200);
		expect(await read.json()).toStrictEqual({ v: 2, blob: btoa('newer') });
	});

	it('returns the current state with a conflict, so one round trip is enough', async () => {
		const { PUT } = await route();
		await PUT(put(ROOM, { baseV: 0, blob: BLOB }) as Event);

		// Someone else got there first.
		const conflict = await PUT(put(ROOM, { baseV: 0, blob: btoa('mine') }) as Event);

		expect(conflict.status).toBe(409);
		// The client decrypts this, merges, and pushes again without re-reading.
		expect(await conflict.json()).toStrictEqual({ v: 1, blob: BLOB });
	});

	it('answers the same 404 for a missing list and a malformed id', async () => {
		const { GET } = await route();

		const missing = await GET(get(ROOM) as Event);
		const malformed = await GET(get('../../etc/passwd') as Event);
		const wrongCase = await GET(get('A'.repeat(32)) as Event);

		for (const response of [missing, malformed, wrongCase]) {
			expect(response.status).toBe(404);
		}
		// Telling them apart would say which guessed room ids exist.
		expect(await malformed.text()).toBe(await missing.text());
	});

	it('never touches a blob for an id it has refused', async () => {
		const { GET, PUT } = await route();
		const reached = vi.spyOn(blobs, 'get');

		await GET(get('../../etc/passwd') as Event);
		await PUT(put('not-a-room', { baseV: 0, blob: BLOB }) as Event);

		expect(reached).not.toHaveBeenCalled();
		expect(blobs.files.size).toBe(0);
	});

	it('refuses a body that is not what it says it is', async () => {
		const { PUT } = await route();

		const garbage = await PUT({
			params: { roomId: ROOM },
			request: new Request('http://x/', {
				method: 'PUT',
				body: 'not json',
				headers: { authorization: `Bearer ${TOKEN}` }
			}),
			getClientAddress: () => address
		} as Event);
		expect(garbage.status).toBe(400);

		// Shape is checked, not merely parsed.
		for (const body of [
			{ baseV: 0 },
			{ baseV: -1, blob: BLOB },
			{ baseV: 0, blob: 'not base64!' }
		]) {
			expect((await PUT(put(ROOM, body) as Event)).status, JSON.stringify(body)).toBe(400);
		}
		expect(blobs.files.size).toBe(0);
	});

	it('turns away something far too big before reading it', async () => {
		const { PUT } = await route();

		const oversized = await PUT({
			params: { roomId: ROOM },
			request: new Request('http://x/', {
				method: 'PUT',
				body: JSON.stringify({ baseV: 0, blob: BLOB }),
				headers: {
					'content-length': String(10 * 1024 * 1024),
					authorization: `Bearer ${TOKEN}`
				}
			}),
			getClientAddress: () => address
		} as Event);

		expect(oversized.status).toBe(413);
	});

	it('marks every answer uncacheable, whatever it is', async () => {
		const { GET, PUT } = await route();

		const responses = [
			await GET(get(ROOM) as Event),
			await PUT(put(ROOM, { baseV: 0, blob: BLOB }) as Event),
			await GET(get(ROOM) as Event),
			await PUT(put(ROOM, { baseV: 0, blob: BLOB }) as Event),
			await GET(get('nope') as Event)
		];

		for (const response of responses) {
			expect(response.headers.get('cache-control'), String(response.status)).toBe('no-store');
		}
	});

	it('sends the server nothing it could read', async () => {
		const { GET, PUT } = await route();
		await PUT(put(ROOM, { baseV: 0, blob: BLOB }) as Event);
		await GET(get(ROOM) as Event);

		/*
		 * What is on disk is the ciphertext, a version, the timestamp the
		 * six-month sweep reads, and the hash of the write token. Nothing else —
		 * no room id, no plaintext, and nothing that could reconstruct either,
		 * nor the token itself.
		 */
		const stored = JSON.parse([...blobs.files.values()][0].body);
		expect(Object.keys(stored).sort()).toStrictEqual(['at', 'blob', 'v', 'w']);
		expect(stored.blob).toBe(BLOB);
		expect(stored.w).toMatch(/^[0-9a-f]{64}$/);
		expect(JSON.stringify(stored)).not.toContain(TOKEN);
	});
});

describe('who may write', () => {
	const OTHER_TOKEN = 'c'.repeat(32);

	it('refuses a write without a token, before reading the body', async () => {
		const { PUT } = await route();

		for (const token of [null, 'short', 'B'.repeat(32)]) {
			const refused = await PUT(put(ROOM, { baseV: 0, blob: BLOB }, token) as Event);
			expect(refused.status, String(token)).toBe(401);
		}
		expect(blobs.files.size).toBe(0);
	});

	it('lets only the token that made a list write to it again', async () => {
		const { GET, PUT } = await route();
		await PUT(put(ROOM, { baseV: 0, blob: BLOB }) as Event);

		const stranger = await PUT(put(ROOM, { baseV: 1, blob: btoa('junk') }, OTHER_TOKEN) as Event);
		expect(stranger.status).toBe(403);
		// Told nothing a read would not tell it.
		expect(await stranger.text()).toBe('');

		const owner = await PUT(put(ROOM, { baseV: 1, blob: btoa('newer') }) as Event);
		expect(owner.status).toBe(200);
		expect(await (await GET(get(ROOM) as Event)).json()).toStrictEqual({
			v: 2,
			blob: btoa('newer')
		});
	});

	it('never hands the token hash back', async () => {
		const { GET, PUT } = await route();
		await PUT(put(ROOM, { baseV: 0, blob: BLOB }) as Event);

		const read = await (await GET(get(ROOM) as Event)).text();
		const conflict = await (await PUT(put(ROOM, { baseV: 0, blob: BLOB }) as Event)).text();

		for (const body of [read, conflict])
			expect(Object.keys(JSON.parse(body)).sort()).toStrictEqual(['blob', 'v']);
	});

	it('lets a list written before tokens be claimed by the next write', async () => {
		const { PUT } = await route();
		// What a list looks like on disk from before the token existed.
		blobs.files.set(`dev/rooms/${ROOM}.json`, {
			body: JSON.stringify({ v: 4, blob: BLOB, at: 1 }),
			uploadedAt: new Date()
		});

		expect((await PUT(put(ROOM, { baseV: 4, blob: btoa('mine') }) as Event)).status).toBe(200);
		expect(
			(await PUT(put(ROOM, { baseV: 5, blob: btoa('junk') }, OTHER_TOKEN) as Event)).status
		).toBe(403);
	});
});

describe('how often', () => {
	it('turns an address away once it has written too often in a minute', async () => {
		const { PUT } = await route();
		const { WRITES_PER_MINUTE } = await import('../src/lib/server/limit');
		address = '198.51.100.7';

		for (let i = 0; i < WRITES_PER_MINUTE; i++) {
			const ok = await PUT(put(ROOM, { baseV: i, blob: BLOB }) as Event);
			expect(ok.status).toBe(200);
		}

		const limited = await PUT(put(ROOM, { baseV: WRITES_PER_MINUTE, blob: BLOB }) as Event);
		expect(limited.status).toBe(429);
		expect(limited.headers.get('cache-control')).toBe('no-store');

		// Somebody else is not held up by it.
		address = '198.51.100.8';
		const other = await PUT(put(ROOM, { baseV: WRITES_PER_MINUTE, blob: BLOB }) as Event);
		expect(other.status).toBe(200);
		address = '192.0.2.1';
	});
});
