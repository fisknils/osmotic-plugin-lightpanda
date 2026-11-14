// ESM entry: re-exports the CommonJS build, so import and require share one plugin
import lightpanda from './index.cjs';

export default lightpanda;
export type { LightpandaPluginOptions, RenderOptions } from './types/options.js';
