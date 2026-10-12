import { describe, expect, it } from 'vitest';
import { RateLimiter } from '../src/lib/server/limit';

describe('the rate limiter', () => {
	it('allows up to the limit in a window, and no more', () => {
		const limiter = new RateLimiter(3, 1000, { now: () => 0 });

		expect([1, 2, 3, 4].map(() => limiter.take('a'))).toStrictEqual([true, true, true, false]);
	});

	it('counts each address on its own', () => {
		const limiter = new RateLimiter(1, 1000, { now: () => 0 });

		expect(limiter.take('a')).toBe(true);
		expect(limiter.take('a')).toBe(false);
		expect(limiter.take('b')).toBe(true);
	});

	it('starts again once the window has passed', () => {
		let now = 0;
		const limiter = new RateLimiter(1, 1000, { now: () => now });

		expect(limiter.take('a')).toBe(true);
		expect(limiter.take('a')).toBe(false);
		now = 1000;
		expect(limiter.take('a')).toBe(true);
	});

	it('does not grow without end under a flood of addresses', () => {
		const limiter = new RateLimiter(1, 1000, { now: () => 0, maxKeys: 10 });

		for (let i = 0; i < 1000; i++) limiter.take(`flood-${i}`);
		// Still answering, and a newcomer is still let in.
		expect(limiter.take('newcomer')).toBe(true);
	});
});
