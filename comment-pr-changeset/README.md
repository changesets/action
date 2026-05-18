# changesets/action/comment-pr-changeset

This action comments on PRs of its changeset status, e.g. whether it has changeset files and which packages will be released if the PR is merged.

The action requires the base ref (of the repo) and head ref (of the PR) to be checked out in order to infer the changed files and packages. It also requires the [`pull_request_target`](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request_target) event to be triggered in order to have permissions to comment on the PR and to work in PRs from forks.

Note: It is important to not run untrusted code when using the `pull_request_target` event. The example below only checks out code and does not run any code from the PR. Read more about the `pull_request_target` event in the [GitHub documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request_target).

```yaml
name: Comment PR Changeset Status

on:
  pull_request_target:
    type: [opened, edited, synchronize]

jobs:
  comment-pr-changeset:
    runs-on: ubuntu-slim
    permissions:
      issues: write # to create comments on PRs
    steps:
      - name: Check out base ref
        uses: actions/checkout@v6
        with:
          persist-credentials: false

      - name: Check out head ref
        run: |
          git remote add head $REPO
          git fetch head $REF
          git checkout FETCH_HEAD
        env:
          REPO: ${{ github.event.pull_request.head.repo.clone_url }}
          REF: ${{ github.event.pull_request.head.ref }}

      - name: Comment changeset status
        uses: changesets/action/comment-pr-changeset@v2
```
