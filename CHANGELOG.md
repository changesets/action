# @changesets/action

## 1.2.0

### Minor Changes

- [#130](https://github.com/changesets/action/pull/130) [`5c0997b`](https://github.com/changesets/action/commit/5c0997b25e175ecf5e1723ba07210bbcea5d92fb) Thanks [@akphi](https://github.com/akphi)! - Added `createGithubReleases` input option (defaults to `true`) to control whether to create Github releases during publish or not.

* [#134](https://github.com/changesets/action/pull/134) [`1ed9bc2`](https://github.com/changesets/action/commit/1ed9bc24b7a56462c183eb815c8f4bdf0e2e5785) Thanks [@dmregister](https://github.com/dmregister)! - Added `cwd` input option that can be used in projects that are not in the root directory.

## 1.1.0

### Minor Changes

- [#128](https://github.com/changesets/action/pull/128) [`1937303`](https://github.com/changesets/action/commit/19373036c4bad4b0183344b6f2623a3b0e42da6c) Thanks [@dhruvdutt](https://github.com/dhruvdutt)! - Setup the git user in the local config instead of the global one.

* [#131](https://github.com/changesets/action/pull/131) [`d3db9ec`](https://github.com/changesets/action/commit/d3db9eceaf41d42c56d5370d504c86851627188f) Thanks [@jacklesliewise](https://github.com/jacklesliewise)! - Added `setupGitUser` option to enable or disable setting up a default git user

## 1.0.0

### Major Changes

- [#118](https://github.com/changesets/action/pull/118) [`05c863d`](https://github.com/changesets/action/commit/05c863d3f980125585016a593b5cb45b27d19c2c) Thanks [@Andarist](https://github.com/Andarist)! - From now on this action will be released using the Changesets-based workflow (using itself). Thanks to that we'll have a good release history. The users will be able to find specific versions of the action and will be able to track changes over time. It also improves the security as the build artifact will always get built in the CI environment, using a frozen lockfile.
