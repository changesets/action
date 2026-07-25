import type { ReleasePlan, VersionType } from "@changesets/types";

type PublishableRelease = {
  name: string;
  type: Exclude<VersionType, "none">;
  oldVersion: string;
  newVersion: string;
  changesets: string[];
};

const bumpOrder = ["major", "minor", "patch"] as const;

export function summarizeReleasePlan(releasePlan: ReleasePlan) {
  const releases = releasePlan.releases.flatMap<PublishableRelease>(
    ({ name, type, oldVersion, newVersion, changesets }) =>
      type === "none"
        ? []
        : [{ name, type, oldVersion, newVersion, changesets }],
  );

  const maxBump =
    bumpOrder.find((bump) =>
      releases.some((release) => release.type === bump),
    ) ?? "none";

  return {
    hasChangesets: releasePlan.changesets.length > 0,
    maxBump,
    releases,
  };
}
