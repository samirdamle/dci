# Changesets

Every PR that changes a published package (`@samirdamle/dci-core`, `@samirdamle/dci-react`, `@samirdamle/dci-server`,
`@samirdamle/dci-protocol`) adds a changeset: run `pnpm changeset`, pick the bump, and describe the change
for users. The four packages are versioned together (a `fixed` group).

On `main`, the release workflow opens a "Version Packages" PR that applies the pending changesets;
merging it publishes to npm. See [CONTRIBUTING.md](../CONTRIBUTING.md#releasing).
