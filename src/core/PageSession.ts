import type { CdpConnection, CdpEvent } from './CdpConnection.js';

// A wait for an event that hasn't arrived yet
interface Waiter {
	match: (event: CdpEvent) => boolean;
	resolve: (event: CdpEvent) => void;
}

/**
 * One page (target) on a CDP connection. It records the page's events from the start, so a
 * wait for an event that already arrived resolves right away.
 */
export class PageSession {
	private readonly events: CdpEvent[] = [];
	private readonly waiters = new Set<Waiter>();
	private readonly handlers = new Set<(event: CdpEvent) => void>();
	private readonly unsubscribe: () => void;

	constructor(
		private readonly cdp: CdpConnection,
		readonly sessionId: string,
	) {
		this.unsubscribe = cdp.on((event) => {
			if (event.sessionId !== sessionId) return;
			this.events.push(event);
			for (const handler of this.handlers) handler(event);
			for (const waiter of this.waiters) {
				if (waiter.match(event)) {
					this.waiters.delete(waiter);
					waiter.resolve(event);
				}
			}
		});
	}

	/** Call `handler` with each of the page's events with this `method`, until the session is disposed. */
	on(method: string, handler: (params: any) => void): void {
		this.handlers.add((event) => {
			if (event.method === method) handler(event.params);
		});
	}

	/** Send a command to the page. */
	send<T = any>(method: string, params: object = {}): Promise<T> {
		return this.cdp.send<T>(method, params, this.sessionId);
	}

	/**
	 * The first event since the session started that `match` accepts, waiting up to `ms`
	 * milliseconds for it. Rejects when the connection closes, or naming `what` on timeout.
	 */
	wait(match: (event: CdpEvent) => boolean, ms: number, what: string): Promise<CdpEvent> {
		const seen = this.events.find(match);
		if (seen) return Promise.resolve(seen);
		let waiter: Waiter | undefined;
		let timer: NodeJS.Timeout | undefined;
		return Promise.race([
			new Promise<CdpEvent>((resolve) => {
				waiter = { match, resolve };
				this.waiters.add(waiter);
			}),
			new Promise<never>((_, reject) => {
				timer = setTimeout(() => reject(new Error(`Timed out after ${ms} ms waiting for ${what}`)), ms);
			}),
			this.cdp.closed.then((err) => Promise.reject(err)),
		]).finally(() => {
			clearTimeout(timer);
			if (waiter) this.waiters.delete(waiter);
		});
	}

	/** Evaluate `expression` in the page and return its value; throws if the page throws. */
	async evaluate<T = unknown>(expression: string): Promise<T> {
		const { result, exceptionDetails } = await this.send('Runtime.evaluate', {
			expression,
			returnByValue: true,
			awaitPromise: true,
		});
		if (exceptionDetails) {
			const description = exceptionDetails.exception?.description ?? exceptionDetails.text;
			throw new Error(`Script failed in the page: ${description}`);
		}
		return result.value as T;
	}

	/** Stop recording events. */
	dispose(): void {
		this.unsubscribe();
		this.waiters.clear();
		this.handlers.clear();
	}
}
