import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { Osmotic } from 'osmotic';
import lightpanda from '../src/index.cjs';
import { createSite, runChain, type Site } from './helpers/index.js';

let site: Site;

before(async () => {
	site = await createSite({ '/': '<p>page</p>' });
	Osmotic.plugins([lightpanda({ executablePath: '/nonexistent/lightpanda' })]);
});

after(() => site.close());

test('a missing binary fails the page with a message saying how to install Lightpanda', async () => {
	const { errors } = await runChain(Osmotic.get(site.url('/')));
	assert.equal(errors.length, 1);
	const { message } = errors[0].error as Error;
	assert.match(message, /\/nonexistent\/lightpanda/);
	assert.match(message, /npm install @lightpanda\/browser/);
});
