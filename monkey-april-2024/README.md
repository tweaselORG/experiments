# Generic Android monkey traffic collection April 2024

Issue thread: https://github.com/tweaselORG/experiments/issues/2

**Note**: The code here is not particularly clean. The Android emulator kept crashing on me and cyanoacrylate is currently not equipped to deal with that, so I decided to just fully restart for every error. Certainly not the most efficient way of going about things.

Also, this was run with (as of now) unreleased versions of appstraction and cyanoacrylate, so the `package.json` is wrong. 

Scripts:

* `app-list.ts`: Get a list of app IDs from the top charts. Results are stored in `data/app-ids-android.txt` and `data/app-ids-ios.txt`.
* `download-android.ts`: Download the APKs for the app IDs in `data/app-ids-android.txt`. Requires a properly setup [`apkeep`](https://github.com/EFForg/apkeep) in the `PATH`. Refer to [my set up steps](https://github.com/tweaselORG/meta/issues/46#issuecomment-2079028340).
* `run.ts`: Run an analysis on the downloaded apps. Traffic is stored in `*.har`, additional metadata (including mitmproxy events) in `*-meta.json`.
* `export-to-database.ts`: Export the results to an SQLite database for data.tweasel.org.
