import { createServer, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';

/** A request the proxy received. */
export interface ProxyRequest {
	/** The absolute URL the client asked the proxy for. */
	url: string;
	headers: IncomingHttpHeaders;
}

export interface Proxy {
	/** `http://127.0.0.1:<port>` */
	url: string;
	/** Every request received, in order. */
	requests: ProxyRequest[];
	close(): Promise<void>;
}

/**
 * An HTTP proxy that answers every request itself with `body`, instead of forwarding it,
 * so a page loaded through it is told apart from the real one.
 */
export async function createProxy(body: string): Promise<Proxy> {
	const requests: ProxyRequest[] = [];
	const server = createServer((req, res) => {
		requests.push({ url: req.url ?? '', headers: req.headers });
		res.writeHead(200, { 'content-type': 'text/html' });
		res.end(body);
	});
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const { port } = server.address() as AddressInfo;
	return {
		url: `http://127.0.0.1:${port}`,
		requests,
		close: () =>
			new Promise((resolve, reject) => {
				server.closeAllConnections();
				server.close((err) => (err ? reject(err) : resolve()));
			}),
	};
}
