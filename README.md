# Skill Maxxing — AI Pose Finder

Search mascot images by what is visually happening in the image, not by filename.

## What it does

- Lists images in the configured public Google Drive folder.
- Scans each image with Gemini vision and extracts a pose, labels, body orientation, and visual description.
- Saves the visual index locally in `data/pose-index.json`; unchanged images are reused on later scans.
- Searches the saved visual descriptions and labels.
- Previews images through the server and opens the original in Google Drive for downloading.

## Requirements

- Node.js 22 or later.
- A Google Drive API key with Google Drive API enabled.
- A Gemini API key from Google AI Studio.
- The Drive folder and its images must be shared as **Anyone with the link — Viewer**.

## Setup

1. Clone this repository and open it in VS Code.
2. Run `npm install`.
3. Copy `.env.example` to a new file named `.env`.
4. Put your keys into `.env`:
   - `GOOGLE_DRIVE_API_KEY`: Google Cloud Console → enable Google Drive API → create API key.
   - `GEMINI_API_KEY`: Google AI Studio → Get API key.
5. Start the backend in one VS Code terminal: `npm run server`.
6. Start the frontend in a second terminal: `npm run dev`.
7. Open the Vite localhost URL.
8. Click **Scan Drive images**. The first scan may take a while and Gemini API usage may incur charges depending on your account and current free quota.
9. Search for poses such as `push-up`, `squat`, `plank`, or `running`.

## Important security notes

- Keep `.env` private. Never commit API keys or service-account secrets.
- Keys are read by the Node server, not exposed to the browser.
- For local development, restrict your Drive API key to the Google Drive API. Do not add a browser-referrer restriction because the server makes the request.
- The saved visual index is local and ignored by Git. Back it up if you want to preserve it across deployments.

## Notes and limits

- The first version analyses images sequentially to avoid flooding API quotas. A large folder can take time.
- The app analyses images directly inside the configured folder, not nested folders.
- Search matches the AI-generated pose labels and descriptions. This is visual-description search, not pixel-perfect pose matching.
- If an image changes in Drive, the next scan analyses it again.
