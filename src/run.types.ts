import type { PreState } from "@changesets/types";
import type { GitHub } from "./github.ts";

export type GetVersionPrBodyProps = {
  hasPublishScript: boolean;
  branch: string;
  changedPackagesInfo: {
    highestLevel: number;
    private: boolean;
    content: string;
    header: string;
  }[];
  prBody?: string;
  prBodyMaxCharacters: number;
  preState?: PreState;
};

export type RunVersionProps = {
  script?: string;
  github: GitHub;
  cwd?: string;
  prTitle?: string;
  prBody?: string;
  commitMessage?: string;
  hasPublishScript?: boolean;
  prBodyMaxCharacters?: number;
  prDraft?: "always" | "create";
  branch?: string;
};

export type RunVersionResult = {
  pullRequestNumber: number;
};
