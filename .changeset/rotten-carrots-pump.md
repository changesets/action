---
"@changesets/action": patch
---

add rate limit plugin for octokit

The changesets GitHub Action triggers 403 (secondary rate limits)[1]
against the GitHub API, which causes the CI jobs to fail, and the only
known workaround is to simply re-run the job.

This patch implements the `@octokit/plugin-throttling`[2] plugin and wires
it up with the GitHub Octokit instance[3].

This plugin is recommended by the Octokit docs[4] as it implements all
the GitHub best practices for integrators[5].

[1]: https://github.com/changesets/action/issues/192
[2]: https://github.com/octokit/plugin-throttling.js
[3]: https://github.com/actions/toolkit/blob/main/packages/github/src/github.ts#LL18C40-L18C40
[4]: https://octokit.github.io/rest.js/v19#throttling
[5]: https://docs.github.com/en/rest/guides/best-practices-for-integrators?apiVersion=2022-11-28
