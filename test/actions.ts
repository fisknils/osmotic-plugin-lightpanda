import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { Osmotic } from 'osmotic';
import lightpanda from '../src/index.cjs';
import { createSite, runChain, type Site } from './helpers/index.js';

let site: Site;

before(async () => {
	site = await createSite({
		'/button': `<button onclick="this.insertAdjacentHTML('afterend', '<p class=clicked>yes</p>')">Go</button>`,
		'/later': `<button onclick="setTimeout(() => this.insertAdjacentHTML('afterend', '<p class=later>done</p>'), 300)">Go</button>`,
		'/form': `<input id="q"><p class="echo"></p><script>
			const q = document.getElementById('q'), echo = document.querySelector('.echo');
			q.addEventListener('input', () => echo.textContent += 'input:' + q.value + ' ');
			q.addEventListener('change', () => echo.textContent += 'change:' + q.value);
		</script>`,
		'/page': '<h1>Title</h1>',
		'/gone': { status: 410, body: '<p>gone</p>' },
	});
	Osmotic.plugins([lightpanda]);
});

after(() => site.close());

test('actions run before the HTML is captured', async () => {
	const chain = new Osmotic()
		.render({ actions: (page) => page.click('button') })
		.get(site.url('/button'))
		.set({ clicked: '.clicked' });
	const { rows, errors } = await runChain(chain);
	assert.deepEqual(errors, []);
	assert.deepEqual(rows, [{ clicked: 'yes' }]);
});

test('page.evaluate() takes a function and an argument, or a string, and returns the result', async () => {
	const results: unknown[] = [];
	const chain = new Osmotic()
		.render({
			actions: async (page) => {
				results.push(
					await page.evaluate((text: string) => {
						document.body.insertAdjacentHTML('beforeend', `<p class="added">${text}</p>`);
						return document.querySelectorAll('h1, p').length;
					}, 'from evaluate'),
				);
				results.push(await page.evaluate('document.title + "|" + location.pathname'));
			},
		})
		.get(site.url('/page'))
		.set({ added: '.added' });
	const { rows, errors } = await runChain(chain);
	assert.deepEqual(errors, []);
	assert.deepEqual(rows, [{ added: 'from evaluate' }]);
	assert.deepEqual(results, [2, '|/page']);
});

test('page.fill() sets the value and fires input and change', async () => {
	const chain = new Osmotic()
		.render({ actions: (page) => page.fill('#q', 'lightpanda') })
		.get(site.url('/form'))
		// The handlers echo q.value; the value attribute in the HTML doesn't change, as in any browser
		.set({ echo: '.echo' });
	const { rows, errors } = await runChain(chain);
	assert.deepEqual(errors, []);
	assert.deepEqual(rows, [{ echo: 'input:lightpanda change:lightpanda' }]);
});

test('page.waitFor() waits for content that appears after an action', async () => {
	const chain = new Osmotic()
		.render({
			actions: async (page) => {
				await page.click('button');
				await page.waitFor('.later');
			},
		})
		.get(site.url('/later'))
		.set({ later: '.later' });
	const { rows, errors } = await runChain(chain);
	assert.deepEqual(errors, []);
	assert.deepEqual(rows, [{ later: 'done' }]);
});

test('a page.waitFor() timeout is reported as an error event', async () => {
	const chain = new Osmotic()
		.render({ actions: (page) => page.waitFor('.never', { timeout: 200 }) })
		.get(site.url('/page'));
	const { rows, errors } = await runChain(chain);
	assert.deepEqual(rows, []);
	assert.equal(errors.length, 1);
	assert.match((errors[0].error as Error).message, /\.never/);
});

test('page.click() on a selector that matches nothing fails the page, naming the selector', async () => {
	const chain = new Osmotic().render({ actions: (page) => page.click('.missing') }).get(site.url('/page'));
	const { errors } = await runChain(chain);
	assert.equal(errors.length, 1);
	assert.match((errors[0].error as Error).message, /\.missing/);
});

test('page.send() sends a CDP command to the page; page.url() and page.content() return the current page', async () => {
	const seen: unknown[] = [];
	const chain = new Osmotic()
		.render({
			actions: async (page, url) => {
				const { result } = await page.send('Runtime.evaluate', { expression: '6 * 7', returnByValue: true });
				seen.push(result.value, await page.url(), url);
				seen.push((await page.content()).includes('<h1>Title</h1>'));
			},
		})
		.get(site.url('/page'));
	const { errors } = await runChain(chain);
	assert.deepEqual(errors, []);
	assert.deepEqual(seen, [42, site.url('/page'), site.url('/page'), true]);
});

test('actions are not called for non-2xx responses', async () => {
	let called = false;
	const chain = new Osmotic()
		.render({
			actions: () => {
				called = true;
			},
		})
		.get(site.url('/gone'));
	const { skips } = await runChain(chain);
	assert.equal(skips.length, 1);
	assert.equal(called, false);
});

test('actions that throw fail the page with an error event', async () => {
	const chain = new Osmotic()
		.render({
			actions: () => {
				throw new Error('action failed');
			},
		})
		.get(site.url('/page'));
	const { rows, errors } = await runChain(chain);
	assert.deepEqual(rows, []);
	assert.equal((errors[0]?.error as Error).message, 'action failed');
});
