# Changesets Release Action

This action for [Changesets](https://github.com/atlassian/changesets) creates a pull request with all of the package versions updated and changelogs updated and when there are new changesets on master, the PR will be updated. When you're ready, you can merge the pull request and you can either publish the packages to npm manually or setup the action to do it for you.

## Usage

### Without Publishing

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
        uses: actions/checkout@master
        with:
          # This makes Actions fetch all Git history so that Changesets can generate changelogs with the correct commits
          fetch-depth: 0

      - name: Setup Node.js 12.x
        uses: actions/setup-node@master
        with:
          node-version: 12.x

      - name: Install Dependencies
        run: yarn

      - name: Create Release Pull Request
        uses: changesets/action@master
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### With Publishing

Before you can setup this action with publishing, you'll need to have an [npm token](https://docs.npmjs.com/creating-and-viewing-authentication-tokens) that can publish the packages in the repo you're setting up the action for and doesn't have 2FA on publish enabled(2FA on auth can be enabled). You'll also need to [add it as a secret on your GitHub repo](https://help.github.com/en/articles/virtual-environments-for-github-actions#creating-and-using-secrets-encrypted-variables) with the name `NPM_TOKEN`. Once you've done that, you can create a file at `.github/workflows/release.yml` with the following content.

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
        uses: actions/checkout@master
        with:
          # This makes Actions fetch all Git history so that Changesets can generate changelogs with the correct commits
          fetch-depth: 0

      - name: Setup Node.js 12.x
        uses: actions/setup-node@master
        with:
          node-version: 12.x

      - name: Install Dependencies
        run: yarn

      - name: Create Release Pull Request or Publish to npm
        uses: changesets/action@master
        with:
          # this expects you to have a script called release which does a build for your packages and calls changeset publish
          publish: yarn release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### With version script

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
        uses: actions/checkout@master
        with:
          fetch-depth: 0

      - name: Setup Node.js 12.x
        uses: actions/setup-node@master
        with:
          node-version: 12.x

      - name: Install Dependencies
        run: yarn

      - name: Create Release Pull Request
        uses: changesets/action@master
        with:
          # this expects you to have a npm script called version that runs some logic and then calls `changeset version`.
          version: yarn version
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```
