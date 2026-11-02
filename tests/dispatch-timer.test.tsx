import React, { act } from "react";
(globalThis as { React?: typeof React }).React = React;
import assert from "node:assert/strict";
import { test } from "node:test";
import { createRoot } from "react-dom/client";
import { parseHTML } from "linkedom";
import { DispatchCard } from "../components/artifacts/dispatch-card.tsx";
import { JobsContext } from "../components/jobs-context.ts";
import type { JobRecord } from "../src/core/index.ts";

const dom = parseHTML("<html><body></body></html>");
Object.assign(globalThis, { window: dom.window, document: dom.document, Element: dom.window.Element,
	HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });

test("dispatch elapsed time ticks without job updates and stops on completion or unmount", async (t) => {
	const start = Date.parse("2026-11-02T00:00:00Z");
	t.mock.timers.enable({ apis: ["Date", "setInterval"], now: start });
	const clear = t.mock.method(globalThis, "clearInterval");
	const job = { id: "job_figure", chatId: "chat", toolCallId: "figure", kind: "visual", status: "running", createdAt: new Date(start).toISOString() } as JobRecord;
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	const render = (record: JobRecord) => <JobsContext.Provider value={[record]}><DispatchCard toolCallId="figure" kind="visual" /></JobsContext.Provider>;
	try {
		await act(async () => root.render(render(job)));
		assert.match(host.textContent ?? "", /· 0s/);
		await act(async () => t.mock.timers.tick(1000));
		assert.match(host.textContent ?? "", /· 1s/);
		await act(async () => t.mock.timers.tick(1000));
		assert.match(host.textContent ?? "", /· 2s/);
		await act(async () => root.render(render({ ...job, status: "done" })));
		assert.match(host.textContent ?? "", /finished/);
		assert.equal(clear.mock.callCount(), 1, "completion clears the ticking interval");
		await act(async () => t.mock.timers.tick(10000));
		assert.match(host.textContent ?? "", /finished/);
		await act(async () => root.render(render(job)));
	} finally {
		await act(async () => root.unmount());
		host.remove();
	}
	assert.equal(clear.mock.callCount(), 2, "unmount also clears the interval");
});
