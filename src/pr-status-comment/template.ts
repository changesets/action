import { humanId } from "human-id";

export function getNewChangesetUrl(
  headRepoUrl: string,
  headRef: string,
  templateContent: string,
) {
  const fileName = humanId({ separator: "-", capitalize: false });
  return `${headRepoUrl}/new/${headRef}?filename=.changeset/${fileName}.md&value=${encodeURIComponent(templateContent)}`;
}

export function getNewChangesetTemplateContent(
  changedPackageNames: ReadonlyArray<string>,
  prTitle: string,
) {
  return `\
---
${changedPackageNames.map((pkgName) => `"${pkgName}": patch`).join("\n")}
---

${prTitle}
`;
}
