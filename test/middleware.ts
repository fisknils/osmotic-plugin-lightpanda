import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { Osmotic } from 'osmotic';
import lightpanda from '../src/index.cjs';
import { createSite, runChain, type Site } from './helpers/index.js';

// What middleware in front of the plugin received
interface Seen {
	status: number;
	headers: Headers;
}

let site: Site;

before(async () => {
	site = await createSite({
		'/headers': { body: '<p>headers</p>', headers: { 'x-test': '1', 'set-cookie': ['a=1', 'b=2'] } },
		'/sized': { body: '<p>sized</p>', headers: { 'content-length': '12' } },
	});
	Osmotic.plugins([lightpanda]);
});

after(() => site.close());

// A chain whose own middleware, which runs in front of the plugin, records the responses
function recording(chain: Osmotic, seen: Seen[]): Osmotic {
	return chain.useFetch(async (req, next) => {
		const res = await next(req);
		seen.push({ status: res.status, headers: res.headers });
		return res;
	});
}

test('middleware in front of the plugin sees the response headers, each set-cookie separately', async () => {
	const seen: Seen[] = [];
	await runChain(recording(new Osmotic(), seen).get(site.url('/headers')));
	assert.equal(seen.length, 1);
	assert.equal(seen[0].status, 200);
	assert.equal(seen[0].headers.get('x-test'), '1');
	assert.deepEqual(seen[0].headers.getSetCookie(), ['a=1', 'b=2']);
});

test('content-length of the original body is not copied to the rendered response', async () => {
	const seen: Seen[] = [];
	await runChain(recording(new Osmotic(), seen).get(site.url('/sized')));
	assert.equal(seen.length, 1);
	assert.equal(seen[0].headers.get('content-length'), null);
});
