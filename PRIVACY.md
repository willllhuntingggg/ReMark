# ReMark Privacy Policy

**Effective date: September 20, 2026**

ReMark helps you save a selected passage from a webpage or a moment in a supported video, add an optional note, and return to the original context later. This policy explains how ReMark handles data when you use the extension.

> **Summary:** ReMark is local-first by default and stores your Marks directly in your browser. You can use ReMark fully without creating an account. If you optionally choose to sign in with Google to enable **Cloud Backup**, your Marks are securely encrypted and backed up to our cloud infrastructure (powered by Supabase) solely so that you can restore your data across devices or upon reinstallation. ReMark does not sell user data, does not share your data with advertisers, and does not use your content for profiling or tracking.

## Information ReMark Handles

ReMark handles only the information needed to provide its marking, return-to-source, and optional cloud backup features.

| Category | Examples | Purpose |
| --- | --- | --- |
| Website content | Text you explicitly select and mark; video timestamps; optional notes you write | To display, organize, export, backup, and restore your Marks. |
| Web history and source context | The page URL, page title, source position, and the time a Mark was created | To identify the saved source and return you to the original passage or video moment. |
| Extension settings | Appearance, language, default Mark color, and onboarding preferences | To preserve your selected extension experience. |
| Optional account identity (Cloud Backup) | Your Google account ID, email address, and display name | To authenticate your session and associate your cloud backup securely with your account when you choose to sign in with Google. |
| Optional feedback content | The feedback message you choose to write, feedback type, extension version, browser and language information, and the current page title, domain, and URL | To prepare a feedback email only when you choose to use the Feedback feature. |

ReMark does **not** request passwords, payment or financial information, health information, precise geolocation, browsing history unrelated to saved marks, or track you across the web.

## Local Storage and Local-First Architecture

By default, ReMark stores Marks, notes, timestamps, source context, and settings locally on your device using Chrome's extension storage (`chrome.storage.local`). You do not need to sign in to use ReMark.

You have full control over your data. You can delete individual Marks, batch delete Marks, clear the extension's local data through Chrome, or export a local JSON backup at any time.

## Optional Cloud Backup (Google Authentication & Supabase)

ReMark provides an optional **Cloud Backup** feature designed to protect your Marks from being lost if you uninstall the extension, switch browsers, or change devices.

- **How it works:** When you click "Continue with Google", ReMark uses `chrome.identity` to authenticate your Google account via Supabase Auth.
- **What is stored in the cloud:** If signed in, your encrypted backup JSON (containing your saved marks, notes, source URLs, and preferences) is stored in a secure cloud database (Supabase).
- **Data Isolation & Row-Level Security (RLS):** Your cloud data is strictly isolated using database Row-Level Security. Only your authenticated user session has permission to read, insert, or update your backup data. No other user can access or view your Marks.
- **Your Control:** Cloud Backup is completely opt-in. You can sign out at any time from the extension's Settings to disconnect cloud backups. Deleting Marks within the extension will sync and update your cloud backup accordingly.

## Feedback Feature

If you choose to use ReMark's Feedback feature, ReMark prepares a Gmail compose draft containing the feedback message you entered and limited diagnostic context: feedback type, extension version, browser, language, page title, page domain, and page URL. ReMark opens this draft only after your action. You decide whether to send the email.

If you send the email, your email provider and the feedback recipient will handle the message under their applicable privacy practices. ReMark does not automatically send feedback emails.

## How ReMark Uses Data

ReMark uses the information described above solely to provide its user-facing features: creating and displaying Marks, attaching notes, showing video timestamps, returning you to a saved source location, exporting your data, preserving preferences, backing up your data to the cloud when requested, and preparing feedback that you voluntarily initiate.

- ReMark **does not sell or rent** user data.
- ReMark **does not use or transfer** user data for advertising, behavioral profiling, credit assessment, or training AI models.
- ReMark **does not transfer** user data to third parties, except to infrastructure providers (Google OAuth for authentication and Supabase for cloud backup storage) strictly as necessary to provide the features you enable.

## Third-Party Websites & Infrastructure

- **Webpages you visit:** ReMark operates locally on pages you view. Those webpages, including video platforms, are governed by their own privacy policies.
- **Authentication & Cloud Hosting:** Google OAuth and Supabase provide secure authentication and database hosting for the optional Cloud Backup feature in compliance with standard industry security protocols.

## Security

Your local data is protected by Chrome's extension security sandbox. When Cloud Backup is enabled, all data in transit is encrypted using industry-standard TLS/HTTPS protocols, and access to cloud database records is strictly restricted to your authenticated account via database Row-Level Security.

## Changes to This Policy

If ReMark's data practices change materially, this policy will be updated before or when the updated version is released. Any changes will be disclosed consistently in the Chrome Web Store listing and this policy.

## Contact

For privacy questions about ReMark, contact: **xuzijian2222@gmail.com**.
