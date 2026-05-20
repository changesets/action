# changesets/action/pr-status-comment

This action comments on PRs of its changeset status, e.g. whether it has changeset files and which packages will be released if the PR is merged.

The action requires the base ref (of the repo) to be checked out. It fetches the PR head ref into a temporary detached worktree in order to infer the changed files and packages. It also requires the [`pull_request_target`](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request_target) event to be triggered in order to have permissions to comment on the PR and to work in PRs from forks.

See the [action metadata](action.yml) for details on the inputs and outputs.

> [!WARNING]
> **Do not run untrusted code** when using the `pull_request_target` event. The example below only checks out code and does not run any code from the PR. Read more about the `pull_request_target` event in the [GitHub documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request_target).

## Example setup

```yaml
# .github/workflows/pr-status-comment.yml
name: Comment changeset status in PRs

on:
  pull_request_target:
    types: [opened, synchronize, reopened]

concurrency:
  group: ${{ github.workflow }}-${{ github.event.pull_request.number }}
  cancel-in-progress: true

jobs:
  pr-status-comment:
    runs-on: ubuntu-slim
    permissions:
      contents: read # to check out files in the repo
      pull-requests: write # to create and update comments on PRs
    steps:
      - name: Check out base ref
        uses: actions/checkout@v6

      - name: Comment changeset status
        uses: changesets/action/pr-status-comment@v1
```
