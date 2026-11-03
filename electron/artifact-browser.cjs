"use strict";

const http = require("node:http");
const { randomBytes } = require("node:crypto");

/** Desktop exports are served from a separate, read-only loopback origin.
 * No profile files, API routes, or desktop authentication are exposed.
 * Pages live in memory until quit; browser controls are self-contained. */
function createArtifactBrowser({ isTrusted, openExternal }) {
	const pages = new Map();
	let origin;
	let ready;
	let closed = false;
	const server = http.createServer((request, response) => {
		const html = pages.get(request.url);
		if (request.method !== "GET" || request.headers.host !== new URL(origin).host || html === undefined) {
			response.writeHead(404).end();
			return;
		}
		response.writeHead(200, {
			"Content-Type": "text/html; charset=utf-8",
			"Cache-Control": "no-store",
			"X-Content-Type-Options": "nosniff",
			// Even a compromised renderer cannot grant exported content the
			// browser's origin privileges or access to desktop/preload APIs.
			"Content-Security-Policy": "sandbox allow-scripts allow-downloads",
		});
		response.end(html);
	});
	function start() {
		return new Promise((resolve, reject) => {
			server.once("error", reject);
			server.listen(0, "127.0.0.1", () => {
				server.removeListener("error", reject);
				origin = `http://127.0.0.1:${server.address().port}`;
				server.unref();
				resolve();
			});
		});
	}
	return {
		async open(event, html) {
			if (!isTrusted(event)) throw new Error("Untrusted desktop request.");
			if (closed || typeof html !== "string" || !html.startsWith("<!doctype html>")) throw new Error("Invalid artifact document.");
			await (ready ??= start());
			if (closed) throw new Error("Artifact browser is closed.");
			const key = `/${randomBytes(24).toString("hex")}`;
			pages.set(key, html);
			try { await openExternal(`${origin}${key}`); }
			catch (error) { pages.delete(key); throw error; }
		},
		async close() {
			closed = true;
			pages.clear();
			await ready?.catch(() => {});
			if (server.listening) {
				server.closeAllConnections();
				await new Promise((resolve) => server.close(resolve));
			}
		},
	};
}

module.exports = { createArtifactBrowser };
