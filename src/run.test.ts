import path from "node:path";
import type { Changeset } from "@changesets/types";
import writeChangeset from "@changesets/write";
import { createFixture } from "fs-fixture";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Git } from "./git.ts";
import { setupOctokit } from "./octokit.ts";
import { runVersion, getVersionPrBody } from "./run.ts";

vi.mock("@actions/github", () => ({
  context: {
    repo: {
      owner: "changesets",
      repo: "action",
    },
    ref: "refs/heads/some-branch",
    sha: "xeac7",
  },
  getOctokit: () => ({
    rest: mockedGithubMethods,
    graphql: mockedGraphql,
  }),
}));
vi.mock("./git.ts");
vi.mock("@changesets/ghcommit/git");

let mockedGithubMethods = {
  pulls: {
    create: vi.fn(),
    list: vi.fn(),
  },
  repos: {
    createRelease: vi.fn(),
  },
};
let mockedGraphql = vi.fn();

const nodeModulesDir = path.join(import.meta.dirname, "..", "node_modules");

function createSimpleProjectFixture() {
  return createFixture({
    node_modules: (api) => api.symlink(nodeModulesDir),
    ".changeset/config.json": JSON.stringify({}),
    "packages/pkg-a/package.json": JSON.stringify({
      name: "changesets-dev-simple-project-pkg-a",
      version: "1.0.0",
      dependencies: {
        "changesets-dev-simple-project-pkg-b": "1.0.0",
      },
    }),
    "packages/pkg-b/package.json": JSON.stringify({
      name: "changesets-dev-simple-project-pkg-b",
      version: "1.0.0",
    }),
    "package.json": JSON.stringify({
      name: "simple-project",
      version: "1.0.0",
      private: true,
      workspaces: ["packages/*"],
    }),
  });
}

function createIgnoredPackageFixture() {
  return createFixture({
    node_modules: (api) => api.symlink(nodeModulesDir),
    ".changeset/config.json": JSON.stringify({
      ignore: ["changesets-dev-ignored-package-pkg-a"],
    }),
    "packages/pkg-a/package.json": JSON.stringify({
      name: "changesets-dev-ignored-package-pkg-a",
      version: "1.0.0",
      dependencies: {
        "changesets-dev-ignored-package-pkg-b": "1.0.0",
      },
    }),
    "packages/pkg-b/package.json": JSON.stringify({
      name: "changesets-dev-ignored-package-pkg-b",
      version: "1.0.0",
    }),
    "package.json": JSON.stringify({
      name: "ignored-package",
      version: "1.0.0",
      private: true,
      workspaces: ["packages/*"],
    }),
  });
}

