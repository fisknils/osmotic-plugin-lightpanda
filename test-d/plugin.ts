import { Osmotic, type OsmoticPlugin } from 'osmotic';
import lightpanda = require('../src/index.cjs');

const options: lightpanda.LightpandaPluginOptions = {
	renderAll: false,
	executablePath: '/usr/local/bin/lightpanda',
	args: ['--http-timeout', '30000'],
	waitUntil: 'networkidle',
	timeout: 10000,
};
const remote: lightpanda.LightpandaPluginOptions = { endpoint: 'ws://127.0.0.1:9222' };

// Loaded as is, or called with options
Osmotic.plugins([lightpanda, lightpanda(options), lightpanda(remote), lightpanda()]);
const plugin: OsmoticPlugin = lightpanda(options);

// @ts-expect-error: renderAll is a boolean
lightpanda({ renderAll: 'yes' });

// @ts-expect-error: args is a list of strings
lightpanda({ args: '--http-timeout 30000' });

// @ts-expect-error: unknown options are rejected
lightpanda({ headless: true });
