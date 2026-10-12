import { json, type RequestHandler } from '@sveltejs/kit';
import { vercelBlobs } from '$lib/server/blobs';
import { blobPrefix } from '$lib/server/env';
import { RateLimiter, READS_PER_MINUTE, WRITES_PER_MINUTE } from '$lib/server/limit';
import {
	RoomStore,
	isRoomId,
	parsePutBody,
	writeTokenFrom,
	MAX_BLOB_BYTES
} from '$lib/server/store';

/*
 * One list, one endpoint. The server sees a room id and a base64 blob and
 * nothing else — no plaintext, no key, and nothing that could reconstruct
 * either.
 *
 * Nothing is logged per request. Not the room id, not the body, not the IP: a
 * log line containing room ids is a list of everyone's lists. The rate limits
 * below hold addresses in memory for a minute to count them, and write them
 * nowhere.
 */

export const prerender = false;

const store = new RoomStore(vercelBlobs, { prefix: blobPrefix() });

/** Every response, so nothing about a list is ever cached anywhere. */
const NO_STORE = { 'Cache-Control': 'no-store' };

/**
 * The same 404 for a missing list, a malformed room id, and a stored object
 * that will not parse. Distinguishing them would be an oracle telling an
 * attacker which guessed room ids exist.
 */
function notFound() {
	return new Response(null, { status: 404, headers: NO_STORE });
}

const reads = new RateLimiter(READS_PER_MINUTE, 60_000);
const writes = new RateLimiter(WRITES_PER_MINUTE, 60_000);

function tooMany() {
	return new Response(null, { status: 429, headers: { ...NO_STORE, 'Retry-After': '60' } });
}

/** The address the platform says the request came from. */
function addressOf(event: { getClientAddress?: () => string }): string {
	try {
		return event.getClientAddress?.() ?? 'unknown';
	} catch {
		return 'unknown';
	}
}

export const GET: RequestHandler = async (event) => {
	const { params, request } = event;
	if (!reads.take(addressOf(event))) return tooMany();

	// Validated before it can reach a blob path.
	if (!isRoomId(params.roomId)) return notFound();

	const result = await store.read(params.roomId, request.headers.get('if-none-match'));

	if (result.status === 'missing') return notFound();

	if (result.status === 'unchanged') {
		// The common case: no body at all on the wire.
		return new Response(null, {
			status: 304,
			headers: { ...NO_STORE, ETag: result.etag }
		});
	}

	return json(
		{ v: result.room.v, blob: result.room.blob },
		{ headers: { ...NO_STORE, ETag: result.etag } }
	);
};

export const PUT: RequestHandler = async (event) => {
	const { params, request } = event;
	if (!writes.take(addressOf(event))) return tooMany();

	if (!isRoomId(params.roomId)) return notFound();

	// No token, no write — before the body is so much as read.
	const token = writeTokenFrom(request.headers.get('authorization'));
	if (!token) return new Response(null, { status: 401, headers: NO_STORE });

	if (Number(request.headers.get('content-length')) > MAX_BLOB_BYTES * 2) {
		return new Response(null, { status: 413, headers: NO_STORE });
	}

	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return new Response(null, { status: 400, headers: NO_STORE });
	}

	const body = parsePutBody(raw);
	if (!body) return new Response(null, { status: 400, headers: NO_STORE });

	const result = await store.write(params.roomId, body, token);

	if (result.status === 'forbidden') {
		return new Response(null, { status: 403, headers: NO_STORE });
	}

	if (result.status === 'too-large') {
		return new Response(null, { status: 413, headers: NO_STORE });
	}

	if (result.status === 'conflict') {
		// The current state travels with the 409, so the client can decrypt it,
		// merge, and push again without a second round trip.
		return json({ v: result.room.v, blob: result.room.blob }, { status: 409, headers: NO_STORE });
	}

	return json({ v: result.v }, { headers: NO_STORE });
};
