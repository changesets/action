import fixturez from "fixturez";
import * as github from "@actions/github";
import fs from "fs-extra";
import path from "path";
import writeChangeset from "@changesets/write";
import { Changeset } from "@changesets/types";
import { runVersion, runPublish } from "./run";
import * as Utils from "./utils";

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

let mockedExecResponse: Awaited<ReturnType<typeof Utils.execWithOutput>> = {
  code: 1,
  stderr: "",
  stdout: "",
};

jest
  .spyOn(Utils, "execWithOutput")
  .mockImplementation(() => Promise.resolve(mockedExecResponse));

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

    expect(mockedGithubMethods.pulls.create.mock.calls[0]).toMatchSnapshot();
  });

  it("only includes bumped packages in the PR body", async () => {
    let cwd = f.copy("simple-project");
    linkNodeModules(cwd);

    mockedGithubMethods.search.issuesAndPullRequests.mockImplementationOnce(
      () => ({ data: { items: [] } })
    );

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

    expect(mockedGithubMethods.pulls.create.mock.calls[0]).toMatchSnapshot();
  });

  it("doesn't include ignored package that got a dependency update in the PR body", async () => {
    let cwd = f.copy("ignored-package");
    linkNodeModules(cwd);

    mockedGithubMethods.search.issuesAndPullRequests.mockImplementationOnce(
      () => ({ data: { items: [] } })
    );

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

    expect(mockedGithubMethods.pulls.create.mock.calls[0]).toMatchSnapshot();
  });

  it("does not include changelog entries if full message exceeds size limit", async () => {
    let cwd = f.copy("simple-project");
    linkNodeModules(cwd);

    mockedGithubMethods.search.issuesAndPullRequests.mockImplementationOnce(
      () => ({ data: { items: [] } })
    );

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

    await runVersion({
      githubToken: "@@GITHUB_TOKEN",
      cwd,
      prBodyMaxCharacters: 1000,
    });

    expect(mockedGithubMethods.pulls.create.mock.calls[0]).toMatchSnapshot();
    expect(mockedGithubMethods.pulls.create.mock.calls[0][0].body).toMatch(
      /The changelog information of each package has been omitted from this message/
    );
  });

  it("does not include any release information if a message with simplified release info exceeds size limit", async () => {
    let cwd = f.copy("simple-project");
    linkNodeModules(cwd);

    mockedGithubMethods.search.issuesAndPullRequests.mockImplementationOnce(
      () => ({ data: { items: [] } })
    );

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

    await runVersion({
      githubToken: "@@GITHUB_TOKEN",
      cwd,
      prBodyMaxCharacters: 500,
    });

    expect(mockedGithubMethods.pulls.create.mock.calls[0]).toMatchSnapshot();
    expect(mockedGithubMethods.pulls.create.mock.calls[0][0].body).toMatch(
      /All release information have been omitted from this message, as the content exceeds the size limit/
    );
  });
});

describe("publish", () => {
  it("should create a github release per each package by default", async () => {
    let cwd = f.copy("simple-project-published");
    linkNodeModules(cwd);

    // Fake a publish command result
    mockedExecResponse = {
      code: 0,
      stderr: "",
      stdout: [
        `🦋  New tag: simple-project-pkg-a@0.0.1`,
        `🦋  New tag: simple-project-pkg-b@0.0.1`,
      ].join("\n"),
    };

    // Fake a CHANGELOG.md files

    const response = await runPublish({
      githubToken: "@@GITHUB_TOKEN",
      createGithubReleases: true,
      script: "npm run release",
      cwd,
    });

    expect(response.published).toBeTruthy();
    response.published && expect(response.publishedPackages.length).toBe(2);
    expect(mockedGithubMethods.repos.createRelease.mock.calls.length).toBe(2);
    expect(mockedGithubMethods.repos.createRelease.mock.calls[0][0].name).toBe(
      "simple-project-pkg-a@0.0.1"
    );
    expect(mockedGithubMethods.repos.createRelease.mock.calls[1][0].name).toBe(
      "simple-project-pkg-b@0.0.1"
    );
  });

  it("should create an aggregated github release when createGithubReleases: aggreate is set", async () => {
    let cwd = f.copy("simple-project-published");
    linkNodeModules(cwd);

    // Fake a publish command result
    mockedExecResponse = {
      code: 0,
      stderr: "",
      stdout: [
        `🦋  New tag: simple-project-pkg-a@0.0.1`,
        `🦋  New tag: simple-project-pkg-b@0.0.1`,
      ].join("\n"),
    };

    const response = await runPublish({
      githubToken: "@@GITHUB_TOKEN",
      createGithubReleases: "aggregate",
      script: "npm run release",
      githubReleaseName: "", // make sure empty string is treat as undefined parameter
      cwd,
    });

    expect(response.published).toBeTruthy();
    response.published && expect(response.publishedPackages.length).toBe(2);
    expect(mockedGithubMethods.repos.createRelease.mock.calls.length).toBe(1);
    const params = mockedGithubMethods.repos.createRelease.mock.calls[0][0];

    expect(params.name).toEqual(expect.stringContaining("Release "));
    expect(params.body).toContain(`## simple-project-pkg-a@0.0.1`);
    expect(params.body).toContain(`## simple-project-pkg-b@0.0.1`);
    expect(params.body).toContain(`change something in a`);
    expect(params.body).toContain(`change something in b`);
  });

  it("should allow to customize release title with createGithubReleases: aggreate", async () => {
    let cwd = f.copy("simple-project-published");
    linkNodeModules(cwd);

    // Fake a publish command result
    mockedExecResponse = {
      code: 0,
      stderr: "",
      stdout: [
        `🦋  New tag: simple-project-pkg-a@0.0.1`,
        `🦋  New tag: simple-project-pkg-b@0.0.1`,
      ].join("\n"),
    };

    const response = await runPublish({
      githubToken: "@@GITHUB_TOKEN",
      createGithubReleases: "aggregate",
      script: "npm run release",
      githubReleaseName: `My Test Release`,
      githubTagName: `mytag`,
      cwd,
    });

    console.log('response', response);

    expect(response.published).toBeTruthy();
    response.published && expect(response.publishedPackages.length).toBe(2);
    expect(mockedGithubMethods.repos.createRelease.mock.calls.length).toBe(1);
    const params = mockedGithubMethods.repos.createRelease.mock.calls[0][0];

    expect(params.name).toBe("My Test Release");
    expect(params.body).toContain(`## simple-project-pkg-a@0.0.1`);
    expect(params.body).toContain(`## simple-project-pkg-b@0.0.1`);
    expect(params.body).toContain(`change something in a`);
    expect(params.body).toContain(`change something in b`);
  });
});
