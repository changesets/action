# changesets/action/comment-pr-changeset

This action comments on PRs of its changeset status, e.g. whether it has changeset files and which packages will be released if the PR is merged.

The action requires the base ref (of the repo) and head ref (of the PR) to be checked out in order to infer the changed files and packages. It also requires the [`pull_request_target`](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request_target) event to be triggered in order to have permissions to comment on the PR and to work in PRs from forks.

Note: It is important to not run untrusted code when using the `pull_request_target` event. The example below only checks out code and does not run any code from the PR. Read more about the `pull_request_target` event in the [GitHub documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request_target).

```yaml
name: Comment PR Changeset Status

on:
  pull_request_target:
    types: [opened, synchronize, reopened]

concurrency:
  group: ${{ github.workflow }}-${{ github.event.pull_request.number }}
  cancel-in-progress: true

jobs:
  comment-pr-changeset:
    runs-on: ubuntu-slim
    permissions:
      contents: read # to check out files in the repo
      pull-requests: write # to create and update comments on PRs
    steps:
      - name: Check out base ref
        uses: actions/checkout@v6

      - name: Check out head ref
        run: |
          git fetch "$REPO" "$REF"
          git switch -c pr "$SHA"
        env:
          REPO: ${{ github.event.pull_request.head.repo.clone_url }}
          REF: ${{ github.event.pull_request.head.ref }}
          SHA: ${{ github.event.pull_request.head.sha }}

      - name: Comment changeset status
        uses: changesets/action/comment-pr-changeset@comment-pr-changeset-dist
```
