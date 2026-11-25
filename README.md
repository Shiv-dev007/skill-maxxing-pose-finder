# Skill Maxxing — AI Pose Finder

AI analyses mascot image pixels (not filenames), creates searchable pose descriptions, proposes descriptive filenames, and can bulk-rename actual Google Drive files after your approval.

## Requirements

- Node.js 20+
- Gemini API key from https://aistudio.google.com/apikey
- Google OAuth web application credentials from https://console.cloud.google.com/
- Google account with **Editor** access to the target Drive folder and images.

## Google OAuth setup (required for renaming)

1. In Google Cloud Console, select your project and enable **Google Drive API**.
2. Configure the OAuth consent screen. Add your Google account as a test user if the app is in Testing.
3. Create OAuth client credentials of type **Web application**.
4. Add this exact Authorized redirect URI: `http://localhost:3001/auth/google/callback`.
5. Copy the client ID and client secret into `.env`.

The app requests the Google Drive scope because renaming existing files requires edit permission. A public Viewer link or API key alone cannot rename files. Sign in with an account that can edit the folder.

## Setup

```bash
npm install
```

Copy `.env.example` to `.env` and fill in Gemini and Google OAuth values. Do not prefix secrets with VITE_.

Start two terminals:

Terminal 1:
```bash
npm run server
```

Terminal 2:
```bash
npm run dev
```

Open the Vite localhost URL, click **Connect Google Drive**, sign in and grant access, then click **Scan Drive**.

## Review and rename

1. Scan analyses image pixels and generates a suggested filename based on pose and orientation.
2. Click **Preview names** to review current and proposed filenames.
3. Click **Rename all** only when satisfied. This updates file names in Drive without changing image contents or file IDs.
4. Click **Undo rename** to restore the previous names from the most recent batch.

Undo checks that each file still has the name applied by the last batch. If someone manually changed a file afterward, that file is skipped rather than overwritten. The rename history and visual index are stored locally in `data/`.

## Notes

- The Drive folder and images must be accessible to the Google account you connect. The account needs Editor permission to rename.
- Images directly inside the folder are scanned; nested folders are not traversed.
- The first AI scan may take time and Gemini API use is subject to current quotas/pricing.
- Keep `.env`, `data/google-token.json`, `data/rename-history.json`, and `data/pose-index.json` private.
