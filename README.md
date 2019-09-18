# Changesets Release Action

This action for [Changesets](https://github.com/atlassian/changesets) creates a pull request with all of the package versions updated and changelogs updated and when there are new changesets on master, the PR will be updated. When you're ready, you can merge the pull request and you can either publish the packages to npm manually or setup the action to do it for you.

## Usage

### Without Publishing

Create a file at `.github/workflows/version.yml` with the following content.

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

      - name: Setup Node.js 10.x
        uses: actions/setup-node@master
        with:
          version: 10.x

      - name: Install Yarn
        run: npm install --global yarn

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

      - name: Setup Node.js 10.x
        uses: actions/setup-node@master
        with:
          version: 10.x

      - name: Install Yarn
        run: npm install --global yarn

      - name: Install Dependencies
        run: yarn

      - name: Create Release Pull Request or Publish to npm
        uses: changesets/action@master
        with:
          publish: yarn release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```


Doing a publish is triggered by the existence of:

```yaml
        with:
          publish: yarn release
```

This command will run `yarn release` in your repository on merging code into master. You will likely want a to add `release` command to your `package.json` that looks like:

```sh
"release": "yarn build && changeset publish"
```

to publish your code.
