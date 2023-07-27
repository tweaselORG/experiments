# Traffic collection for TrackHAR adapter work (with monkey on Android)

Issue thread: https://github.com/tweaselORG/experiments/issues/1

Scripts:

* `app-list.ts`: Get a list of app IDs from the top charts. Results are stored in `data/app-ids-android.txt` and `data/app-ids-ios.txt`. Workflow for iOS is based on ridiculous manual work.
* `download-android.ts`: Download the APKs for the app IDs in `data/app-ids-android.txt`. Requires a properly setup [`googleplay`](https://github.com/4cq2/googleplay) (with `-p 2`) in the `PATH`.
* `download-ios.ts`: Download hte IPA files for the app IDs in `data/app-ids-ios.txt`. Requires a properly setup [`ipatool`](https://github.com/majd/ipatool) in the `PATH`.
* `run.ts`: Run an analysis on the downloaded apps. Traffic is stored in `*.har`, additional metadata (including mitmproxy events) in `*-meta.json`.
* `export-to-database.ts`: Export the results to an SQLite database (for our [open database](https://github.com/tweaselORG/meta/issues/33)).
