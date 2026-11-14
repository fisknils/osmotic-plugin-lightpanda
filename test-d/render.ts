import { Osmotic } from 'osmotic';
import type { RenderOptions } from '../src/index.cjs';

const options: RenderOptions = {
	waitUntil: 'networkidle',
	waitFor: '.price',
	timeout: 5000,
};

new Osmotic().render().render(options).render(false).get('https://example.com').render({ waitFor: 'h1' }).follow();

new Osmotic().render({ waitUntil: 'load' }).render({ waitUntil: 'domcontentloaded' }).render({ waitUntil: 'commit' });

// @ts-expect-error: waitUntil takes the load states the plugin knows
new Osmotic().render({ waitUntil: 'idle' });

// @ts-expect-error: render(true) is not a thing; render() turns rendering on
new Osmotic().render(true);

// @ts-expect-error: waitFor is a selector string
new Osmotic().render({ waitFor: 1 });
