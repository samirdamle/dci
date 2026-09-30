---
'@samirdamle/dci-core': patch
'@samirdamle/dci-react': patch
'@samirdamle/dci-server': patch
'@samirdamle/dci-protocol': patch
---

`VERSION` is typed as `string` instead of a literal type, so it no longer changes the type
declarations on every release.
