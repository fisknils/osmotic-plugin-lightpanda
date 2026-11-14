import type { ChildProcess } from 'node:child_process';
import type { FetchRequest } from 'osmotic';
import type { LightpandaPluginOptions, RenderOptions } from '../types/options.js';
import { findExecutable } from '../utils/find-executable.js';
import { CdpConnection } from './CdpConnection.js';
import { renderPage, type BrowserContext } from './render-page.js';
import { startLightpanda, stopLightpanda } from './start-lightpanda.js';

// A Lightpanda to render in, and the browser contexts opened on it
interface Session {
	endpoint: string;
	/** The process the plugin started, or null for a user's `endpoint`. */
	child: ChildProcess | null;
	/** Lightpanda allows one browser context per connection, so each has its own. */
	contexts: Map<string, Promise<BrowserContext>>;
}

// A Lightpanda shared by every run that uses the plugin. It is started on the first
// rendered request and stopped when the last active run ends.
export class LightpandaPool {
	private runs = 0;
	private session: Promise<Session> | null = null;

	constructor(private readonly opts: Pick<LightpandaPluginOptions, 'endpoint' | 'executablePath' | 'args'>) {}

	open(): void {
		this.runs++;
	}

	async close(): Promise<void> {
		this.runs = Math.max(0, this.runs - 1);
		if (this.runs || !this.session) return;
		const session = this.session;
		this.session = null;
		const started = await session.catch(() => null);
		if (!started) return;
		for (const context of started.contexts.values()) (await context.catch(() => null))?.cdp.close();
		if (started.child) await stopLightpanda(started.child);
	}

	// Load req.url in a new page and return the rendered HTML as a Response
	async render(req: FetchRequest, options: RenderOptions): Promise<Response> {
		const session = await this.started();
		const context = await this.context(session, '');
		return renderPage(context, req, options);
	}

	private started(): Promise<Session> {
		if (this.session) return this.session;
		const session = this.start();
		this.session = session;
		const forget = () => {
			if (this.session === session) this.session = null;
		};
		// A Lightpanda that crashed or failed to start is replaced on the next request
		session.then(({ child }) => child?.once('exit', forget), forget);
		return session;
	}

	private async start(): Promise<Session> {
		if (this.opts.endpoint) return { endpoint: this.opts.endpoint, child: null, contexts: new Map() };
		const { child, endpoint } = await startLightpanda(findExecutable(this.opts.executablePath), this.opts.args);
		return { endpoint, child, contexts: new Map() };
	}

	// Pages with the same key share a browser context, so cookies persist across them
	// like in a regular browser session. A closed connection is replaced on the next request.
	private context(session: Session, key: string): Promise<BrowserContext> {
		let context = session.contexts.get(key);
		if (!context) {
			context = (async () => {
				const cdp = await CdpConnection.connect(session.endpoint);
				const { browserContextId } = await cdp.send('Target.createBrowserContext');
				return { cdp, browserContextId };
			})();
			const created = context;
			const forget = () => {
				if (session.contexts.get(key) === created) session.contexts.delete(key);
			};
			session.contexts.set(key, created);
			created.then(({ cdp }) => cdp.closed.then(forget), forget);
		}
		return context;
	}
}
