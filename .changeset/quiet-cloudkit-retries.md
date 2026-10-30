---
'@expo-kit/cloudkit': patch
---

Report an `apply` error only if the change still fails after a sync finished, once, instead of on every retry while records are still arriving.
