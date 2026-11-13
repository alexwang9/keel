import { afterAll, afterEach } from "vitest";
import { server } from "@/test/msw/server";

// Any request without a handler fails the test, so nothing ever reaches a real API. Listening at
// import time, before test modules load, also covers SDK clients built at module scope: they
// capture `fetch` when constructed, so a `beforeAll` listen would come too late for them.
server.listen({ onUnhandledFrame: "error" });
afterEach(() => {
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});
