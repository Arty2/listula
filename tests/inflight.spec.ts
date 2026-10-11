import { describe, expect, it } from 'vitest';
import { gc } from '../src/lib/doc/gc';
import { merge } from '../src/lib/doc/merge';
import { addGroup, addTask, deleteTask, setTaskState } from '../src/lib/doc/ops';
import { createClock, type Ctx } from '../src/lib/doc/stamp';
import { emptyDoc } from '../src/lib/doc/types';
import { changedSince } from '../src/lib/state/sync.svelte';

/*
 * The sheet stays editable while a sync is out, so what comes back has to be
 * laid under whatever was written in the meantime rather than over it.
 */

function ctxAt(clock: () => number, clientId = 'one'): Ctx {
	return { clientId, clock: createClock(0, clock) };
}

describe('an edit made while a sync is out', () => {
	it('is the only thing picked out of the sheet', () => {
		const ctx = ctxAt(() => 1);
		let sent = addGroup(emptyDoc(), ctx, { id: 'g', title: 'Shop' });
		sent = addTask(sent, ctx, { id: 'a', groupId: 'g', text: 'Milk' });
		sent = addTask(sent, ctx, { id: 'b', groupId: 'g', text: 'Bread' });

		const now = setTaskState(sent, ctx, 'a', 'done');
		const changed = changedSince(sent, now);

		expect(Object.keys(changed.tasks)).toEqual(['a']);
		expect(Object.keys(changed.groups)).toEqual([]);
		expect(changedSince(now, now)).toEqual({ v: 1, groups: {}, tasks: {} });
	});

	it('survives the answer, and does not bring back what collection dropped', () => {
		const DAY = 24 * 60 * 60 * 1000;
		let time = 1;
		const ctx = ctxAt(() => time);

		let sent = addGroup(emptyDoc(), ctx, { id: 'g', title: 'Shop' });
		sent = addTask(sent, ctx, { id: 'old', groupId: 'g', text: 'Gone long ago' });
		sent = deleteTask(sent, ctx, 'old');
		sent = addTask(sent, ctx, { id: 'a', groupId: 'g', text: 'Milk' });

		time = 60 * DAY;
		// What the server sends back: the same, with the old tombstone collected.
		const answer = gc(sent, time);
		expect(answer.tasks.old).toBeUndefined();

		// Ticked while the request was out.
		const local = setTaskState(sent, ctx, 'a', 'done');

		const after = merge(answer, changedSince(sent, local));
		expect(after.tasks.a.state).toBe('done');
		expect(after.tasks.old).toBeUndefined();
	});
});
