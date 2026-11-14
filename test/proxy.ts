import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { Osmotic } from 'osmotic';
import lightpanda from '../src/index.cjs';
import { createProxy, createSite, runChain, type Proxy, type Site } from './helpers/index.js';

let site: Site;
let proxy: Proxy;

before(async () => {
	site = await createSite({ '/': '<p class="via">direct</p>' });
	proxy = await createProxy('<p class="via">proxy</p>');
	Osmotic.plugins([lightpanda]);
});

after(async () => {
	await site.close();
	await proxy.close();
});

test("a slot's proxy carries the page request, with the credentials from its URL", async () => {
	const proxyUrl = proxy.url.replace('http://', 'http://user:p%40ss@');
	const chain = Osmotic.get(site.url('/'))
		.set({ via: '.via' })
		.config({ slots: [{ proxy: proxyUrl }] });
	const { rows, errors } = await runChain(chain);
	assert.deepEqual(errors, []);
	assert.deepEqual(rows, [{ via: 'proxy' }]);
	const request = proxy.requests.find((r) => r.url === site.url('/'));
	assert.ok(request, 'the proxy received the page request');
	assert.equal(request.headers['proxy-authorization'], `Basic ${Buffer.from('user:p@ss').toString('base64')}`);
});

test('pages of a slot without a proxy go direct', async () => {
	const { rows } = await runChain(Osmotic.get(site.url('/')).set({ via: '.via' }));
	assert.deepEqual(rows, [{ via: 'direct' }]);
});
