# Investigate options for certificate pinning bypass on Android

Issue thread: https://github.com/tweaselORG/meta/issues/16

Scripts:

* `app-list.ts`: Get a list of app IDs from the top charts. Save in `data/app-ids.txt`.
* `download.ts`: Download the APKs for the app IDs in `data/app-ids.txt`. APKs are stored in `data/apks`. Requires a properly setup [`googleplay`](https://github.com/4cq2/googleplay) (with `-p 2`) in the `PATH`.
* `run.ts`: Run an analysis on the downloaded APKs, recording the TLS connection errors for each app in `data/results.db` for the following:
    * no certificate pinning bypass
    * objection's certificate pinning bypass
    * https://github.com/httptoolkit/frida-android-unpinning/blob/f82daadf7d1cce1aeab4a38a591dc0a4fadbbf0d/frida-script.js
* `data.ts`: Generate some statistics from the collected results in the database.
