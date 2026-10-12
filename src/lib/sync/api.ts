import { errorText, trace } from './trace';

/**
 * The only place the app makes a network request.
 *
 * Every call goes to our own origin, which is what lets the CSP say
 * `connect-src 'self'` and nothing else. The room id in the path is derived
 * from the code; the code itself never appears in a URL, a header, or a body.
 */

export type RoomSnapshot = { v: number; blob: string };

/*
 * `offline` means nothing answered. `refused` means our own origin answered and
 * said no.
 *
 * They were one status for a while, and that was a mistake worth naming: a
 * deployment with no blob store returns 500 on every request, and the app told
 * people their connection was down. The status code travels with it because it
 * is the one thing that says which — 404 is a route that was never deployed,
 * 500 is a route that cannot reach its store.
 */
export type GetResult =
	| { status: 'ok'; room: RoomSnapshot }
	| { status: 'unchanged' }
	| { status: 'missing' }
	| { status: 'slow' }
	| { status: 'offline' }
	| { status: 'refused'; code: number };

export type PutResult =
	| { status: 'ok'; v: number }
	| { status: 'conflict'; room: RoomSnapshot }
	| { status: 'too-large' }
	/** Asked too often; the server will take it again in a minute. */
	| { status: 'slow' }
	| { status: 'offline' }
	| { status: 'refused'; code: number };

function snapshot(value: unknown): RoomSnapshot | null {
	if (typeof value !== 'object' || value === null) return null;

	const { v, blob } = value as Record<string, unknown>;
	if (typeof v !== 'number' || typeof blob !== 'string') return null;

	return { v, blob };
}

export async function getRoom(roomId: string, etag: string | null): Promise<GetResult> {
	let response: Response;

	try {
		response = await fetch(`/api/room/${roomId}`, {
			headers: etag ? { 'If-None-Match': etag } : undefined,
			cache: 'no-store'
		});
	} catch (error) {
		// No network, or the request was blocked. Not an error the person needs
		// a stack trace for.
		trace(`GET: ${errorText(error)}`);
		return { status: 'offline' };
	}

	if (response.status === 304) {
		// The whole reason a stale device can look empty forever: this says
		// nothing changed since the version already cached here, not that
		// there is nothing there.
		trace(`GET 304, still at ${etag ?? 'no etag sent'}`);
		return { status: 'unchanged' };
	}
	if (response.status === 404) {
		trace('GET 404');
		return { status: 'missing' };
	}
	if (response.status === 429) {
		trace('GET 429 too many');
		return { status: 'slow' };
	}
	if (!response.ok) {
		trace(`GET ${response.status}`);
		return { status: 'refused', code: response.status };
	}

	const room = snapshot(await response.json().catch(() => null));
	trace(room ? `GET 200 v${room.v} ${room.blob.length}b` : 'GET 200 unparsable');
	return room ? { status: 'ok', room } : { status: 'missing' };
}

export async function putRoom(
	roomId: string,
	body: { baseV: number; blob: string },
	/** Derived from the code beside the room id; only its hash is stored. */
	writeToken: string
): Promise<PutResult> {
	let response: Response;
	// What was actually sent, on every line below — success or not.
	const sent = `PUT baseV${body.baseV} ${body.blob.length}b`;

	try {
		response = await fetch(`/api/room/${roomId}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${writeToken}` },
			body: JSON.stringify(body),
			cache: 'no-store'
		});
	} catch (error) {
		trace(`${sent}: ${errorText(error)}`);
		return { status: 'offline' };
	}

	if (response.status === 413) {
		trace(`${sent}: 413 too large`);
		return { status: 'too-large' };
	}

	if (response.status === 429) {
		trace(`${sent}: 429 too many`);
		return { status: 'slow' };
	}

	if (response.status === 409) {
		const room = snapshot(await response.json().catch(() => null));
		trace(room ? `${sent}: 409, server is at v${room.v}` : `${sent}: 409 unparsable`);
		// The current state travels with the conflict, so a retry needs no extra
		// round trip.
		return room ? { status: 'conflict', room } : { status: 'refused', code: 409 };
	}

	if (!response.ok) {
		trace(`${sent}: ${response.status}`);
		return { status: 'refused', code: response.status };
	}

	const value = await response.json().catch(() => null);
	const v = (value as { v?: unknown } | null)?.v;

	trace(typeof v === 'number' ? `${sent}: 200, now v${v}` : `${sent}: 200 unparsable`);
	return typeof v === 'number' ? { status: 'ok', v } : { status: 'refused', code: response.status };
}
