import { describe, expect, it } from 'vitest';
import { createClock, latest, stamp } from '../src/lib/doc/stamp';
import { addGroup } from '../src/lib/doc/ops';
import { emptyDoc } from '../src/lib/doc/types';

describe('latest', () => {
	it('is nought for an empty document', () => {
		expect(latest(emptyDoc())).toBe(0);
	});

	it('finds the newest stamp on any field of any record', () => {
		const ctx = { clientId: 'a', clock: createClock(0, () => 5) };
		const doc = addGroup(emptyDoc(), ctx, { id: 'g', title: 'x' });
		const ahead = {
			...doc,
			groups: {
				g: { ...doc.groups.g, stamps: { ...doc.groups.g.stamps, title: { t: 99, c: 'b' } } }
			}
		};
		expect(latest(ahead)).toBe(99);
	});

	it('seeded into a clock, puts the next edit after what was seen', () => {
		const clock = createClock(0, () => 10);
		clock.seed(50);
		expect(stamp({ clientId: 'a', clock }).t).toBe(51);
	});
});
