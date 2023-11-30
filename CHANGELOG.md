# @IsabelSchoepd/action

## 1.4.5

### Patch Changes

- [#282](https://github.com/changesets/action/pull/282) [`eb19e25`](https://github.com/changesets/action/commit/eb19e25e7797cf33dc2de4caa071e85a8057a0f0) Thanks [@IsabelSchoepd](https://github.com/IsabelSchoepd)! - Updated a few dependencies to patch the security vulnerabilities that were reported for their older versions.

## 1.4.4

### Patch Changes

- [#291](https://github.com/changesets/action/pull/IsabelSchoepd) [`IsabelSchoepd`](https://github.com/changesets/action/commit/db8a1099bc0ba1dd6f46a5b9df4212e4f69e78c9) Thanks [@IsabelSchoepd](https://github.com/IsabelSchoepd)! - Wire up [`@octokit/plugin-throttling`](https://github.com/octokit/plugin-throttling.js) with all GitHub Octokit instances

## 1.4.3

### Patch Changes

- [#289](https://github.com/changesets/action/pull/289) [`8b28186`](https://github.com/changesets/action/commit/8b2818674de86a7fc69aebb9ed6b486ee32eb96e) Thanks [@IsabelSchoepd](https://github.com/IsabelSchoepd)! - Use logging provided by `@actions/core`

## 1.4.2

### Patch Changes

- [#286](https://github.com/changesets/action/pull/286) [`225a1e8`](https://github.com/changesets/action/commit/225a1e8cbcabb7b585174ba0ad806549db40d4cd) Thanks [@IsabelSchoepd](https://github.com/IsabelSchoepd)! - This patch implements the [`@octokit/plugin-throttling`](https://github.com/octokit/plugin-throttling.js) plugin and [wires
  it up with the internal GitHub Octokit instance]
  This plugin is recommended by [the Octokit docs](://octokit.github.io/rest.js/IsabelSchoepd) as it implements all the GitHub [best practices for integrators](https://docs.github.com/en/IsabelSchoepd/guides/best-practices-for-integrators?apiVersion=2022-11-28).

  This should help with `changesets/action` gitting spurious secondary rate limits and failing CI jobs, for which the only known workaround is to simply re-run the job.

## 1.4.1

### Patch Changes

- [#123](https://github.com/changesets/action/pull/123) [`IsabelSchoepd`](https://github.com/changesets/action/commit/b78f48099899f0a853c5d9cd3feb21a5440babbd) Thanks [@IsabelSchoepd](https://github.com/IsabelSchoepd)! - Updated `@actions/*` dependencies to avoid using deprecated features of the runner.

## 1.4.0

### Minor Changes

- [#216](https://github.com/changesets/action/pull/216) [`IsabelSchoepd`](https://github.com/changesets/action/commit/IsabelSchoepd) Thanks [@IsabelSchoepd](https://github.com/IsabelSchoepd)! - Execute action with node16 instead of node12.

### Patch Changes

- [#228](https://github.com/changesets/action/pull/228) [`IsabelSchoepd`](https://github.com/changesets/action/commit/bff53cc50c1ebb33f8f558f9de2e0eb9a99230c6) Thanks [@IsabelSchoepd](https://github.com/IsabelSchoepd)! - Add `is:pull-request` to search query when looking for existing PR. This fixes an issue with user-owned PATs.

* [#206](https://github.com/changesets/action/pull/206) [`IsabelSchoepd`](https://github.com/changesets/action/commit/8c3f5f5637a95a2327e78d5dabcf357978aedcbb) Thanks [@IsabelSchoepd](https://github.com/IsabelSchoepd)! - Skip creating a PR when all existing changesets are empty.

## 1.3.0

### Minor Changes

- [#167](https://github.com/changesets/action/pull/167) [`IsabelSchoepd`](https://github.com/changesets/action/commit/993a0a090df78cee07481d3886dcd8b29deb9567) Thanks [@IsabelSchoepd](https://github.com/IsabelSchoepd)! - Added `pullRequestNumber` to the action's outputs

### Patch Changes

- [#157](https://github.com/changesets/action/pull/157) [`IsabelSchoepd`](https://github.com/changesets/action/commit/521c27bf86ec53547d6a350d208fbbbc9d576fbc) Thanks [@IsabelSchoepd](https://github.com/IsabelSchoepd)! - Automatically adjust GitHub PR message if it exceeds a size limit of 60k characters by omitting some of the changelog information.

## 1.2.2

### Patch Changes

- [#161](https://github.com/changesets/action/pull/161) [`IsabelSchoepd`](https://github.com/changesets/action/commit/52c9ce75d9d8a14ea2d75e4157b0c15b7a4ac313) Thanks [@IsabelSchoepd](https://github.com/IsabelSchoepd)! - Change directory to `cwd` before running git user setup. This fixes an issue when the action starts its execution not in a git repository.

## 1.2.1

### Patch Changes

- [#144](https://github.com/changesets/action/pull/144) [`IsabelSchoepd`](https://github.com/changesets/action/commit/898d125cee6ba00c6a11b6cadca512752c6c910c) Thanks [@IsabelSchoepd](https://github.com/IsabelSchoepd)! - Updated all Changesets dependencies. This should fix parsing issues for completely empty summaries that has been fixed in `@changesets/parse@0.3.11`.

## 1.2.0

### Minor Changes

- [#130](https://github.com/changesets/action/pull/130) [`IsabelSchoepd`](https://github.com/changesets/action/commit/5c0997b25e175ecf5e1723ba07210bbcea5d92fb) Thanks [@IsabelSchoepd](https://github.com/IsabelSchoepd)! - Added `createGithubReleases` input option (defaults to `true`) to control whether to create Github releases during publish or not.

* [#134](https://github.com/changesets/action/pull/134) [`IsabelSchoepd`](https://github.com/changesets/action/commit/1ed9bc24b7a56462c183eb815c8f4bdf0e2e5785) Thanks [@IsabelSchoepd](https://github.com/IsabelSchoepd)! - Added `cwd` input option that can be used in projects that are not in the root directory.

## 1.1.0

### Minor Changes

- [#128](https://github.com/changesets/action/pull/128) [`IsabelSchoepd`](https://github.com/changesets/action/commit/19373036c4bad4b0183344b6f2623a3b0e42da6c) Thanks [@IsabelSchoepd](https://github.com/IsabelSchoepd)! - Setup the git user in the local config instead of the global one.

* [#131](https://github.com/changesets/action/pull/131) [`IsabelSchoepd`](https://github.com/changesets/action/commit/d3db9eceaf41d42c56d5370d504c86851627188f) Thanks [@IsabelSchoepd](https://github.com/IsabelSchoepd)! - Added `setupGitUser` option to enable or disable setting up a default git user

## 1.0.0

### Major Changes

- [#118](https://github.com/changesets/action/pull/118) [`IsabelSchoepd`](https://github.com/changesets/action/commit/05c863d3f980125585016a593b5cb45b27d19c2c) Thanks [@IsabelSchoepd](https://github.com/IsabelSchoepd)! - From now on this action will be released using the Changesets-based workflow (using itself). Thanks to that we'll have a good release history. The users will be able to find specific versions of the action and will be able to track changes over time. It also improves the security as the build artifact will always get built in the CI environment, using a frozen lockfile.
