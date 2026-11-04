/**
 * The share code *is* the encryption key.
 *
 *   material   = PBKDF2-SHA256(code, "consumma:v1", 300_000, 64 bytes)
 *   roomId     = hex(material[0..16])   — 32 hex chars, the list's address
 *   writeToken = hex(material[16..32])  — 32 hex chars, proof it may be written
 *   aesKey     =     material[32..64]   — AES-GCM 256, never leaves the device
 *
 * The salt is fixed because the code is the only shared secret. The three
 * slices are independent, so a server that knows roomId learns nothing about
 * either of the others. The write token is sent with every write and the
 * server keeps only its hash: knowing a list's address is enough to read its
 * ciphertext but not to overwrite it. It was carved from bytes the derivation
 * already produced and nothing used, so no existing roomId or key moved.
 *
 * Nothing here ever runs on the server: scripts/gates.sh fails the build if
 * anything under src/routes/api imports from this directory.
 */

/**
 * FROZEN the day the first list is created. Changing this string — including
 * as part of a rename — silently orphans every existing list, because the same
 * code would derive a different roomId. If it ever has to change, bump to v2
 * and have the client try v2 then fall back to v1.
 *
 * The app was called consumma and is called listula; the salt still says
 * consumma, and that is the rule above being kept rather than a rename that
 * was missed. A salt is an address, not a name.
 */
export const SALT = 'consumma:v1';

export const ITERATIONS = 300_000;

/**
 * 12 hex characters is 48 bits.
 *
 * Reads and writes both go through our own origin, and the only rate limit
 * behind it is counted per function instance (src/lib/server/limit.ts), so it
 * is a floor rather than a wall: guessing is bounded mostly by an attacker's
 * request rate and the PBKDF2 cost. At 8 characters (32 bits) that is days of work for
 * someone determined; 12 makes it roughly 65,000 times more, which ends the
 * argument. Exported as a constant so it can be raised again without a
 * rewrite.
 */
export const CODE_LENGTH = 12;

const CODE_PATTERN = /^[0-9a-f]+$/;
export const ROOM_ID_PATTERN = /^[0-9a-f]{32}$/;

export type Room = {
	/** Sent to the server. Reveals nothing about the key. */
	roomId: string;
	/** Non-extractable: nothing in the app can read the raw bytes back out. */
	key: CryptoKey;
	/** Sent with every write. The server stores its hash and nothing else. */
	writeToken: string;
};

export function newCode(): string {
	const bytes = new Uint8Array(Math.ceil(CODE_LENGTH / 2));
	crypto.getRandomValues(bytes);
	return hex(bytes).slice(0, CODE_LENGTH);
}

/**
 * Accepts what someone actually types: spaces from reading it aloud, capitals
 * from an autocapitalising keyboard. Returns null if it is not a code.
 */
export function normaliseCode(input: string): string | null {
	const code = input.replace(/\s+/g, '').toLowerCase();
	if (code.length !== CODE_LENGTH || !CODE_PATTERN.test(code)) return null;
	return code;
}

/**
 * Grouped for dictation — `5e6b 7c1a 93f2`. Presentation only; what is stored,
 * copied and typed is always the bare code.
 */
/**
 * Pulls a code out of whatever was pasted.
 *
 * The invitation is a link and a code on two lines, and pasting the whole
 * thing is the obvious thing to do with it — so the link has to be got rid of
 * before anything else looks at the characters.
 *
 * It cannot be done by stripping non-hex: a domain is made of letters, and
 * enough of them are hex digits that `listula.cafe` reads as `acafe`. A URL
 * would assemble into a code that is wrong and looks right, and send someone
 * to a list that does not exist.
 *
 * Nor by hunting for any twelve hex characters among the words. In
 * "the cafe — a1b2 c3d4 e5f6" two different runs come to twelve, and picking
 * one is guessing. A wrong code is worse here than no code: no code leaves the
 * field alone and the person tries again, a wrong one joins nothing and says
 * the list is empty.
 *
 * So: words that could be part of a URL are dropped whole, and every word left
 * has to belong to the code. Anything less certain returns null.
 */
export function codeFrom(input: string): string | null {
	const rest = input
		.split(/\s+/)
		.filter((word) => word !== '' && !/[:/.]/.test(word))
		.join('');

	return normaliseCode(rest);
}

export function formatCode(code: string): string {
	return (code.match(/.{1,4}/g) ?? [code]).join(' ');
}

export async function derive(code: string): Promise<Room> {
	const material = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(code),
		'PBKDF2',
		false,
		['deriveBits']
	);

	const bits = await crypto.subtle.deriveBits(
		{
			name: 'PBKDF2',
			salt: new TextEncoder().encode(SALT),
			iterations: ITERATIONS,
			hash: 'SHA-256'
		},
		material,
		512
	);

	const bytes = new Uint8Array(bits);
	const roomId = hex(bytes.subarray(0, 16));
	const writeToken = hex(bytes.subarray(16, 32));

	const key = await crypto.subtle.importKey('raw', bytes.subarray(32, 64), 'AES-GCM', false, [
		'encrypt',
		'decrypt'
	]);

	// The CryptoKey holds its own copy; there is no reason for a second one to
	// stay reachable on the heap.
	bytes.fill(0);

	return { roomId, key, writeToken };
}

function hex(bytes: Uint8Array): string {
	let out = '';
	for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
	return out;
}
