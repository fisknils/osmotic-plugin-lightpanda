import type { FetchRequest } from 'osmotic';
import type { RenderOptions } from '../types/options.js';
import { lowercaseKeys } from '../utils/lowercase-keys.js';
import { pageResponse } from '../utils/page-response.js';
import { requestCookies } from '../utils/request-cookies.js';
import { splitHeaders } from '../utils/split-headers.js';
import { withTimeout } from '../utils/with-timeout.js';
import type { CdpConnection, CdpEvent } from './CdpConnection.js';
import { PageSession } from './PageSession.js';

/** The browser context pages are opened in, on its own connection. */
export interface BrowserContext {
	cdp: CdpConnection;
	browserContextId: string;
}

const DEFAULT_TIMEOUT = 30000;

// waitUntil values, as names of Page.lifecycleEvent
const LIFECYCLE = { load: 'load', domcontentloaded: 'DOMContentLoaded', networkidle: 'networkIdle' } as const;

// How often waitFor checks for its selector
const POLL_MS = 50;

/** Load `req.url` in a new page in `context` and return the rendered HTML as a Response. */
export async function renderPage(
	context: BrowserContext,
	req: FetchRequest,
	options: RenderOptions,
): Promise<Response> {
	const { cdp, browserContextId } = context;
	const timeout = options.timeout ?? DEFAULT_TIMEOUT;
	const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank', browserContextId });
	let page: PageSession | undefined;
	try {
		const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
		page = new PageSession(cdp, sessionId);
		await Promise.all([
			page.send('Page.enable'),
			page.send('Network.enable'),
			page.send('Page.setLifecycleEventsEnabled', { enabled: true }),
		]);
		await applyRequest(page, req, options.block ?? []);
		const nav = await withTimeout(page.send('Page.navigate', { url: req.url }), timeout, `${req.url} to load`);
		if (nav.errorText) throw new Error(`Couldn't load ${req.url}: ${nav.errorText}`);
		const ofPage = (e: CdpEvent) => e.params?.frameId === undefined || e.params.frameId === nav.frameId;

		// The page's own response, after redirects, or the failure of its request
		const event = await page.wait(
			(e) =>
				(e.method === 'Network.responseReceived' || e.method === 'Network.loadingFailed') &&
				e.params.type === 'Document' &&
				ofPage(e),
			timeout,
			`the response from ${req.url}`,
		);
		if (event.method === 'Network.loadingFailed')
			throw new Error(`Couldn't load ${req.url}: ${event.params.errorText}`);
		const { url, status, headers, mimeType } = event.params.response;
		const resHeaders = splitHeaders(headers ?? {});
		const type = resHeaders.find((h) => h.name.toLowerCase() === 'content-type')?.value ?? mimeType ?? 'text/html';
		// osmotic skips these anyway, so don't wait for content that won't come
		if (status < 200 || status > 299 || !type.includes('html'))
			return pageResponse(null, status, type, url, resHeaders);

		const waitUntil = options.waitUntil ?? 'load';
		if (waitUntil !== 'commit') {
			const name = LIFECYCLE[waitUntil];
			await page.wait(
				(e) => e.method === 'Page.lifecycleEvent' && e.params.name === name && ofPage(e),
				timeout,
				`${waitUntil} on ${url}`,
			);
		}
		if (options.waitFor) await waitForSelector(page, options.waitFor, timeout);

		const { root } = await page.send('DOM.getDocument', { depth: 0 });
		const { outerHTML } = await page.send('DOM.getOuterHTML', { nodeId: root.nodeId });
		// The URL now, which scripts may have changed with history.pushState()
		const finalUrl = await page.evaluate<string>('location.href');
		return pageResponse(outerHTML, status, type, finalUrl, resHeaders);
	} finally {
		page?.dispose();
		await cdp.send('Target.closeTarget', { targetId }).catch(() => {});
	}
}

// Apply osmotic's request headers to the page, and fail requests of the blocked resource types
async function applyRequest(page: PageSession, req: FetchRequest, block: string[]): Promise<void> {
	const { 'user-agent': userAgent, cookie, ...headers } = lowercaseKeys(req.headers);
	// Also sets navigator.userAgent, so it matches the header
	if (userAgent) await page.send('Emulation.setUserAgentOverride', { userAgent });
	if (Object.keys(headers).length) await page.send('Network.setExtraHTTPHeaders', { headers });
	// Cookies, unlike a header, go only to the page's site
	if (cookie) await page.send('Network.setCookies', { cookies: requestCookies(cookie, req.url) });
	if (!block.length) return;
	const blocked = new Set(block.map((type) => type.toLowerCase()));
	// Lightpanda reports fetch() requests as XHR
	if (blocked.has('fetch')) blocked.add('xhr');
	page.on('Fetch.requestPaused', ({ requestId, resourceType }) => {
		const fail = blocked.has(String(resourceType).toLowerCase());
		page
			.send(
				fail ? 'Fetch.failRequest' : 'Fetch.continueRequest',
				fail ? { requestId, errorReason: 'BlockedByClient' } : { requestId },
			)
			.catch(() => {}); // The page may have closed meanwhile
	});
	await page.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
}

// Resolve once an element matches `selector`, checking every POLL_MS
async function waitForSelector(page: PageSession, selector: string, timeout: number): Promise<void> {
	const deadline = Date.now() + timeout;
	const expression = `!!document.querySelector(${JSON.stringify(selector)})`;
	while (!(await page.evaluate<boolean>(expression))) {
		if (Date.now() >= deadline) throw new Error(`Timed out after ${timeout} ms waiting for ${selector}`);
		await new Promise((resolve) => setTimeout(resolve, POLL_MS));
	}
}
