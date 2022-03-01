# Changesets Release Action

This action for [Changesets](https://github.com/atlassian/changesets) creates a pull request with all of the package versions updated and changelogs updated and when there are new changesets on master, the PR will be updated. When you're ready, you can merge the pull request and you can either publish the packages to npm manually or setup the action to do it for you.

## Usage

### Inputs

- publish - The command to use to build and publish packages
- version - The command to update version, edit CHANGELOG, read and delete changesets. Default to `changeset version` if not provided
- commit - The commit message to use. Default to `Version Packages`
- title - The pull request title. Default to `Version Packages`
- setupGitUser - Sets up the git user for commits as `"github-actions[bot]"`. Default to `true`
- cwd - Changes node's `process.cwd()` if the project is not located on the root. Default to `process.cwd()`

### Outputs

- published - A boolean value to indicate whether a publishing is happened or not
- publishedPackages - A JSON array to present the published packages. The format is `[{"name": "@xx/xx", "version": "1.2.0"}, {"name": "@xx/xy", "version": "0.8.9"}]`

### Example workflow:

#### Without Publishing

Create a file at `.github/workflows/release.yml` with the following content.

```yml
name: Release

on:
  push:
    branches:
      - master

jobs:
  release:
    name: Release
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Repo
        uses: actions/checkout@v2
        with:
          # This makes Actions fetch all Git history so that Changesets can generate changelogs with the correct commits
          fetch-depth: 0

      - name: Setup Node.js 16.x
        uses: actions/setup-node@v2
        with:
          node-version: '16'

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
      - master

jobs:
  release:
    name: Release
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Repo
        uses: actions/checkout@v2
        with:
          # This makes Actions fetch all Git history so that Changesets can generate changelogs with the correct commits
          fetch-depth: 0

      - name: Setup Node.js 16.x
        uses: actions/setup-node@v2
        with:
          node-version: '16'

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
      email=my@email.com
      //registry.npmjs.org/:_authToken=$NPM_TOKEN
    EOF
  env:
    NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

#### With version script

If you need to add additional logic to the version command, you can do so by using a version script.

If the version script is present, this action will run that script instead of `changeset version`, so please make sure that your script calls `changeset version` at some point. All the changes made by the script will be included in the PR.

```yml
name: Release

on:
  push:
    branches:
      - master

jobs:
  release:
    name: Release
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Repo
        uses: actions/checkout@v2
        with:
          fetch-depth: 0

      - name: Setup Node.js 16.x
        uses: actions/setup-node@v2
        with:
          node-version: '16'

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
