---
"@changesets/action": patch
---

This patch implements the [`@octokit/plugin-throttling`](https://github.com/octokit/plugin-throttling.js) plugin and [wires
it up with the internal GitHub Octokit instance](https://github.com/actions/toolkit/tree/457303960f03375db6f033e214b9f90d79c3fe5c/packages/github#extending-the-octokit-instance).

This plugin is recommended by [the Octokit docs](://octokit.github.io/rest.js/v19#throttling) as it implements all the GitHub [best practices for integrators](https://docs.github.com/en/rest/guides/best-practices-for-integrators?apiVersion=2022-11-28).

This should help with `changesets/action` gitting spurious secondary rate limits and failing CI jobs, for which the only known workaround is to simply re-run the job.