const writeChangesets = (changesets: Changeset[], cwd: string) => {
  return Promise.all(changesets.map((commit) => writeChangeset(commit, cwd)));
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("version", () => {
  it("creates simple PR", async () => {
    await using fixture = await createSimpleProjectFixture();
    const cwd = fixture.path;

    mockedGithubMethods.pulls.list.mockImplementationOnce(() => ({ data: [] }));

    mockedGithubMethods.pulls.create.mockImplementationOnce(() => ({
      data: { number: 123 },
    }));

    await writeChangesets(
      [
        {
          releases: [
            {
              name: "changesets-dev-simple-project-pkg-a",
              type: "minor",
            },
            {
              name: "changesets-dev-simple-project-pkg-b",
              type: "minor",
            },
          ],
          summary: "Awesome feature",
        },
      ],
      cwd,
    );

    await runVersion({
      octokit: setupOctokit("@@GITHUB_TOKEN"),
      githubToken: "@@GITHUB_TOKEN",
      git: new Git({ cwd }),
      cwd,
    });

    expect(mockedGithubMethods.pulls.create.mock.calls[0]).toMatchSnapshot();
  });

  it('creates a draft PR when prDraft is "create"', async () => {
    await using fixture = await createSimpleProjectFixture();
    const cwd = fixture.path;

    mockedGithubMethods.pulls.list.mockImplementationOnce(() => ({ data: [] }));

    mockedGithubMethods.pulls.create.mockImplementationOnce(() => ({
      data: { number: 123 },
    }));

    await writeChangesets(
      [
        {
          releases: [
            {
              name: "changesets-dev-simple-project-pkg-a",
              type: "minor",
            },
          ],
          summary: "Awesome feature",
        },
      ],
      cwd,
    );

    await runVersion({
      octokit: setupOctokit("@@GITHUB_TOKEN"),
      githubToken: "@@GITHUB_TOKEN",
      git: new Git({ cwd }),
      cwd,
      prDraft: "create",
    });

    expect(mockedGithubMethods.pulls.create.mock.calls[0]).toMatchSnapshot();
  });

  it("only includes bumped packages in the PR body", async () => {
    await using fixture = await createSimpleProjectFixture();
    const cwd = fixture.path;

    mockedGithubMethods.pulls.list.mockImplementationOnce(() => ({ data: [] }));

    mockedGithubMethods.pulls.create.mockImplementationOnce(() => ({
      data: { number: 123 },
    }));

    await writeChangesets(
      [
        {
          releases: [
            {
              name: "changesets-dev-simple-project-pkg-a",
              type: "minor",
            },
          ],
          summary: "Awesome feature",
        },
      ],
      cwd,
    );

    await runVersion({
      octokit: setupOctokit("@@GITHUB_TOKEN"),
      githubToken: "@@GITHUB_TOKEN",
      git: new Git({ cwd }),
      cwd,
    });

    expect(mockedGithubMethods.pulls.create.mock.calls[0]).toMatchSnapshot();
  });

  it("doesn't include ignored package that got a dependency update in the PR body", async () => {
    await using fixture = await createIgnoredPackageFixture();
    const cwd = fixture.path;

    mockedGithubMethods.pulls.list.mockImplementationOnce(() => ({ data: [] }));

    mockedGithubMethods.pulls.create.mockImplementationOnce(() => ({
      data: { number: 123 },
    }));

    await writeChangesets(
      [
        {
          releases: [
            {
              name: "changesets-dev-ignored-package-pkg-b",
              type: "minor",
            },
          ],
          summary: "Awesome feature",
        },
      ],
      cwd,
    );

    await runVersion({
      octokit: setupOctokit("@@GITHUB_TOKEN"),
      githubToken: "@@GITHUB_TOKEN",
      git: new Git({ cwd }),
      cwd,
    });

    expect(mockedGithubMethods.pulls.create.mock.calls[0]).toMatchSnapshot();
  });

  it("does not include changelog entries if full message exceeds size limit", async () => {
    await using fixture = await createSimpleProjectFixture();
    const cwd = fixture.path;

    mockedGithubMethods.pulls.list.mockImplementationOnce(() => ({ data: [] }));

    mockedGithubMethods.pulls.create.mockImplementationOnce(() => ({
      data: { number: 123 },
    }));

    await writeChangesets(
      [
        {
          releases: [
            {
              name: "changesets-dev-simple-project-pkg-a",
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
      cwd,
    );

    await runVersion({
      octokit: setupOctokit("@@GITHUB_TOKEN"),
      githubToken: "@@GITHUB_TOKEN",
      git: new Git({ cwd }),
      cwd,
      prBodyMaxCharacters: 1000,
    });

    expect(mockedGithubMethods.pulls.create.mock.calls[0]).toMatchSnapshot();
    expect(mockedGithubMethods.pulls.create.mock.calls[0][0].body).toMatch(
      /The changelog information of each package has been omitted from this message/,
    );
  });

  it("does not include any release information if a message with simplified release info exceeds size limit", async () => {
    await using fixture = await createSimpleProjectFixture();
    const cwd = fixture.path;

    mockedGithubMethods.pulls.list.mockImplementationOnce(() => ({ data: [] }));

    mockedGithubMethods.pulls.create.mockImplementationOnce(() => ({
      data: { number: 123 },
    }));

    await writeChangesets(
      [
        {
          releases: [
            {
              name: "changesets-dev-simple-project-pkg-a",
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
      cwd,
    );

    await runVersion({
      octokit: setupOctokit("@@GITHUB_TOKEN"),
      githubToken: "@@GITHUB_TOKEN",
      git: new Git({ cwd }),
      cwd,
      prBodyMaxCharacters: 500,
    });

    expect(mockedGithubMethods.pulls.create.mock.calls[0]).toMatchSnapshot();
    expect(mockedGithubMethods.pulls.create.mock.calls[0][0].body).toMatch(
      /All release information have been omitted from this message, as the content exceeds the size limit/,
    );
  });

  it('updates an existing PR via GraphQL without converting it to draft when prDraft is "create"', async () => {
    await using fixture = await createSimpleProjectFixture();
    const cwd = fixture.path;

    mockedGithubMethods.pulls.list.mockImplementationOnce(() => ({
      data: [{ number: 123, node_id: "PR_kwDOA" }],
    }));

    await writeChangesets(
      [
        {
          releases: [
            {
              name: "changesets-dev-simple-project-pkg-a",
              type: "minor",
            },
          ],
          summary: "Awesome feature",
        },
      ],
      cwd,
    );

    await runVersion({
      octokit: setupOctokit("@@GITHUB_TOKEN"),
      githubToken: "@@GITHUB_TOKEN",
      git: new Git({ cwd }),
      cwd,
      prDraft: "create",
    });

    expect(mockedGraphql.mock.calls[0]).toMatchSnapshot();
  });

  it('updates an existing PR via GraphQL and converts it to draft when prDraft is "always"', async () => {
    await using fixture = await createSimpleProjectFixture();
    const cwd = fixture.path;

    mockedGithubMethods.pulls.list.mockImplementationOnce(() => ({
      data: [{ number: 123, node_id: "PR_kwDOA" }],
    }));

    await writeChangesets(
      [
        {
          releases: [
            {
              name: "changesets-dev-simple-project-pkg-a",
              type: "minor",
            },
          ],
          summary: "Awesome feature",
        },
      ],
      cwd,
    );

    await runVersion({
      octokit: setupOctokit("@@GITHUB_TOKEN"),
      githubToken: "@@GITHUB_TOKEN",
      git: new Git({ cwd }),
      cwd,
      prDraft: "always",
    });

    expect(mockedGraphql.mock.calls[0]).toMatchSnapshot();
  });
});

describe("getVersionPrBody", () => {
  // Sample data for testing
  const mockChangedPackagesInfo = [
    {
      highestLevel: 1,
      private: false,
      content: "### Minor Changes\n\n- Added awesome feature",
      header: "## test-package@1.1.0"
    }
  ];

  it("uses default behavior when prBody is undefined", async () => {
    const result = await getVersionPrBody({
      hasPublishScript: false,
      preState: undefined,
      changedPackagesInfo: mockChangedPackagesInfo,
      prBodyMaxCharacters: 10000,
      prBody: undefined,
      branch: "main"
    });

    expect(result).toContain("This PR was opened by the [Changesets release]");
    expect(result).toContain("# Releases");
    expect(result).toContain("## test-package@1.1.0");
    expect(result).toContain("### Minor Changes");
    expect(result).toContain("- Added awesome feature");
    // Should not contain placeholder comments when using default behavior
    expect(result).not.toContain("<!-- header -->");
    expect(result).not.toContain("<!-- body -->");
  });

  it("replaces placeholders when prBody contains only placeholders", async () => {
    const customPrBody = "<!-- header -->\n\n<!-- prestate -->\n\n<!-- releasesHeading -->\n\n<!-- body -->";
    
    const result = await getVersionPrBody({
      hasPublishScript: true,
      preState: undefined,
      changedPackagesInfo: mockChangedPackagesInfo,
      prBodyMaxCharacters: 10000,
      prBody: customPrBody,
      branch: "main"
    });

    expect(result).toContain("This PR was opened by the [Changesets release]");
    expect(result).toContain("the packages will be published to npm automatically");
    expect(result).toContain("# Releases");
    expect(result).toContain("## test-package@1.1.0");
    expect(result).toContain("### Minor Changes");
    expect(result).toContain("- Added awesome feature");
    // Should not contain placeholder comments after replacement
    expect(result).not.toContain("<!-- header -->");
    expect(result).not.toContain("<!-- body -->");
  });

  it("uses custom text around placeholders", async () => {
    const customPrBody = `🚀 **Custom Release PR** 🚀

<!-- header -->

⚠️ **Important Notes:**
This is a custom PR body with additional context.

<!-- prestate -->

📦 **Package Updates:**
<!-- releasesHeading -->

<!-- body -->

✅ **Ready to merge when you are!**
Please review the changes above before merging.`;

    const result = await getVersionPrBody({
      hasPublishScript: false,
      preState: undefined,
      changedPackagesInfo: mockChangedPackagesInfo,
      prBodyMaxCharacters: 10000,
      prBody: customPrBody,
      branch: "develop"
    });

    // Should contain custom text
    expect(result).toContain("🚀 **Custom Release PR** 🚀");
    expect(result).toContain("⚠️ **Important Notes:**");
    expect(result).toContain("This is a custom PR body with additional context.");
    expect(result).toContain("📦 **Package Updates:**");
    expect(result).toContain("✅ **Ready to merge when you are!**");
    expect(result).toContain("Please review the changes above before merging.");
    
    // Should still contain replaced content
    expect(result).toContain("This PR was opened by the [Changesets release]");
    expect(result).toContain("publish to npm yourself");
    expect(result).toContain("# Releases");
    expect(result).toContain("## test-package@1.1.0");
    expect(result).toContain("### Minor Changes");
    
    // Should not contain placeholder comments after replacement
    expect(result).not.toContain("<!-- header -->");
    expect(result).not.toContain("<!-- body -->");
  });
});
