/** An event from the browser: a CDP message without an `id`. */
export interface CdpEvent {
	method: string;
	// CDP's own types aren't a dependency; callers read the few fields they need
	params: any;
	sessionId?: string;
}

interface Pending {
	method: string;
	resolve: (result: any) => void;
	reject: (err: Error) => void;
}

/**
 * A Chrome DevTools Protocol connection over Node's global `WebSocket`. Commands to a page
 * go to its session (`Target.attachToTarget` with `flatten: true`). Once the connection
 * closes, pending and later commands reject, and `closed` resolves.
 */
export class CdpConnection {
	private nextId = 0;
	private readonly pending = new Map<number, Pending>();
	private readonly listeners = new Set<(event: CdpEvent) => void>();
	private closeError: Error | null = null;
	/** Resolves once the connection is closed, by either side, with the error commands now get. */
	readonly closed: Promise<Error>;

	/** Connect to `url`, such as `ws://127.0.0.1:9222/`. */
	static connect(url: string, timeout = 10000): Promise<CdpConnection> {
		return new Promise((resolve, reject) => {
			const ws = new WebSocket(url);
			const timer = setTimeout(() => {
				ws.close();
				reject(new Error(`Couldn't connect to Lightpanda at ${url} within ${timeout} ms`));
			}, timeout);
			ws.addEventListener('open', () => {
				clearTimeout(timer);
				resolve(new CdpConnection(ws));
			});
			ws.addEventListener('error', () => {
				clearTimeout(timer);
				reject(new Error(`Couldn't connect to Lightpanda at ${url}`));
			});
		});
	}

	private constructor(private readonly ws: WebSocket) {
		this.closed = new Promise((resolve) => {
			ws.addEventListener('close', () => resolve(this.shutDown()));
			ws.addEventListener('error', () => resolve(this.shutDown()));
		});
		ws.addEventListener('message', (message) => this.receive(String(message.data)));
	}

	/** Send a command, to the page with `sessionId` if given, and resolve to its result. */
	send<T = any>(method: string, params: object = {}, sessionId?: string): Promise<T> {
		if (this.closeError) return Promise.reject(this.closeError);
		const id = ++this.nextId;
		return new Promise<T>((resolve, reject) => {
			this.pending.set(id, { method, resolve, reject });
			this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
		});
	}

	/** Call `listener` with every event until the returned function is called. */
	on(listener: (event: CdpEvent) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	close(): void {
		this.shutDown();
		this.ws.close();
	}

	private receive(data: string): void {
		const message = JSON.parse(data);
		if (typeof message.id !== 'number') {
			for (const listener of this.listeners) listener(message);
			return;
		}
		const pending = this.pending.get(message.id);
		if (!pending) return;
		this.pending.delete(message.id);
		if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message ?? 'failed'}`));
		else pending.resolve(message.result);
	}

	// Fail everything still waiting, once
	private shutDown(): Error {
		if (this.closeError) return this.closeError;
		this.closeError = new Error('The connection to Lightpanda closed');
		for (const { reject } of this.pending.values()) reject(this.closeError);
		this.pending.clear();
		return this.closeError;
	}
}
