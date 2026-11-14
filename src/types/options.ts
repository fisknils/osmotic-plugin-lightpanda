// Declared next to the options it takes. Both entry points' declarations import this
// file, so callers get render() on Osmotic as soon as they import the plugin.
declare module 'osmotic' {
	interface Osmotic {
		/**
		 * Set how pages loaded after this step are rendered, on top of the plugin's
		 * options and earlier `render()` steps. `render(false)` fetches them without
		 * the browser instead.
		 *
		 * @example
		 * ```ts
		 * new Osmotic()
		 * 	.render({ waitFor: '.price' })
		 * 	.get('https://example.com/product')
		 * 	.set({ price: '.price' });
		 * ```
		 */
		render(options?: RenderOptions | false): this;
	}
}

/** How a page is loaded and when its HTML is captured. */
export interface RenderOptions {
	/**
	 * When navigation counts as finished: at the `load` or `DOMContentLoaded` event, once
	 * the network has been idle for 500 ms, or as soon as the response arrives (`'commit'`).
	 * @defaultValue `'load'`
	 */
	waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' | 'commit';
	/** Wait until an element matching this CSS selector is in the page. */
	waitFor?: string;
	/**
	 * Milliseconds to allow for the response, for `waitUntil` and for `waitFor`, each.
	 * @defaultValue `30000`
	 */
	timeout?: number;
	/**
	 * Resource types to fail instead of requesting, such as `'script'`, `'xhr'`, `'fetch'`,
	 * `'image'` or `'stylesheet'`. Lightpanda reports `fetch()` requests as `'xhr'`, so
	 * `'fetch'` blocks those too.
	 * @defaultValue `[]`
	 */
	block?: string[];
	/**
	 * Runs after the page loads and `waitFor` matched, before the HTML is captured. Use it to
	 * click, fill in forms or wait for content. Only called for 2xx HTML responses.
	 */
	actions?: (page: LightpandaPage, url: string) => unknown;
	/**
	 * Return the responses this matches as the server sent them, without rendering: right
	 * away, with the raw body, without waiting for `waitUntil`, `waitFor` or `actions`.
	 * For fetch middleware in front of the plugin that handles such responses itself.
	 */
	passThrough?: (response: PassThroughResponse) => boolean;
}

/** The response {@link RenderOptions.passThrough} decides on. */
export interface PassThroughResponse {
	/** The URL after redirects. */
	url: string;
	status: number;
	/** Response headers, with lowercase names. Repeated headers are joined by newlines. */
	headers: Record<string, string>;
}

/**
 * The page {@link RenderOptions.actions} works on. Scripts it runs, such as functions passed
 * to `evaluate()`, run in the page in Lightpanda, not in Node.
 */
export interface LightpandaPage {
	/** Evaluate a JavaScript expression in the page, and return its value, awaited if it's a promise. */
	evaluate(expression: string): Promise<unknown>;
	/**
	 * Call `fn` in the page with `arg`, and return its result, awaited if it's a promise. `fn` is sent
	 * as source code, so it can't use variables from Node; pass what it needs as `arg`, which
	 * must survive `JSON.stringify()`, as must the result.
	 */
	evaluate<R, A>(fn: (arg: A) => R, arg: A): Promise<Awaited<R>>;
	evaluate<R>(fn: () => R): Promise<Awaited<R>>;
	/** Call `click()` on the first element matching `selector`. Fails if none does. */
	click(selector: string): Promise<void>;
	/** Set the value of the first element matching `selector`, and fire `input` and `change`. Fails if none does. */
	fill(selector: string, value: string): Promise<void>;
	/**
	 * Wait until an element matching `selector` is in the page.
	 * @param options.timeout - Milliseconds before it fails. Defaults to the render `timeout`.
	 */
	waitFor(selector: string, options?: { timeout?: number }): Promise<void>;
	/** The page's current HTML, with its doctype. */
	content(): Promise<string>;
	/** The page's current URL. */
	url(): Promise<string>;
	/** Send a Chrome DevTools Protocol command to the page, and return its result. */
	send(method: string, params?: object): Promise<any>;
}

/** Options for the plugin. Render options set here are the defaults for every page. */
export interface LightpandaPluginOptions extends RenderOptions {
	/**
	 * Render every page. When `false`, only pages loaded after a `render()` step are rendered,
	 * and others are fetched as usual.
	 * @defaultValue `true`
	 */
	renderAll?: boolean;
	/**
	 * WebSocket URL of a Lightpanda CDP server you run yourself, such as `'ws://127.0.0.1:9222'`.
	 * The plugin connects to it instead of starting Lightpanda, and leaves it running.
	 */
	endpoint?: string;
	/**
	 * Path of the Lightpanda binary to start.
	 * @defaultValue `LIGHTPANDA_EXECUTABLE_PATH`, then the binary `@lightpanda/browser` downloaded
	 * (`~/.cache/lightpanda-node/lightpanda`), then `lightpanda` on the `PATH`
	 */
	executablePath?: string;
	/** Extra arguments for `lightpanda serve`, such as `['--http-timeout', '30000']`. */
	args?: string[];
}
