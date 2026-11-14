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
		'/js': scripted(addMessage('msg', 'rendered')),
		'/late': scripted(`setTimeout(() => ${addMessage('late', 'arrived')}, 300)`),
		'/fetched': scripted(`fetch('/api').then(() => ${addMessage('fetched', 'yes')})`),
		'/api': { type: 'application/json', body: '{}' },
		'/links': '<a href="/js">js</a> <a href="/late">late</a>',
	});
	Osmotic.plugins([lightpanda]);
});

after(() => site.close());

test('content built by scripts is visible to set()', async () => {
	const { rows, errors } = await runChain(Osmotic.get(site.url('/js')).set({ msg: '.msg' }));
	assert.deepEqual(errors, []);
	assert.deepEqual(rows, [{ msg: 'rendered' }]);
});

test('content built by scripts is visible to find()', async () => {
	const { rows } = await runChain(Osmotic.get(site.url('/js')).find('p.msg').set({ msg: '' }));
	assert.deepEqual(rows, [{ msg: 'rendered' }]);
});

test('render(false) fetches the pages after it without the browser', async () => {
	const { rows } = await runChain(new Osmotic().render(false).get(site.url('/js')).set({ msg: '.msg' }));
	assert.deepEqual(rows, [{ msg: '' }]);
});

test('waitFor waits for content that appears after the load event', async () => {
	const chain = new Osmotic().render({ waitFor: '.late' }).get(site.url('/late')).set({ late: '.late' });
	const { rows } = await runChain(chain);
	assert.deepEqual(rows, [{ late: 'arrived' }]);
});

test("waitUntil: 'networkidle' waits for content built from a request the page makes", async () => {
	const chain = new Osmotic()
		.render({ waitUntil: 'networkidle' })
		.get(site.url('/fetched'))
		.set({ fetched: '.fetched' });
	const { rows } = await runChain(chain);
	assert.deepEqual(rows, [{ fetched: 'yes' }]);
});

test('render options apply to the pages loaded after the step, including followed ones', async () => {
	const chain = new Osmotic()
		.render(false)
		.get(site.url('/links'))
		.render({ waitFor: '.msg, .late' })
		.follow('a@href')
		.set({ text: '.msg, .late' });
	const { rows } = await runChain(chain);
	assert.deepEqual(rows.map((r) => r.text).sort(), ['arrived', 'rendered']);
});
