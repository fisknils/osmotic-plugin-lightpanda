import type { LightpandaPage } from '../types/options.js';
import type { PageSession } from './PageSession.js';

// How often waitFor checks for its selector
const POLL_MS = 50;

/** The page handle `actions` get, also used to wait for and capture the page. */
export class PageHandle implements LightpandaPage {
	constructor(
		private readonly page: PageSession,
		private readonly timeout: number,
	) {}

	evaluate(expression: string): Promise<unknown>;
	evaluate<R, A>(fn: (arg: A) => R, arg: A): Promise<Awaited<R>>;
	evaluate<R>(fn: () => R): Promise<Awaited<R>>;
	evaluate(fn: string | ((arg?: unknown) => unknown), arg?: unknown): Promise<unknown> {
		if (typeof fn === 'string') return this.page.evaluate(fn);
		return this.page.evaluate(`(${fn.toString()})(${arg === undefined ? '' : JSON.stringify(arg)})`);
	}

	async click(selector: string): Promise<void> {
		await this.page.evaluate(`${find(selector)}.click()`);
	}

	async fill(selector: string, value: string): Promise<void> {
		await this.page.evaluate(`(() => {
			const el = ${find(selector)};
			el.value = ${JSON.stringify(value)};
			el.dispatchEvent(new Event('input', { bubbles: true }));
			el.dispatchEvent(new Event('change', { bubbles: true }));
		})()`);
	}

	async waitFor(selector: string, options: { timeout?: number } = {}): Promise<void> {
		const timeout = options.timeout ?? this.timeout;
		const deadline = Date.now() + timeout;
		const expression = `!!document.querySelector(${JSON.stringify(selector)})`;
		while (!(await this.page.evaluate<boolean>(expression))) {
			if (Date.now() >= deadline) throw new Error(`Timed out after ${timeout} ms waiting for ${selector}`);
			await new Promise((resolve) => setTimeout(resolve, POLL_MS));
		}
	}

	async content(): Promise<string> {
		const { root } = await this.page.send('DOM.getDocument', { depth: 0 });
		const { outerHTML } = await this.page.send('DOM.getOuterHTML', { nodeId: root.nodeId });
		return outerHTML;
	}

	url(): Promise<string> {
		return this.page.evaluate<string>('location.href');
	}

	send(method: string, params: object = {}): Promise<any> {
		return this.page.send(method, params);
	}
}

// An expression for the first element matching `selector`, which throws naming it if there is none
const find = (selector: string) => {
	const s = JSON.stringify(selector);
	return `(document.querySelector(${s}) ?? (() => { throw new Error('No element matches ' + ${s}); })())`;
};
