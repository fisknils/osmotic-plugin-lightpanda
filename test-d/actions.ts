import { Osmotic } from 'osmotic';
import type { LightpandaPage, PassThroughResponse, RenderOptions } from '../src/index.cjs';

const actions: RenderOptions['actions'] = async (page: LightpandaPage, url: string) => {
	await page.click('button');
	await page.fill('#q', 'text');
	await page.waitFor('.result');
	await page.waitFor('.result', { timeout: 1000 });
	const count: number = await page.evaluate((selector: string) => document.querySelectorAll(selector).length, 'li');
	const title: unknown = await page.evaluate('document.title');
	const html: string = await page.content();
	const current: string = await page.url();
	const { result } = await page.send('Runtime.evaluate', { expression: '1' });
	return [count, title, html, current, result, url];
};

new Osmotic().render({ actions }).get('https://example.com');

// passThrough takes the response's URL, status and headers
const passThrough = (res: PassThroughResponse) => res.status === 202 && 'x-a' in res.headers && res.url !== '';
new Osmotic().render({ passThrough });

// @ts-expect-error: passThrough returns a boolean
new Osmotic().render({ passThrough: () => 'yes' });

// @ts-expect-error: evaluate's argument must match the function's parameter
void ({} as LightpandaPage).evaluate((n: number) => n * 2, 'two');

// @ts-expect-error: click takes a selector string
void ({} as LightpandaPage).click(1);
