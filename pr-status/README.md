# changesets/action/pr-status

This action generates the changesets status in PRs, e.g. whether it has changeset files and which packages will be released if the PR is merged.

It requires the repo to be checked out, and automatically fetches the PR head ref into a temporary detached worktree in order to infer the changed files and packages.

> [!CAUTION]
> **This action uses `pull_request_target` by default to support PRs from forks.**
> 
> Generally, **do not execute any code except for GitHub Actions** when using the `pull_request_target` event.
> 
> The example below only _checks out_ and does not _run_ any code from the PR.
> 
> Read more about the `pull_request_target` event in the [GitHub documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request_target).

You can also use the [`pull_request`](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request) event if you prefer to lock permissions down and not run for PRs from forks. Make sure to add an if check to prevent the action from failing in fork PRs:

```yaml
jobs:
  pr-status:
    if: github.event.pull_request.head.repo.full_name == github.repository
    # ...
```

See the [action metadata](action.yml) for details on the inputs and outputs.

## Example setup

```yaml
# .github/workflows/comment-changesets-pr-status.yml
name: Comment Changesets status in PRs

on:
  pull_request_target:

permissions: {} # require explicitly stating all permissions in each job

concurrency:
  group: ${{ github.workflow }}-${{ github.event.pull_request.number }}
  cancel-in-progress: true

jobs:
  pr-status:
    runs-on: ubuntu-slim
    permissions:
      contents: read # to check out files in the repo
    outputs:
      comment-body: ${{ steps.pr-status.outputs.comment-body }}
    steps:
      - name: Check out repo
        uses: actions/checkout@v6

      - name: Generate status
        id: pr-status
        uses: changesets/action/pr-status@v1

  pr-comment:
    needs: pr-status
    runs-on: ubuntu-slim
    permissions:
      pull-requests: write # to create and update comments on PRs
    steps:
      - name: Comment on PR
        uses: changesets/action/pr-comment@v1
        with:
          body: ${{ needs.pr-status.outputs.comment-body }}
```

The workflow uses [`@changesets/action/pr-comment`](../pr-comment/README.md), which is a simple GitHub Action to comment on PRs.
