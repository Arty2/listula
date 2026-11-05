import { browser } from '$app/environment';
import { el } from './el';
import { en } from './en';
import type { Messages } from './en';
import { detectLocale, resolveLocale, type Locale } from './locales';

/** Every catalogue the app ships, for the rare question that is not about the current one. */
export const CATALOGUES: Record<Locale, Messages> = { en, el };

/**
 * Which catalogue the app is showing, and the one thing that can override it.
 *
 * `detected` is read once, from the browser the tab is running in, and read
 * at construction rather than through a `load()` called from an effect: the
 * scaffolding group's title (see `firstGroupTitle` in doc.svelte.ts) is
 * created from *its own* mount effect, in a sibling component, and nothing
 * orders one component's effects before another's. Detecting eagerly, the
 * moment this module is first imported, means every later reader — effect,
 * template, or a plain function called during another module's own setup —
 * sees the real answer immediately, with nothing to race. `navigator` needs
 * no lifecycle to be ready; only the DOM does, which is what `theme.svelte.ts`
 * and the others with a genuine `load()` are actually waiting for.
 *
 * `override` is the debug picker's doing, and it is deliberately not written
 * to storage: it lives for as long as this tab does, the same reasoning
 * Menu.svelte's own `remembered` scroll position is held to. It does outlive
 * the debug switch itself, though — turning debug off hides the picker again
 * but does not touch this, so a language picked while debug was on is the
 * language shown until the tab picks another or reloads. Only reaching the
 * control is gated on debug; what it already did is not undone by leaving.
 */
export class Language {
	#detected = $state<Locale>(
		browser ? detectLocale(navigator.languages ?? [navigator.language]) : 'en'
	);
	override = $state<Locale | null>(null);

	current = $derived(resolveLocale(this.#detected, this.override));
	catalogue = $derived(CATALOGUES[this.current]);
}

export const language = new Language();
