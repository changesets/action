import { jest, mock, beforeEach, it, describe, expect } from "bun:test";
import fixturez from "fixturez";
import fs from "fs-extra";
import path from "path";
import writeChangeset from "@changesets/write";
import { Changeset } from "@changesets/types";
import { runVersion } from "./run.js";

mock.module("@actions/github", () => ({
  context: {
    repo: {
      owner: "changesets",
      repo: "action",
    },
    ref: "refs/heads/some-branch",
    sha: "xeac7",
  },
}));
mock.module("@actions/github/lib/utils", () => ({
  GitHub: {
    plugin: () => {
      // function necessary to be used as constructor
      return function () {
        return {
          rest: mockedGithubMethods,
        };
      };
    },
  },
  getOctokitOptions: jest.fn(),
}));
mock.module("./gitUtils", () => {
  return {
    push: jest.fn(),
    setupUser: jest.fn(),
    commitAll: jest.fn(),
    pushTags: jest.fn(),
    pullBranch: jest.fn(),
    switchToMaybeExistingBranch: jest.fn(),
    reset: jest.fn(),
    checkIfClean: jest.fn(),
  };
});

let mockedGithubMethods = {
  pulls: {
    create: jest.fn(),
    list: jest.fn(),
  },
  repos: {
    createRelease: jest.fn(),
  },
};

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
    await linkNodeModules(cwd);

    mockedGithubMethods.pulls.list.mockImplementationOnce(() => ({ data: [] }));

    mockedGithubMethods.pulls.create.mockImplementationOnce(() => ({
      data: { number: 123 },
    }));

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

    expect(mockedGithubMethods.pulls.create.mock.calls[0]).toMatchSnapshot(
      "Simple PR"
    );
  });

  it("only includes bumped packages in the PR body", async () => {
    let cwd = f.copy("simple-project");
    await linkNodeModules(cwd);

    mockedGithubMethods.pulls.list.mockImplementationOnce(() => ({ data: [] }));

    mockedGithubMethods.pulls.create.mockImplementationOnce(() => ({
      data: { number: 123 },
    }));

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

    expect(mockedGithubMethods.pulls.create.mock.calls[0]).toMatchSnapshot(
      "bumped only"
    );
  });

  it("doesn't include ignored package that got a dependency update in the PR body", async () => {
    let cwd = f.copy("ignored-package");
    await linkNodeModules(cwd);

    mockedGithubMethods.pulls.list.mockImplementationOnce(() => ({ data: [] }));

    mockedGithubMethods.pulls.create.mockImplementationOnce(() => ({
      data: { number: 123 },
    }));

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

    expect(mockedGithubMethods.pulls.create.mock.calls[0]).toMatchSnapshot(
      "ignored package"
    );
  });

  it("does not include changelog entries if full message exceeds size limit", async () => {
    let cwd = await setupTestEnvironment();

    await runVersion({
      githubToken: "@@GITHUB_TOKEN",
      cwd,
      prBodyMaxCharacters: 1000,
    });

    expect(mockedGithubMethods.pulls.create.mock.calls[0]).toMatchSnapshot(
      "full message exceeds size limit"
    );
    expect(mockedGithubMethods.pulls.create.mock.calls[0]?.[0].body).toMatch(
      /The changelog information of each package has been omitted from this message/
    );
  });

  it("does not include any release information if a message with simplified release info exceeds size limit", async () => {
    let cwd = await setupTestEnvironment();

    await runVersion({
      githubToken: "@@GITHUB_TOKEN",
      cwd,
      prBodyMaxCharacters: 500,
    });

    expect(mockedGithubMethods.pulls.create.mock.calls[0]).toMatchSnapshot(
      "simplified release info exceeds size limit"
    );
    expect(mockedGithubMethods.pulls.create.mock.calls[0]?.[0].body).toMatch(
      /All release information have been omitted from this message, as the content exceeds the size limit/
    );
  });
});

async function setupTestEnvironment() {
  let cwd = f.copy("simple-project");
  await linkNodeModules(cwd);

  mockedGithubMethods.pulls.list.mockImplementationOnce(() => ({ data: [] }));

  mockedGithubMethods.pulls.create.mockImplementationOnce(() => ({
    data: { number: 123 },
  }));

  await writeChangesets(
    [
      {
        releases: [
          {
            name: "simple-project-pkg-a",
            type: "minor",
          },
        ],
        summary: `# Non manus superum

## Nec cornibus aequa numinis multo onerosior adde

Lorem markdownum undas consumpserat malas, nec est lupus; memorant gentisque ab
limine auctore. Eatque et promptu deficit, quam videtur aequa est **faciat**,
locus. Potentia deus habebat pia quam qui coniuge frater, tibi habent fertque
viribus. E et cognoscere arcus, lacus aut sic pro crimina fuit tum **auxilium**
dictis, qua, in.

In modo. Nomen illa membra.

> Corpora gratissima parens montibus tum coeperat qua remulus caelum Helenamque?
> Non poenae modulatur Amathunta in concita superi, procerum pariter rapto cornu
> munera. Perrhaebum parvo manus contingere, morari, spes per totiens ut
> dividite proculcat facit, visa.

Adspicit sequitur diffamatamque superi Phoebo qua quin lammina utque: per? Exit
decus aut hac inpia, seducta mirantia extremo. Vidi pedes vetus. Saturnius
fluminis divesque vulnere aquis parce lapsis rabie si visa fulmineis.
`,
      },
    ],
    cwd
  );
  return cwd;
}
