import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Room } from '../src/lib/crypto/derive';
import { addGroup } from '../src/lib/doc/ops';
import { createClock } from '../src/lib/doc/stamp';
import { emptyDoc, type Doc } from '../src/lib/doc/types';
import type { SyncOutcome } from '../src/lib/sync/client';

/*
 * A sync or a join still out when the list changes has to drop what it brings
 * back. LEAVE is not refused while a sync is out, so the answer can arrive to
 * find another list open, and writing it there merges one list into another.
 *
 * The network and the key derivation are held open by hand, so the test can
 * change lists at exactly the moment a real tap would.
 */

type Gate<T> = { promise: Promise<T>; resolve: (value: T) => void; reject: (e: unknown) => void };

function gate<T>(): Gate<T> {
	let resolve!: (value: T) => void;
	let reject!: (e: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

const derives: { code: string; gate: Gate<Room> }[] = [];
const syncs: Gate<SyncOutcome>[] = [];
const pulls: Gate<unknown>[] = [];

vi.mock('$app/environment', () => ({
	browser: true,
	dev: false,
	building: false,
	version: 'test'
}));

vi.mock('../src/lib/crypto/derive', async (original) => {
	const real = await original<typeof import('../src/lib/crypto/derive')>();
	return {
		...real,
		derive: vi.fn((code: string) => {
			const g = gate<Room>();
			derives.push({ code, gate: g });
			return g.promise;
		})
	};
});

vi.mock('../src/lib/sync/client', async (original) => {
	const real = await original<typeof import('../src/lib/sync/client')>();
	return {
		...real,
		syncNow: vi.fn(() => {
			const g = gate<SyncOutcome>();
			syncs.push(g);
			return g.promise;
		}),
		pull: vi.fn(() => {
			const g = gate<unknown>();
			pulls.push(g);
			return g.promise;
		})
	};
});

const { sync } = await import('../src/lib/state/sync.svelte');
const { sheet } = await import('../src/lib/state/doc.svelte');
const { keysFor } = await import('../src/lib/state/storage');

const CODE_A = 'aaaaaaaaaaaa';
const CODE_B = 'bbbbbbbbbbbb';

function room(code: string): Room {
	return { roomId: `room-${code}`, key: {} as CryptoKey, writeToken: `token-${code}` };
}

function remoteDoc(title: string): Doc {
	const ctx = { clientId: 'far', clock: createClock(0, () => 1) };
	return addGroup(emptyDoc(), ctx, { id: `g-${title}`, title });
}

/** Lets every pending continuation run. */
const settle = () => new Promise((r) => setTimeout(r, 0));

let store: Map<string, string>;

beforeEach(() => {
	derives.length = 0;
	syncs.length = 0;
	pulls.length = 0;
	store = new Map();
	vi.stubGlobal('localStorage', {
		getItem: (k: string) => store.get(k) ?? null,
		setItem: (k: string, v: string) => void store.set(k, v),
		removeItem: (k: string) => void store.delete(k)
	});
	store.set(keysFor('listA').code, CODE_A);
	store.set(keysFor('listB').code, CODE_B);
	sheet.switchTo(keysFor('listA'));
	sync.switchTo(keysFor('listA'));
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('a sync whose list has gone', () => {
	it('does not write what came back onto the list open now', async () => {
		const running = sync.sync({ force: true });
		derives[0].gate.resolve(room(CODE_A));
		await settle();
		expect(syncs).toHaveLength(1);

		sheet.switchTo(keysFor('listB'));
		sync.switchTo(keysFor('listB'));
		const before = sheet.doc;

		syncs[0].resolve({ status: 'synced', doc: remoteDoc('From A'), v: 7 });

		expect(await running).toBeNull();
		expect(sheet.doc).toBe(before);
		expect(store.has(keysFor('listB').version)).toBe(false);
		expect(store.has(keysFor('listB').synced)).toBe(false);
		expect(store.has(keysFor('listA').version)).toBe(false);
		expect(sync.busy).toBe(false);
	});

	it('leaves the list open now neither busy nor cooling', async () => {
		const running = sync.sync({ force: true });
		derives[0].gate.resolve(room(CODE_A));
		await settle();

		sync.switchTo(keysFor('listB'));
		// Not boiling, and free to be left, while the other list's request is out.
		expect(sync.busy).toBe(false);

		const lastSyncAt = sync.lastSyncAt;
		syncs[0].resolve({ status: 'synced', doc: remoteDoc('From A'), v: 7 });

		expect(await running).toBeNull();
		expect(sync.lastSyncAt).toBe(lastSyncAt);
	});

	it('forgets what the last attempt said along with the list', async () => {
		sync.message = 'about the list that went';
		sync.forget();
		expect(sync.message).toBeNull();
	});

	it('does not say its failure over the list open now', async () => {
		const running = sync.sync({ force: true });
		derives[0].gate.resolve(room(CODE_A));
		await settle();

		sync.switchTo(keysFor('listB'));
		syncs[0].reject(new Error('boom'));

		expect(await running).toBeNull();
		expect(sync.message).toBeNull();
		expect(sync.status).not.toBe('offline');
	});

	it('does not say an unreachable list over the one open now', async () => {
		const running = sync.sync({ force: true });
		derives[0].gate.resolve(room(CODE_A));
		await settle();

		sync.switchTo(keysFor('listB'));
		syncs[0].resolve({ status: 'offline' });

		expect(await running).toBeNull();
		expect(sync.message).toBeNull();
	});

	it('does not keep a key derived for a list that has gone', async () => {
		const first = sync.sync({ force: true });
		sync.switchTo(keysFor('listB'));
		derives[0].gate.resolve(room(CODE_A));
		expect(await first).toBeNull();
		expect(syncs).toHaveLength(0);

		const second = sync.sync({ force: true });
		await settle();
		// Derived afresh under B's own code, not A's room reused.
		expect(derives.map((d) => d.code)).toEqual([CODE_A, CODE_B]);
		derives[1].gate.resolve(room(CODE_B));
		await settle();
		syncs[0].resolve({ status: 'synced', doc: remoteDoc('B'), v: 2 });
		const outcome = await second;
		expect(outcome?.status).toBe('synced');
		expect(store.get(keysFor('listB').version)).toBe('"2"');
	});

	it('drops a list that was forgotten while the sync was out', async () => {
		const running = sync.sync({ force: true });
		derives[0].gate.resolve(room(CODE_A));
		await settle();

		sync.forget();
		syncs[0].resolve({ status: 'synced', doc: remoteDoc('Back from the dead'), v: 3 });

		expect(await running).toBeNull();
		expect(store.has(keysFor('listA').version)).toBe(false);
		expect(Object.values(sheet.doc.groups).some((g) => g.title === 'Back from the dead')).toBe(
			false
		);
	});

	it('still applies an answer when nothing changed', async () => {
		const running = sync.sync({ force: true });
		derives[0].gate.resolve(room(CODE_A));
		await settle();
		syncs[0].resolve({ status: 'synced', doc: remoteDoc('Kept'), v: 4 });

		expect((await running)?.status).toBe('synced');
		expect(store.get(keysFor('listA').version)).toBe('"4"');
	});
});

describe('a join whose list has gone', () => {
	it('sends nothing when the list goes during the derive', async () => {
		const joining = sync.join(CODE_B, true);
		sync.switchTo(keysFor('listB'));
		derives[0].gate.resolve(room(CODE_B));

		expect(await joining).toBeNull();
		expect(pulls).toHaveLength(0);
	});

	it('writes no code when the list goes during the pull', async () => {
		store.delete(keysFor('listA').code);
		sync.switchTo(keysFor('listA'));

		const joining = sync.join(CODE_B, true);
		derives[0].gate.resolve(room(CODE_B));
		await settle();
		expect(pulls).toHaveLength(1);

		sync.switchTo(keysFor('listB'));
		pulls[0].resolve({ status: 'ok', remote: remoteDoc('Joined'), v: 1 });

		expect(await joining).toBeNull();
		expect(store.has(keysFor('listA').code)).toBe(false);
		expect(syncs).toHaveLength(0);
	});
});

describe('a refused write', () => {
	it('says the code cannot change the list, rather than a status number', async () => {
		const running = sync.sync({ force: true });
		derives[0].gate.resolve(room(CODE_A));
		await settle();
		syncs[0].resolve({ status: 'refused', code: 403 });
		await running;

		expect(sync.message).not.toMatch(/403/);
		expect(sync.message).toMatch(/not change it/);
	});

	it('still names the number for any other refusal', async () => {
		const running = sync.sync({ force: true });
		derives[0].gate.resolve(room(CODE_A));
		await settle();
		syncs[0].resolve({ status: 'refused', code: 502 });
		await running;

		expect(sync.message).toMatch(/502/);
	});
});
