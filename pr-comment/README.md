# @changesets/action/pr-comment

A simple GitHub Action to comment on PRs aimed to complement [`@changesets/action/pr-status`](../pr-status/README.md).

This action is intentionally simple without advanced features. Check out other actions if so, such as [mshick/add-pr-comment](https://github.com/marketplace/actions/add-pr-comment) and [peter-evans/create-or-update-comment](https://github.com/marketplace/actions/create-or-update-comment).

See the [action metadata](action.yml) for details on the inputs and outputs.

## Example setup

```yaml
name: PR Comment

on:
  pull_request:

jobs:
  pr-comment:
    runs-on: ubuntu-slim
    permissions:
      pull-requests: write # to create and update comments on PRs
    steps:
      - uses: changesets/action/pr-comment@v1
        with:
          body: Hello world!
```

When called repeatedly, the action will update the comment it created by default. If you use this action to create different types of comments, pass an `update-id` value to differentiate them.

```yaml
jobs:
  pr-comment:
    # ...
    steps:
      - uses: changesets/action/pr-comment@v1
        with:
          body: Hello world!
          update-id: my-tag
```

If you want to always create new comments, pass an empty value to `update-id`.

```yaml
jobs:
  pr-comment:
    # ...
    steps:
      - uses: changesets/action/pr-comment@v1
        with:
          body: Hello world!
          update-id: ""
```
