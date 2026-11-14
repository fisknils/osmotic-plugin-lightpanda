import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { Osmotic } from 'osmotic';
import lightpanda from '../src/index.cjs';
import { createSite, runChain, scripted, type Site } from './helpers/index.js';

// A page that shows navigator.userAgent and requests a script from its own site
const page = scripted(
	`document.body.insertAdjacentHTML('beforeend', '<p class="ua">' + navigator.userAgent + '</p>');` +
		`const s = document.createElement('script'); s.src = '/sub.js'; document.body.appendChild(s);`,
);

let site: Site;

before(async () => {
	site = await createSite({
		'/': page,
		'/slot': page,
		'/sub.js': { type: 'text/javascript', body: '' },
	});
	Osmotic.plugins([lightpanda({ waitUntil: 'networkidle' })]);
});

after(() => site.close());

test("osmotic's userAgent and headers are sent by the browser, and navigator.userAgent matches", async () => {
	const chain = Osmotic.get(site.url('/'))
		.set({ ua: '.ua' })
		.config({ userAgent: 'test-agent/1.0', headers: { 'X-Test': 'yes' } });
	const { rows, errors } = await runChain(chain);
	assert.deepEqual(errors, []);
	const [request] = site.requests.filter((r) => r.path === '/');
	assert.equal(request.headers['user-agent'], 'test-agent/1.0');
	assert.equal(request.headers['x-test'], 'yes');
	assert.deepEqual(rows, [{ ua: 'test-agent/1.0' }]);
});

test('headers and the user agent are also sent with requests the page makes', async () => {
	const subs = () => site.requests.filter((r) => r.path === '/sub.js');
	const before = subs().length;
	await runChain(Osmotic.get(site.url('/')).config({ userAgent: 'test-agent/2.0', headers: { 'X-Test': 'sub' } }));
	const [request] = subs().slice(before);
	assert.ok(request, 'the page requested /sub.js');
	assert.equal(request.headers['user-agent'], 'test-agent/2.0');
	assert.equal(request.headers['x-test'], 'sub');
});

test("a slot's userAgent and headers are used for the pages it loads", async () => {
	const chain = Osmotic.get(site.url('/slot'))
		.set({ ua: '.ua' })
		.config({ slots: [{ userAgent: 'slot-agent/1.0', headers: { 'X-Slot': '1' } }] });
	const { rows } = await runChain(chain);
	const [request] = site.requests.filter((r) => r.path === '/slot');
	assert.equal(request.headers['user-agent'], 'slot-agent/1.0');
	assert.equal(request.headers['x-slot'], '1');
	assert.deepEqual(rows, [{ ua: 'slot-agent/1.0' }]);
});
