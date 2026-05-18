import { getChangedPackagesSinceRef } from "@changesets/git";
import { humanId } from "human-id";

export function getNewChangesetTemplateUrl(
  headRepoUrl: string,
  headRef: string,
  templateContent: string,
) {
  const fileName = humanId({ separator: "-", capitalize: false });
  return `${headRepoUrl}/new/${headRef}?filename=.changeset/${fileName}.md&value=${encodeURIComponent(templateContent)}`;
}

export async function getNewChangesetTemplateContent(
  cwd: string,
  baseRef: string,
  prTitle: string,
) {
  const changedPackages = await getChangedPackagesSinceRef({
    cwd,
    ref: baseRef,
  });

  return `\
---
${changedPackages.map((p) => `"${p.packageJson.name}": patch`).join("\n")}
---

${prTitle}
`;
}
