import { describe, expect, it } from "vitest";
import { assertValidStageInput } from "./options.ts";

describe("publish stage input", () => {
  it("rejects an explicit stage override with a custom script", () => {
    expect(() => assertValidStageInput(false, "pnpm release")).toThrow(
      "cannot be combined with a custom 'script'",
    );
  });

  it("allows an omitted stage input with a custom script", () => {
    expect(() =>
      assertValidStageInput(undefined, "pnpm release"),
    ).not.toThrow();
  });
});
