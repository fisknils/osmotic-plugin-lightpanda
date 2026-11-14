import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { Osmotic } from 'osmotic';
import lightpanda from '../src/index.cjs';
import { createSite, type Site } from './helpers/index.js';

let site: Site;

before(async () => {
	site = await createSite({
		'/robots.txt': { type: 'text/plain', body: 'User-agent: *\nAllow: /' },
		'/': '<p>page</p>',
	});
	Osmotic.plugins([lightpanda]);
});

after(() => site.close());

test('robots.txt is fetched without the browser, and the page with it', async () => {
	await Osmotic.get(site.url('/')).run(); // respects robots.txt by default
	const robots = site.requests.filter((r) => r.path === '/robots.txt');
	const page = site.requests.filter((r) => r.path === '/');
	assert.equal(robots.length, 1);
	assert.equal(page.length, 1);
	// Lightpanda sends client hints naming itself; Node's fetch doesn't
	assert.equal(robots[0].headers['sec-ch-ua'], undefined);
	assert.match(String(page[0].headers['sec-ch-ua']), /Lightpanda/);
});
