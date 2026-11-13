import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "@/test/msw/server";

// Any request without a handler fails the test, so nothing ever reaches a real API.
beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" });
});
afterEach(() => {
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});
