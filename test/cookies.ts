import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { Osmotic } from 'osmotic';
import lightpanda from '../src/index.cjs';
import { createSite, runChain, scripted, type Site } from './helpers/index.js';

let site: Site;

before(async () => {
	site = await createSite({
		// Requests a script from the same server under another hostname, and fetches from its own site
		'/cookie': scripted(
			`const s = document.createElement('script'); s.src = 'http://localhost:' + location.port + '/other.js'; document.body.appendChild(s);` +
				`fetch('/api').then(() => document.body.insertAdjacentHTML('beforeend', '<p class="done">done</p>'))`,
		),
		'/api': { type: 'application/json', body: '{}' },
		'/other.js': { type: 'text/javascript', body: '' },
	});
	Osmotic.plugins([lightpanda]);
});

after(() => site.close());

test('a Cookie header from middleware in front is a cookie for the page site only', async () => {
	const chain = new Osmotic()
		.useFetch((req, next) => next({ ...req, headers: { ...req.headers, Cookie: 'token=abc' } }))
		.render({ waitUntil: 'networkidle', waitFor: '.done', timeout: 5000 })
		.get(site.url('/cookie'))
		.set({ done: '.done' });
	const { rows, errors } = await runChain(chain);
	assert.deepEqual(errors, []);
	assert.deepEqual(rows, [{ done: 'done' }]);
	const cookieOf = (path: string, host: string) =>
		site.requests.find((r) => r.path === path && r.host.startsWith(host))?.headers.cookie;
	assert.equal(cookieOf('/cookie', '127.0.0.1'), 'token=abc');
	assert.equal(cookieOf('/api', '127.0.0.1'), 'token=abc');
	assert.ok(site.requests.some((r) => r.path === '/other.js' && r.host.startsWith('localhost')));
	assert.equal(cookieOf('/other.js', 'localhost'), undefined);
});
