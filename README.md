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
- oidcAuth - Use npm OIDC trusted publishing instead of NPM_TOKEN. Default to `false`
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
        uses: actions/checkout@v3

      - name: Setup Node.js 20
        uses: actions/setup-node@v3
        with:
          node-version: 20

      - name: Install Dependencies
        run: yarn

      - name: Create Release Pull Request
        uses: changesets/action@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

#### With Publishing

Before you can setup this action with publishing, you'll need to have an [npm token](https://docs.npmjs.com/creating-and-viewing-authentication-tokens) that can publish the packages in the repo you're setting up the action for and doesn't have 2FA on publish enabled ([2FA on auth can be enabled](https://docs.npmjs.com/about-two-factor-authentication)). You'll also need to [add it as a secret on your GitHub repo](https://help.github.com/en/articles/virtual-environments-for-github-actions#creating-and-using-secrets-encrypted-variables) with the name `NPM_TOKEN`. Once you've done that, you can create a file at `.github/workflows/release.yml` with the following content.

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
        uses: actions/checkout@v3

      - name: Setup Node.js 20.x
        uses: actions/setup-node@v3
        with:
          node-version: 20.x

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
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}

      - name: Send a Slack notification if a publish happens
        if: steps.changesets.outputs.published == 'true'
        # You can do something when a publish happens.
        run: my-slack-bot send-notification --message "A new version of ${GITHUB_REPOSITORY} was published!"
```

By default the GitHub Action creates a `.npmrc` file with the following content:

```
//registry.npmjs.org/:_authToken=${process.env.NPM_TOKEN}
```

However, if a `.npmrc` file is found, the GitHub Action does not recreate the file. This is useful if you need to configure the `.npmrc` file on your own.
For example, you can add a step before running the Changesets GitHub Action:

```yml
- name: Creating .npmrc
  run: |
    cat << EOF > "$HOME/.npmrc"
      //registry.npmjs.org/:_authToken=$NPM_TOKEN
    EOF
  env:
    NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

#### With OIDC Trusted Publishing

npm supports [Trusted Publishing with OIDC](https://docs.npmjs.com/trusted-publishers), which eliminates the need for long-lived NPM tokens. This is the recommended approach for publishing to npm from GitHub Actions.

**Prerequisites:**

1. npm CLI version 11.5.1 or higher
2. [Configure a trusted publisher](https://docs.npmjs.com/trusted-publishers) on npmjs.com for your packages:
   - Go to your organization/package settings on npmjs.com
   - Add a trusted publisher with your GitHub repository details (organization, repository, workflow file name)
3. Add `id-token: write` permission to your workflow

**Example workflow:**

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
  id-token: write  # Required for npm OIDC

jobs:
  release:
    name: Release
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Repo
        uses: actions/checkout@v4

      - name: Setup Node.js 20.x
        uses: actions/setup-node@v4
        with:
          node-version: 20.x

      # Ensure npm 11.5.1+ is available
      - name: Update npm
        run: npm install -g npm@latest

      - name: Install Dependencies
        run: yarn

      - name: Create Release Pull Request or Publish to npm
        id: changesets
        uses: changesets/action@v1
        with:
          publish: yarn release
          oidcAuth: true  # Enable OIDC authentication
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          # No NPM_TOKEN needed with OIDC!

      - name: Send a Slack notification if a publish happens
        if: steps.changesets.outputs.published == 'true'
        run: my-slack-bot send-notification --message "A new version of ${GITHUB_REPOSITORY} was published!"
```

**Benefits of OIDC:**

- ✅ No long-lived tokens to manage or rotate
- ✅ Cryptographic provenance attestation automatically generated
- ✅ More secure authentication flow
- ✅ Eliminates risk of token leakage

**Migration from NPM_TOKEN to OIDC:**

1. Update your workflow to use npm 11.5.1+
2. Configure trusted publisher on npmjs.com
3. Add `id-token: write` permission to your workflow
4. Set `oidcAuth: true` in the changesets action
5. Remove `NPM_TOKEN` from the workflow and GitHub secrets

**Validation:**

The action automatically validates:

- npm version is 11.5.1 or higher
- `id-token: write` permission is granted
- `NPM_TOKEN` is not set (to avoid conflicting authentication)

If validation fails, you'll receive clear error messages with instructions on how to fix the issue.

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
        uses: actions/checkout@v3

      - name: Setup Node.js 20.x
        uses: actions/setup-node@v3
        with:
          node-version: 20.x

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
        uses: actions/checkout@v3

      - name: Setup Node.js 20.x
        uses: actions/setup-node@v3
        with:
          node-version: 20.x

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
