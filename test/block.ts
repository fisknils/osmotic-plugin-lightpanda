import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { Osmotic } from 'osmotic';
import lightpanda from '../src/index.cjs';
import { createSite, runChain, scripted, type Site } from './helpers/index.js';

const addMessage = (cls: string, text: string) =>
	`document.body.insertAdjacentHTML('beforeend', '<p class="${cls}">${text}</p>')`;

let site: Site;

before(async () => {
	site = await createSite({
		'/script': `<script src="/blocked.js"></script><p class="msg">has script</p>`,
		'/blocked.js': { type: 'text/javascript', body: addMessage('loaded', 'yes') },
		'/fetch': scripted(
			`fetch('/api').then(() => ${addMessage('fetched', 'yes')}, () => ${addMessage('fetched', 'no')})`,
		),
		'/api': { type: 'application/json', body: '{}' },
	});
	Osmotic.plugins([lightpanda]);
});

after(() => site.close());

test('block keeps matching resource types from loading, and the page still renders', async () => {
	const chain = new Osmotic()
		.render({ block: ['script'] })
		.get(site.url('/script'))
		.set({ msg: '.msg', loaded: '.loaded' });
	const { rows, errors } = await runChain(chain);
	assert.deepEqual(errors, []);
	assert.deepEqual(rows, [{ msg: 'has script', loaded: '' }]);
	assert.ok(!site.paths().includes('/blocked.js'));
});

test("block: ['fetch'] blocks fetch() requests", async () => {
	const chain = new Osmotic()
		.render({ block: ['fetch'], waitFor: '.fetched' })
		.get(site.url('/fetch'))
		.set({ fetched: '.fetched' });
	const { rows } = await runChain(chain);
	assert.deepEqual(rows, [{ fetched: 'no' }]);
	assert.ok(!site.paths().includes('/api'));
});
