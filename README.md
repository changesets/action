# Changesets Release Action

This action for [Changesets](https://github.com/changesets/changesets) creates a pull request with all of the package versions updated and changelogs updated and when there are new changesets on [your configured `baseBranch`](https://github.com/changesets/changesets/blob/main/docs/config-file-options.md#basebranch-git-branch-name), the PR will be updated. When you're ready, you can merge the pull request and you can either publish the packages to npm manually or setup the action to do it for you.

## Usage

### Inputs

- publish - The command to use to build and publish packages
- version - The command to update version, edit CHANGELOG, read and delete changesets. Default to `changeset version` if not provided
- commit - The commit message to use. Default to `Version Packages`
- title - The pull request title. Default to `Version Packages`
- setupGitUser - Sets up the git user for commits as `"github-actions[bot]"`. Default to `true`
- createGithubReleases - A boolean value to indicate whether to create Github releases after `publish` or not. Default to `true`
- commitMode - Specifies the commit mode. Use `"git-cli"` to push changes using the Git CLI, or `"github-api"` to push changes via the GitHub API. When using `"github-api"`, all commits and tags are GPG-signed and attributed to the user or app who owns the `GITHUB_TOKEN`. Default to `git-cli`.
- cwd - Changes node's `process.cwd()` if the project is not located on the root. Default to `process.cwd()`

### Outputs

- published - A boolean value to indicate whether a publishing has happened or not
- publishedPackages - A JSON array to present the published packages. The format is `[{"name": "@xx/xx", "version": "1.2.0"}, {"name": "@xx/xy", "version": "0.8.9"}]`

### Example workflow:

#### Without Publishing

Create a file at `.github/workflows/release.yml` with the following content.

```yml
name: Release

on:
  push:
    branches:
      - main

concurrency: ${{ github.workflow }}-${{ github.ref }}

jobs:
  release:
    name: Release
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Repo
        uses: actions/checkout@v4

      - name: Setup Node.js 24
        uses: actions/setup-node@v4
        with:
          node-version: 24
          registry-url: "https://registry.npmjs.org"

      - name: Install Dependencies
        run: yarn

      - name: Create Release Pull Request
        uses: changesets/action@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

#### With Publishing

Before you can setup this action with publishing, make sure you read and understand the [Trusted publishing for npm packages](https://docs.npmjs.com/trusted-publishers) and the [npm classic tokens revoked, session-based auth and CLI token management now available](https://github.blog/changelog/2025-12-09-npm-classic-tokens-revoked-session-based-auth-and-cli-token-management-now-available/) from the npm and the Github sites. The first step is to [**configuring trusted publishing**](https://docs.npmjs.com/trusted-publishers#configuring-trusted-publishing) on [Github actions](https://github.com/features/actions) or [GitLab CI/CD Pipelines](https://docs.gitlab.com/ci/pipelines/). Follow the [**instructions**](https://docs.npmjs.com/trusted-publishers#step-1-add-a-trusted-publisher-on-npmjscom) by configuring the below fields:

**[GitHub Actions](https://docs.npmjs.com/trusted-publishers#for-github-actions)**:

1. Organization or user (required): Your GitHub username or organization name
2. Repository (required): Your repository name
3. Workflow filename (required): The filename of your workflow (e.g., publish.yml)
   - Enter only the filename, not the full path
   - Must include the .yml or .yaml extension
   - The workflow file must exist in .github/workflows/ in your repository
4. Environment name (optional): If using GitHub environments for deployment protection

**[GitLab CI/CD](https://docs.npmjs.com/trusted-publishers#for-gitlab-cicd)**:

1. Namespace (required): Your GitLab username or group name
2. Project name (required): Your project name
3. Top-level CI file path (required): The path to your CI file (e.g., .gitlab-ci.yml)
   - Must include the .yml extension
4. Environment name (optional): If using GitLab environments

Once you've done that, you can create a file at `.github/workflows/release.yml` with the following content.

```yml
name: Release

on:
  push:
    branches:
      - main

concurrency: ${{ github.workflow }}-${{ github.ref }}

permissions:
  contents: write
  pull-requests: write
  id-token: write

jobs:
  release:
    name: Release
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Repo
        uses: actions/checkout@v4

      - name: Setup Node.js 24
        uses: actions/setup-node@v4
        with:
          node-version: 24
          registry-url: "https://registry.npmjs.org"

      - name: Install Dependencies
        run: yarn

      - name: Create Release Pull Request or Publish to npm
        id: changesets
        uses: changesets/action@v1
        with:
          # This expects you to have a script called release which does a build for your packages and calls changeset publish
          publish: yarn release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: "" # https://github.com/changesets/changesets/issues/1152#issuecomment-3190884868
          NPM_CONFIG_PROVENANCE: true

      - name: Send a Slack notification if a publish happens
        if: steps.changesets.outputs.published == 'true'
        # You can do something when a publish happens.
        run: my-slack-bot send-notification --message "A new version of ${GITHUB_REPOSITORY} was published!"
```

#### Custom Publishing

If you want to hook into when publishing should occur but have your own publishing functionality, you can utilize the `hasChangesets` output.

Note that you might need to account for things already being published in your script because a commit without any new changesets can always land on your base branch after a successful publish. In such a case you need to figure out on your own how to skip over the actual publishing logic or handle errors gracefully as most package registries won't allow you to publish over already published version.

```yml
name: Release

on:
  push:
    branches:
      - main

jobs:
  release:
    name: Release
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Repo
        uses: actions/checkout@v4

      - name: Setup Node.js 24
        uses: actions/setup-node@v4
        with:
          node-version: 24
          registry-url: "https://registry.npmjs.org"

      - name: Install Dependencies
        run: yarn

      - name: Create Release Pull Request or Publish to npm
        id: changesets
        uses: changesets/action@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Publish
        if: steps.changesets.outputs.hasChangesets == 'false'
        # You can do something when a publish should happen.
        run: yarn publish
```

#### With version script

If you need to add additional logic to the version command, you can do so by using a version script.

If the version script is present, this action will run that script instead of `changeset version`, so please make sure that your script calls `changeset version` at some point. All the changes made by the script will be included in the PR.

```yml
name: Release

on:
  push:
    branches:
      - main

concurrency: ${{ github.workflow }}-${{ github.ref }}

jobs:
  release:
    name: Release
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Repo
        uses: actions/checkout@v4

      - name: Setup Node.js 24
        uses: actions/setup-node@v4
        with:
          node-version: 24
          registry-url: "https://registry.npmjs.org"

      - name: Install Dependencies
        run: yarn

      - name: Create Release Pull Request
        uses: changesets/action@v1
        with:
          # this expects you to have a npm script called version that runs some logic and then calls `changeset version`.
          version: yarn version
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

#### With Yarn 2 / Plug'n'Play

If you are using [Yarn Plug'n'Play](https://yarnpkg.com/features/pnp), you should use a custom `version` command so that the action can resolve the `changeset` CLI:

```yaml
- uses: changesets/action@v1
  with:
    version: yarn changeset version
    ...
```
