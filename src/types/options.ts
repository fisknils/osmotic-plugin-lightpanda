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
