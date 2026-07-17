# How to set up npm authentication

This is a brief guide on setting up npm authentication in GitHub Actions. Most of the information below are also applicable outside of Changesets and can be referenced for other npm workflows.

## Recommended Setup

It is recommended by npm to use [Trusted Publishing](https://docs.npmjs.com/trusted-publishers), or [Staged Publishing](https://docs.npmjs.com/staged-publishing), or both, to securely publish packages from CI.

Token-based publishing (with [Granular Access Tokens](https://docs.npmjs.com/about-access-tokens#about-granular-access-tokens)) is no longer recommended, with many restrictions that make it difficult to use in CI workflows. For example:

- They expire after a maximum of 90 days, which requires periodic manual token rotation.
- 2FA-bypass tokens are [being deprecated](https://github.blog/changelog/2026-07-08-npm-install-time-security-and-gat-bypass2fa-deprecation/#2fa-bypass-tokens-will-no-longer-publish-directly) and will soon be not allowed to publish packages with 2FA enabled.

However, if you're using a different npm-compatible registry that does not support Trusted Publishing or Staged Publishing, you may still opt for token-based publishing. Check out the [next section](#token-based-publishing) for more information.

Note that Staged Publishing does not work with Changesets at the moment, so it's recommended to use Trusted Publishing instead for now. Check out [its docs](https://docs.npmjs.com/trusted-publishers) for more information to set it up.

Also, in contrary to npm's [workflow recommendation](https://docs.npmjs.com/trusted-publishers#step-2-configure-your-cicd-workflow), make sure the `id-token: write` is only set on the job that needs to publish. As such, consider splitting the build, test, publish flows etc into separate jobs. Here's an example setup with Changesets:

```yaml
# .github/workflows/publish.yml
name: Publish

on:
  push:
    branches:
      - main

permissions: {} # recommended: reset permissions

jobs:
  build-and-pack:
    runs-on: ubuntu-latest
    outputs:
      pack-dir-artifact-id: ${{ steps.pack.outputs.pack-dir-artifact-id }}
    permissions:
      contents: read # to check out repo (actions/checkout)
    steps:
      - uses: actions/checkout@v7
      - run: npm install
      - run: npm build
      - uses: changesets/action/pack@v2
        id: pack

  publish:
    needs: build-and-pack
    runs-on: ubuntu-latest
    permissions:
      id-token: write # for trusted publishing (changesets/action)
    steps:
      - uses: changesets/action/publish@v2
        with:
          pack-dir-artifact-id: ${{ needs.build-and-pack.outputs.pack-dir-artifact-id }}
```

## Token-based publishing

If you need to use token-based publishing, in most cases you can use [actions/setup-node](https://github.com/actions/setup-node) to set it up automatically.

```yaml
# .github/workflows/publish.yml
name: Publish

on:
  push:
    branches:
      - main

permissions: {} # recommended: reset permissions

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read # to check out repo (actions/checkout)
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          registry-url: https://registry.npmjs.org/ # set this option to set up npm authentication
      - run: npm install
      - run: npm build
      - run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }} # pass the token here
```

Internally, `actions/setup-node` will set up a configuration like below in `~/.npmrc` (in the home directory):

```ini
//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}
```

This syntax allows to authenticate with the npm registry only when the `NODE_AUTH_TOKEN` environment variable is set, which is a safer approach than storing the token directly in the `.npmrc` file.

For advanced use cases, you can also set up the [`~/.npmrc` file](https://docs.npmjs.com/cli/configuring-npm/npmrc) manually. For example, if you need to publish different scopes to different registries, you can set up the `~/.npmrc` file like below:

```yaml
- run: |
    cat <<EOF > ~/.npmrc

    # For unscoped packages, publish to the default npm registry
    //registry.npmjs.org/:_authToken=\${NODE_AUTH_TOKEN}

    # For @foo/* packages, publish to a custom registry
    @foo:registry=https://my-registry.com/
    //my-registry.com/:_authToken=\${NODE_FOO_AUTH_TOKEN}

    # For @bar/* packages, publish to the GitHub Package Registry
    @bar:registry=https://npm.pkg.github.com/
    //npm.pkg.github.com/:_authToken=\${GITHUB_TOKEN}

    EOF
```

### Package Managers Edge Cases

#### pnpm

An `.npmrc` file in a project directory with pnpm does not support environment variables due to [security reasons](https://pnpm.io/blog/2026/06/11/env-variables-in-repository-npmrc). As such, it's recommended to set up in the home directory instead.

This is also the general recommendation for other package managers to not mix potential existing config setups in projects.

#### yarn

[Yarn](https://yarnpkg.com) does not support the `.npmrc` file, compared to every other package managers that do. To set up authentication for yarn, use a [`~/.yarnrc.yml` file](https://yarnpkg.com/configuration/yarnrc) instead:

```yaml
npmAuthToken: "${NODE_AUTH_TOKEN}"
```

For advanced use cases, similar to the `.npmrc` example above, the equivalent looks something like this:

```yaml
- run: |
    cat <<EOF > ~/.yarnrc.yml

    npmAuthToken: "\${NODE_AUTH_TOKEN}"

    npmScopes:
      foo:
        npmRegistryServer: "https://my-registry.com/"
        npmAuthToken: "\${NODE_FOO_AUTH_TOKEN}"
      bar:
        npmRegistryServer: "https://npm.pkg.github.com/"
        npmAuthToken: "\${GITHUB_TOKEN}"
    EOF
```

#### Miscellaneous

Other package managers may also support (or recommend) configuring the tokens in their own configuration files. Check their documentation for more information.
