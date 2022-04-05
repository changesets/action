import fixturez from "fixturez";
import * as github from "@actions/github";
import fs from "fs-extra";
import path from "path";
import writeChangeset from "@changesets/write";
import { Changeset } from "@changesets/types";
import { runVersion } from "./run";

jest.mock("@actions/github", () => ({
  context: {
    repo: {
      owner: "changesets",
      repo: "action",
    },
    ref: "refs/heads/some-branch",
    sha: "xeac7",
  },
  getOctokit: jest.fn(),
}));
jest.mock("./gitUtils");

let mockedGithubMethods = {
  search: {
    issuesAndPullRequests: jest.fn(),
  },
  pulls: {
    create: jest.fn(),
  },
  repos: {
    createRelease: jest.fn(),
  },
};
(github.getOctokit as any).mockImplementation(() => mockedGithubMethods);

let f = fixturez(__dirname);

const linkNodeModules = async (cwd: string) => {
  await fs.symlink(
    path.join(__dirname, "..", "node_modules"),
    path.join(cwd, "node_modules")
  );
};
const writeChangesets = (changesets: Changeset[], cwd: string) => {
  return Promise.all(changesets.map((commit) => writeChangeset(commit, cwd)));
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("version", () => {
  it("creates simple PR", async () => {
    let cwd = f.copy("simple-project");
    linkNodeModules(cwd);

    mockedGithubMethods.search.issuesAndPullRequests.mockImplementationOnce(
      () => ({ data: { items: [] } })
    );

    mockedGithubMethods.pulls.create.mockImplementationOnce(
      () => ({ data: { number: 123 } })
    );

    await writeChangesets(
      [
        {
          releases: [
            {
              name: "simple-project-pkg-a",
              type: "minor",
            },
            {
              name: "simple-project-pkg-b",
              type: "minor",
            },
          ],
          summary: "Awesome feature",
        },
      ],
      cwd
    );

    await runVersion({
      githubToken: "@@GITHUB_TOKEN",
      cwd,
    });

    expect(mockedGithubMethods.pulls.create.mock.calls[0]).toMatchSnapshot();
  });

  it("creates simple PR for a custom branch", async () => {
    let cwd = f.copy("simple-project");
    linkNodeModules(cwd);

    mockedGithubMethods.search.issuesAndPullRequests.mockImplementationOnce(
      () => ({ data: { items: [] } })
    );

    await writeChangesets(
      [
        {
          releases: [
            {
              name: "simple-project-pkg-a",
              type: "minor",
            },
            {
              name: "simple-project-pkg-b",
              type: "minor",
            },
          ],
          summary: "Awesome feature",
        },
      ],
      cwd
    );

    await runVersion({
      githubToken: "@@GITHUB_TOKEN",
      cwd,
      branch: 'feat/my-custom-branch'
    });

    expect(mockedGithubMethods.pulls.create.mock.calls[0]).toMatchSnapshot();
  });

  it("only includes bumped packages in the PR body", async () => {
    let cwd = f.copy("simple-project");
    linkNodeModules(cwd);

    mockedGithubMethods.search.issuesAndPullRequests.mockImplementationOnce(
      () => ({ data: { items: [] } })
    );

    mockedGithubMethods.pulls.create.mockImplementationOnce(
      () => ({ data: { number: 123 } })
    );

    await writeChangesets(
      [
        {
          releases: [
            {
              name: "simple-project-pkg-a",
              type: "minor",
            },
          ],
          summary: "Awesome feature",
        },
      ],
      cwd
    );

    await runVersion({
      githubToken: "@@GITHUB_TOKEN",
      cwd,
    });

    expect(mockedGithubMethods.pulls.create.mock.calls[0]).toMatchSnapshot();
  });

  it("doesn't include ignored package that got a dependency update in the PR body", async () => {
    let cwd = f.copy("ignored-package");
    linkNodeModules(cwd);

    mockedGithubMethods.search.issuesAndPullRequests.mockImplementationOnce(
      () => ({ data: { items: [] } })
    );

    mockedGithubMethods.pulls.create.mockImplementationOnce(
      () => ({ data: { number: 123 } })
    );

    await writeChangesets(
      [
        {
          releases: [
            {
              name: "ignored-package-pkg-b",
              type: "minor",
            },
          ],
          summary: "Awesome feature",
        },
      ],
      cwd
    );

    await runVersion({
      githubToken: "@@GITHUB_TOKEN",
      cwd,
    });

    expect(mockedGithubMethods.pulls.create.mock.calls[0]).toMatchSnapshot();
  });
});
