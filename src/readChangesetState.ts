import { readPreState } from "@changesets/pre";
import { readChangesets } from "@changesets/read";
import type { PreState, NewChangeset } from "@changesets/types";

export type ChangesetState = {
  preState: PreState | undefined;
  changesets: NewChangeset[];
};

export default async function readChangesetState(
  cwd: string = process.cwd(),
): Promise<ChangesetState> {
  let preState = await readPreState(cwd);
  let changesets = await readChangesets(cwd);

  if (preState !== undefined && preState.mode === "pre") {
    return {
      preState,
      changesets: changesets.filter(
        (changeset) => !changeset.id.startsWith("pre/"),
      ),
    };
  }

  return {
    preState: undefined,
    changesets,
  };
}
