import { Octokit } from "@octokit/rest";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { describeError } from "@/lib/log";
import { server } from "@/test/msw/server";

describe("describeError", () => {
  it("keeps name, message and status but drops the request an Octokit error carries", async () => {
    server.use(
      http.post("https://api.github.com/boom", () =>
        HttpResponse.json({ message: "Server Error" }, { status: 500 }),
      ),
    );
    const error: unknown = await new Octokit()
      .request("POST /boom", { client_secret: "s3cret" })
      .catch((caught: unknown) => caught);

    const described = describeError(error);

    expect(described).toMatchObject({ name: "HttpError", status: 500 });
    expect(JSON.stringify(described)).not.toContain("s3cret");
    // Proves the test means something: the raw error does carry the secret.
    expect(JSON.stringify((error as { request: unknown }).request)).toContain("s3cret");
  });

  it("handles non-Error values", () => {
    expect(describeError("boom")).toEqual({ name: "NonError", message: "boom" });
  });
});
