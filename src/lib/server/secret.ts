/**
 * Compares two secrets without leaking their contents through how long the
 * comparison takes.
 *
 * Lengths are hashed in rather than short-circuited on, so an attacker cannot
 * learn the secret's length from a fast rejection.
 */
export function constantTimeEqual(a: string, b: string): boolean {
	const left = new TextEncoder().encode(a);
	const right = new TextEncoder().encode(b);

	let diff = left.length ^ right.length;
	const length = Math.max(left.length, right.length);

	for (let i = 0; i < length; i++) {
		diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
	}

	return diff === 0;
}

/** What follows `Authorization: Bearer `, or null when that is not its shape. */
export function bearer(header: string | null): string | null {
	const prefix = 'Bearer ';
	return header?.startsWith(prefix) ? header.slice(prefix.length) : null;
}

/** `Authorization: Bearer <secret>`, and nothing else. */
export function bearerMatches(header: string | null, secret: string | undefined): boolean {
	if (!secret) return false;

	const given = bearer(header);
	return given !== null && constantTimeEqual(given, secret);
}
