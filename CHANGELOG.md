# @changesets/action

## 2.0.0

### Major Changes

- [#118](https://github.com/changesets/action/pull/118) [`05c863d`](https://github.com/changesets/action/commit/05c863d3f980125585016a593b5cb45b27d19c2c) Thanks [@Andarist](https://github.com/Andarist)! - From now on this action will be released using the Changesets-based workflow (using itself). Thanks to that we'll have a good release history. The users will be able to find specific versions of the action and will be able to track changes over time. It also improves the security as the build artifact will always get built in the CI environment, using a frozen lockfile.
