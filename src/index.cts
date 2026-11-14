import type { OsmoticPlugin } from 'osmotic';
import { createPlugin } from './core/plugin.js';
import type * as options from './types/options.js';

/**
 * Render pages with Lightpanda. Load it once, before building chains:
 *
 * ```js
 * Osmotic.plugins([require('osmotic-plugin-lightpanda')]);
 * // or, with options:
 * Osmotic.plugins([require('osmotic-plugin-lightpanda')({ waitUntil: 'networkidle' })]);
 * ```
 */
function lightpanda(options?: options.LightpandaPluginOptions): OsmoticPlugin {
	return createPlugin(options);
}

namespace lightpanda {
	export type LightpandaPluginOptions = options.LightpandaPluginOptions;
	export type RenderOptions = options.RenderOptions;
}

// module.exports is the function itself, so require() can pass it straight to plugins()
export = lightpanda;
