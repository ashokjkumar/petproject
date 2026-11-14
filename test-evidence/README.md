# Test evidence

Only real runs are stored here. Each file names the commit it was run against.

| Stage | Status | Folder |
|---|---|---|
| UT (unit tests, engine and simulator) | Run | UT/ |
| API integration (real routes, engine and in-process Postgres; no real UPI) | Run | API/ |
| Web screens (simulated browser against the real backend; phone-size screenshots from Chrome) | Run | WEB/ |
| SIT (real database, real UPI sandbox, real hosting) | Not run: needs accounts | - |
| Pre-prod | Not run: no environment yet | - |
| iOS / Android | Not run: app shells generated, never compiled or run on a device | - |
