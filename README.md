# Changesets Snapshot Release Action

This action for [Changesets](https://github.com/atlassian/changesets) runs the Snapshot workflow for your repository, based on changes done in Pull Requests.

This action is helpful if you wish to create an automated release flow for changes done in PRs, on in any temporary change.

The following flow is being executed:

- Check for available `changeset` files in the PR.
- Runs `version` flow with `--snapshot` provided.
- Runs user script for build/preparation for the release.
- Runs `publish` flow with `--tag` and `--no-git-tag` (to create a "temporary" release)
- Publishes a GitHub comment on the Pull Request, with the list of releases done.

<img width="931" alt="image" src="https://user-images.githubusercontent.com/3680083/182776353-2f365f9d-c156-4c4f-8947-18cf87dc6adf.png">


> This GitHub Action does not create GitHub Releases and does not push Git tags - it meant to be used for canary releases, and encapsulate the changes within a PR.

## Usage

### Inputs

- `prepareScript` - A custom, user-provided script, that is being executed between `version` and `publish` scripts. Usually, this is where your `build` script goes.
- `tag` - The git `tag` to be used with the `--snapshot TAG` (`version` command) and `--tag TAG` (`publish` command)
- `cwd` - Changes node's `process.cwd()` if the project is not located on the root. Default to `process.cwd()`
- `setupGitUser` - Sets up the git user for commits as `"github-actions[bot]"`. Default to `true`

### Outputs

- published - A boolean value to indicate whether a publishing is happened or not
- publishedPackages - A JSON array to present the published packages. The format is `[{"name": "@xx/xx", "version": "1.2.0"}, {"name": "@xx/xy", "version": "0.8.9"}]`

### Example workflow:

#### Without Publishing

Create a file at `.github/workflows/snapshot.yml` with the following content.

```yml
name: Snapshot

on:
  pull_request: # Run only for PRs
    branches:
      - master
    paths:
      - ".changeset/**/*.md" # this will make sure to run only on PRs that adds Changesets

jobs:
  release:
    name: Release
    runs-on: ubuntu-latest
    if: github.event.pull_request.head.repo.full_name == github.repository # run only for original, non-fork PRs
    steps:
      - name: Checkout Master
        uses: actions/checkout@v3
        with:
          fetch-depth: 0

      - name: Use Node
        uses: actions/setup-node@v3
        with:
          node-version: 18

      # this is where you do your regular setup, dependencies installation and so on

      - name: Release Snapshot
        uses: "the-guild-org/changesets-snapshot-action@v0.0.1"
        with:
          tag: alpha
          prepareScript: "yarn build"
        env:
          NPM_TOKEN: ${{ secrets.NODE_AUTH_TOKEN }} # NPM Token
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }} # GitHub Token
```
