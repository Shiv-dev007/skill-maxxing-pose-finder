# Skill Maxxing — Pose Finder

A small React + Vite app that searches image filenames in a public Google Drive folder, previews the original image, and opens its download link.

## 1. Google Drive folder

Folder ID is already configured in `src/App.jsx`:

`1jvgXybzg6NObxAQqaAgHVUUe85F7A2mH`

Make sure the folder and its images are shared as **Anyone with the link — Viewer**.

## 2. Create a Google Drive API key

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a project.
3. Open **APIs & Services → Library** and enable **Google Drive API**.
4. Open **APIs & Services → Credentials → Create credentials → API key**.
5. Restrict the key to the **Google Drive API**.
6. Under website restrictions, add your local development origin (for example `http://localhost:5173/*`) and your deployed website domain.
7. Copy `.env.example` to `.env` and add the key:

```env
VITE_GOOGLE_API_KEY=your_key_here
```

The key is used by the browser, so **website and API restrictions are essential**. Never use a service-account private key or OAuth client secret in this frontend.

## 3. Run locally

Install [Node.js](https://nodejs.org/) (LTS), then run:

```bash
npm install
npm run dev
```

Open the local URL printed by Vite (usually `http://localhost:5173`).

## 4. Search behaviour

The app lists image files directly inside the configured Drive folder and filters them by filename. Use descriptive filenames such as `push-up-front.png`, `squat-side.png`, or `running.png` for reliable search.

## Notes

- This is a browser-only MVP; no backend or database is needed.
- Google Drive API key setup is required before the live folder can load.
- The Drive API only lists files that are directly inside the selected folder. Images in nested folders are not included.
- Download opens Google's original-file download endpoint in a new tab.
