import type {
  ComprehensiveRelease,
  NewChangeset,
  ReleasePlan,
} from "@changesets/types";
import { describe, expect, it } from "vitest";
import { summarizeReleasePlan } from "./summary.ts";

function release(
  name: string,
  type: ComprehensiveRelease["type"],
  oldVersion: string,
  newVersion: string,
): ComprehensiveRelease {
  return { name, type, oldVersion, newVersion, changesets: [] };
}

function changeset(
  id: string,
  releases: NewChangeset["releases"] = [],
): NewChangeset {
  return { id, summary: "", releases };
}

function releasePlan(
  releases: ComprehensiveRelease[],
  changesets: NewChangeset[] = [],
): ReleasePlan {
  return { changesets, releases, preState: undefined };
}

describe("summarizeReleasePlan", () => {
  it("reports the highest bump across the released packages", () => {
    const summary = summarizeReleasePlan(
      releasePlan([
        release("pkg-a", "patch", "1.0.0", "1.0.1"),
        release("pkg-b", "major", "2.3.0", "3.0.0"),
        release("pkg-c", "minor", "0.4.0", "0.5.0"),
      ]),
    );

    expect(summary.maxBump).toBe("major");
  });

  it("reports minor when no package is released as major", () => {
    const summary = summarizeReleasePlan(
      releasePlan([
        release("pkg-a", "patch", "1.0.0", "1.0.1"),
        release("pkg-b", "minor", "2.3.0", "2.4.0"),
      ]),
    );

    expect(summary.maxBump).toBe("minor");
  });

  it("carries the name, type and versions of each released package", () => {
    const summary = summarizeReleasePlan(
      releasePlan([release("pkg-a", "minor", "1.1.0", "1.2.0")]),
    );

    expect(summary.releases).toEqual([
      {
        name: "pkg-a",
        type: "minor",
        oldVersion: "1.1.0",
        newVersion: "1.2.0",
      },
    ]);
  });

  it("omits packages that are not released", () => {
    const summary = summarizeReleasePlan(
      releasePlan([
        release("pkg-a", "none", "1.0.0", "1.0.0"),
        release("pkg-b", "patch", "2.0.0", "2.0.1"),
      ]),
    );

    expect(summary.maxBump).toBe("patch");
    expect(summary.releases).toEqual([
      {
        name: "pkg-b",
        type: "patch",
        oldVersion: "2.0.0",
        newVersion: "2.0.1",
      },
    ]);
  });

  it("reports none when there is nothing to release", () => {
    const summary = summarizeReleasePlan(releasePlan([]));

    expect(summary.maxBump).toBe("none");
    expect(summary.releases).toEqual([]);
  });

  it("reports none when every package is unreleased", () => {
    const summary = summarizeReleasePlan(
      releasePlan([release("pkg-a", "none", "1.0.0", "1.0.0")]),
    );

    expect(summary.maxBump).toBe("none");
    expect(summary.releases).toEqual([]);
  });

  it("reports no changesets when the pull request has none", () => {
    const summary = summarizeReleasePlan(
      releasePlan([release("pkg-a", "patch", "1.0.0", "1.0.1")]),
    );

    expect(summary.hasChangesets).toBe(false);
  });

  it("reports changesets when the pull request has them", () => {
    const summary = summarizeReleasePlan(
      releasePlan(
        [release("pkg-a", "patch", "1.0.0", "1.0.1")],
        [changeset("tidy-pandas-shake", [{ name: "pkg-a", type: "patch" }])],
      ),
    );

    expect(summary.hasChangesets).toBe(true);
  });

  it("separates an empty changeset from a missing one", () => {
    const empty = summarizeReleasePlan(
      releasePlan([], [changeset("lucky-moons-wave")]),
    );
    const missing = summarizeReleasePlan(releasePlan([]));

    expect(empty.hasChangesets).toBe(true);
    expect(missing.hasChangesets).toBe(false);
    expect(empty.maxBump).toBe(missing.maxBump);
    expect(empty.releases).toEqual(missing.releases);
  });
});
