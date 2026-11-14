/**
 * Response headers as CDP reports them, with repeated headers such as `set-cookie` joined
 * by newlines, as a list with one entry per value.
 */
export function splitHeaders(headers: Record<string, string>): { name: string; value: string }[] {
	return Object.entries(headers).flatMap(([name, value]) =>
		String(value)
			.split('\n')
			.map((v) => ({ name, value: v })),
	);
}
