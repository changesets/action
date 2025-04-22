import { getChangelogEntry, BumpLevels, sortTheThings, extractAuthTokenLine } from "./utils";

let changelog = `# @keystone-alpha/email

## 3.0.1

### Patch Changes

- [19fe6c1b](https://github.com/keystonejs/keystone-5/commit/19fe6c1b):

  Move frontmatter in docs into comments

## 3.0.0

### Major Changes

- [2164a779](https://github.com/keystonejs/keystone-5/commit/2164a779):

  - Replace jade with pug because Jade was renamed to Pug, and \`jade\` package is outdated

### Patch Changes

- [81dc0be5](https://github.com/keystonejs/keystone-5/commit/81dc0be5):

  - Update dependencies

## 2.0.0

- [patch][b69fb9b7](https://github.com/keystonejs/keystone-5/commit/b69fb9b7):

  - Update dev devependencies

- [major][f97e4ecf](https://github.com/keystonejs/keystone-5/commit/f97e4ecf):

  - Export { emailSender } as the API, rather than a default export

## 1.0.2

- [patch][7417ea3a](https://github.com/keystonejs/keystone-5/commit/7417ea3a):

  - Update patch-level dependencies

## 1.0.1

- [patch][1f0bc236](https://github.com/keystonejs/keystone-5/commit/1f0bc236):

  - Update the package.json author field to "The Keystone Development Team"

## 1.0.0

- [major] 8b6734ae:

  - This is the first release of keystone-alpha (previously voussoir).
    All packages in the \`@voussoir\` namespace are now available in the \`@keystone-alpha\` namespace, starting at version \`1.0.0\`.
    To upgrade your project you must update any \`@voussoir/<foo>\` dependencies in \`package.json\` to point to \`@keystone-alpha/<foo>: "^1.0.0"\` and update any \`require\`/\`import\` statements in your code.

# @voussoir/email

## 0.0.2

- [patch] 113e16d4:

  - Remove unused dependencies

- [patch] 625c1a6d:

  - Update mjml-dependency
`;

test("it works", () => {
  let entry = getChangelogEntry(changelog, "3.0.0");
  expect(entry.content).toMatchSnapshot();
  expect(entry.highestLevel).toBe(BumpLevels.major);
});

test("it works", () => {
  let entry = getChangelogEntry(changelog, "3.0.1");
  expect(entry.content).toMatchSnapshot();
  expect(entry.highestLevel).toBe(BumpLevels.patch);
});

test("it sorts the things right", () => {
  let things = [
    {
      name: "a",
      highestLevel: BumpLevels.major,
      private: true,
    },
    {
      name: "b",
      highestLevel: BumpLevels.patch,
      private: false,
    },
    {
      name: "c",
      highestLevel: BumpLevels.major,
      private: false,
    },
  ];
  expect(things.sort(sortTheThings)).toMatchSnapshot();
});

/**
 * Test the extractAuthTokenLine function for various registries.
 */
describe("extractAuthTokenLine", () => {
  it("should correctly find the auth token line for multiple registries", () => {
    const testCases = [
      {
        name: "Custom private registry with _authToken",
        npmrc: `
          registry=https://custom.private-registry.com/api/npm/npm/
          //custom.private-registry.com/api/npm/npm/:_authToken=abcd1234
          always-auth=true
        `,
        expected: "//custom.private-registry.com/api/npm/npm/:_authToken=abcd1234",
      },
      {
        name: "Custom private registry with _auth",
        npmrc: `
          registry=https://custom.private-registry.com/api/npm/npm/
          //custom.private-registry.com/api/npm/npm/:_auth=abcd1234
          always-auth=true
        `,
        expected: "//custom.private-registry.com/api/npm/npm/:_auth=abcd1234",
      },
      {
        name: "NPM default registry with _authToken",
        npmrc: `
          registry=https://registry.npmjs.org/
          //registry.npmjs.org/:_authToken=efgh5678
        `,
        expected: "//registry.npmjs.org/:_authToken=efgh5678",
      },
      {
        name: "NPM default registry with _auth",
        npmrc: `
          registry=https://registry.npmjs.org/
          //registry.npmjs.org/:_auth=efgh5678
        `,
        expected: "//registry.npmjs.org/:_auth=efgh5678",
      },
      {
        name: "AWS CodeArtifact registry with _authToken",
        npmrc: `
          registry=https://mydomain-111122223333.d.codeartifact.us-east-1.amazonaws.com/npm/repository-name/
          //mydomain-111122223333.d.codeartifact.us-east-1.amazonaws.com/npm/repository-name/:_authToken=ijkl9012
        `,
        expected:
          "//mydomain-111122223333.d.codeartifact.us-east-1.amazonaws.com/npm/repository-name/:_authToken=ijkl9012",
      },
      {
        name: "AWS CodeArtifact registry with _auth",
        npmrc: `
          registry=https://mydomain-111122223333.d.codeartifact.us-east-1.amazonaws.com/npm/repository-name/
          //mydomain-111122223333.d.codeartifact.us-east-1.amazonaws.com/npm/repository-name/:_auth=ijkl9012
        `,
        expected:
          "//mydomain-111122223333.d.codeartifact.us-east-1.amazonaws.com/npm/repository-name/:_auth=ijkl9012",
      },
      {
        name: "Azure DevOps registry with _authToken",
        npmrc: `
          registry=https://pkgs.dev.azure.com/myorg/_packaging/myfeed/npm/registry/
          //pkgs.dev.azure.com/myorg/_packaging/myfeed/npm/registry/:_authToken=mnop3456
        `,
        expected:
          "//pkgs.dev.azure.com/myorg/_packaging/myfeed/npm/registry/:_authToken=mnop3456",
      },
      {
        name: "Azure DevOps registry with _auth",
        npmrc: `
          registry=https://pkgs.dev.azure.com/myorg/_packaging/myfeed/npm/registry/
          //pkgs.dev.azure.com/myorg/_packaging/myfeed/npm/registry/:_auth=mnop3456
        `,
        expected:
          "//pkgs.dev.azure.com/myorg/_packaging/myfeed/npm/registry/:_auth=mnop3456",
      },
    ];

    testCases.forEach(({ name, npmrc, expected }) => {
      const result = extractAuthTokenLine(npmrc);
      expect(result).toBe(expected);
    });
  });

  it("should return undefined if no auth token line is present", () => {
    const npmrcContent = `
      registry=https://custom.private-registry.com/api/npm/npm/
      always-auth=true
    `;
    const result = extractAuthTokenLine(npmrcContent);
    expect(result).toBeUndefined();
  });
});