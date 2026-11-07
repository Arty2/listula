import { describe, expect, it } from 'vitest';
import { typewriter } from '../src/lib/doc/typewriter';

describe('typewriter', () => {
	it('sets digits in the monospace digits', () => {
		expect(typewriter('0123456789')).toBe('𝟶𝟷𝟸𝟹𝟺𝟻𝟼𝟽𝟾𝟿');
	});

	it('sets the units in the monospace letters', () => {
		expect(typewriter('500g')).toBe('𝟻𝟶𝟶𝚐');
		expect(typewriter('1,5kg')).toBe('𝟷,𝟻𝚔𝚐');
		expect(typewriter('2L')).toBe('𝟸𝙻');
		expect(typewriter('250ml')).toBe('𝟸𝟻𝟶𝚖𝚕');
	});

	it('leaves what has no monospace twin alone', () => {
		expect(typewriter('12,50€')).toBe('𝟷𝟸,𝟻𝟶€');
		expect(typewriter('$3.00')).toBe('$𝟹.𝟶𝟶');
		expect(typewriter('2–3×')).toBe('𝟸–𝟹×');
		expect(typewriter('£')).toBe('£');
	});
});
