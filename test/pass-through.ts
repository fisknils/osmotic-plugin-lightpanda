import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { Osmotic } from 'osmotic';
import lightpanda, { type PassThroughResponse } from '../src/index.cjs';
import { createSite, runChain, type Site } from './helpers/index.js';

// What middleware in front of the plugin received: the response's status, headers and body
interface Seen {
	status: number;
	headers: Headers;
	body: string;
}

// A body whose script removes part of it, so the raw body and the rendered DOM differ
const RAW_BODY = '<p id="raw">raw</p><script>document.getElementById("raw").remove()</script>';
const RAW_MARK = /<p id="raw">raw<\/p>/;

const passThrough = (res: PassThroughResponse) => res.headers['x-pass'] === '1';

let site: Site;

before(async () => {
	site = await createSite({
		'/raw': { status: 202, headers: { 'X-Pass': '1' }, body: RAW_BODY },
		'/raw-error': { status: 405, headers: { 'x-pass': '1' }, body: '<p>error</p>' },
		'/challenge': { status: 202, headers: { 'x-challenge': '1' }, body: RAW_BODY },
	});
	Osmotic.plugins([lightpanda]);
});

after(() => site.close());

// A chain whose own middleware, which runs in front of the plugin, records the responses
function recording(chain: Osmotic, seen: Seen[]): Osmotic {
	return chain.useFetch(async (req, next) => {
		const res = await next(req);
		seen.push({ status: res.status, headers: res.headers, body: await res.clone().text() });
		return res;
	});
}

test('a 2xx response passThrough matches is returned with its raw body, without waiting for waitFor', async () => {
	const seen: Seen[] = [];
	const chain = recording(new Osmotic(), seen)
		.render({ passThrough, waitFor: '.never', timeout: 5000 })
		.get(site.url('/raw'));
	const started = Date.now();
	const { errors } = await runChain(chain);
	assert.deepEqual(errors, []);
	assert.ok(Date.now() - started < 5000);
	assert.equal(seen.length, 1);
	assert.equal(seen[0].status, 202);
	assert.equal(seen[0].headers.get('x-pass'), '1');
	assert.match(seen[0].body, RAW_MARK);
});

test('a non-2xx response passThrough matches is returned with its body and headers', async () => {
	const seen: Seen[] = [];
	await runChain(recording(new Osmotic(), seen).render({ passThrough }).get(site.url('/raw-error')));
	assert.equal(seen.length, 1);
	assert.equal(seen[0].status, 405);
	assert.equal(seen[0].headers.get('x-pass'), '1');
	assert.equal(seen[0].body, '<p>error</p>');
});

test('passThrough gets the URL, the status and the headers with lowercase names', async () => {
	const calls: PassThroughResponse[] = [];
	await runChain(new Osmotic().render({ passThrough: (res) => (calls.push(res), false) }).get(site.url('/raw')));
	assert.equal(calls.length, 1);
	assert.equal(calls[0].url, site.url('/raw'));
	assert.equal(calls[0].status, 202);
	assert.equal(calls[0].headers['x-pass'], '1');
});

test('without passThrough, the same response is rendered like any other page', async () => {
	const seen: Seen[] = [];
	await runChain(recording(new Osmotic(), seen).get(site.url('/challenge')));
	assert.equal(seen.length, 1);
	assert.equal(seen[0].status, 202);
	assert.doesNotMatch(seen[0].body, RAW_MARK);
});
