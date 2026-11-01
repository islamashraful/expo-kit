---
'@expo-kit/analytics': patch
---

Events sent right after `initAnalytics`, like PostHog's own app lifecycle events, now also carry `app`, `app_version`, `environment` and `platform`.
