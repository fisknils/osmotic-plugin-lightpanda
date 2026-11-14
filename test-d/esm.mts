// The ESM entry point, as an ES module caller sees it
import { Osmotic } from 'osmotic';
import lightpanda, { type LightpandaPluginOptions, type RenderOptions } from '../src/index.mjs';

const options: LightpandaPluginOptions = { waitUntil: 'domcontentloaded' };
const render: RenderOptions = { waitFor: '.item' };

Osmotic.plugins([lightpanda, lightpanda(options)]);
new Osmotic().render(render).get('https://example.com');

// @ts-expect-error: timeout is a number
lightpanda({ timeout: '5s' });
