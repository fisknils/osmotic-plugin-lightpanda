import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { Osmotic } from 'osmotic';
import lightpanda from '../src/index.cjs';
import { createSite, runChain, scripted, serveLightpanda, type LightpandaServer, type Site } from './helpers/index.js';

let site: Site;
let server: LightpandaServer;

before(async () => {
	site = await createSite({
		'/a': scripted(`document.body.insertAdjacentHTML('beforeend', '<p class="msg">a</p>')`),
		'/b': scripted(`document.body.insertAdjacentHTML('beforeend', '<p class="msg">b</p>')`),
	});
	server = await serveLightpanda();
	Osmotic.plugins([lightpanda({ endpoint: server.endpoint, executablePath: '/nonexistent/lightpanda' })]);
});

after(async () => {
	await site.close();
	await server.stop();
});

test('with endpoint, pages render in the Lightpanda at that address, which keeps running after the run', async () => {
	const first = await runChain(Osmotic.get(site.url('/a')).set({ msg: '.msg' }));
	assert.deepEqual(first.errors, []);
	assert.deepEqual(first.rows, [{ msg: 'a' }]);
	assert.equal(server.process.exitCode, null);
	assert.equal(server.process.signalCode, null);

	const second = await runChain(Osmotic.get(site.url('/b')).set({ msg: '.msg' }));
	assert.deepEqual(second.rows, [{ msg: 'b' }]);
});
