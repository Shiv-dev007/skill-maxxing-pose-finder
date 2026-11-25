import "dotenv/config";
import express from "express";
import { GoogleGenAI } from "@google/genai";
import { google } from "googleapis";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const PORT = process.env.PORT || 3001;
const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || "1jvgXybzg6NObxAQqaAgHVUUe85F7A2mH";
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || `http://localhost:${PORT}/auth/google/callback`;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const INDEX_FILE = path.join(DATA_DIR, "pose-index.json");
const TOKEN_FILE = path.join(DATA_DIR, "google-token.json");
const HISTORY_FILE = path.join(DATA_DIR, "rename-history.json");

app.use(express.json({ limit: "1mb" }));
let poseIndex = [];
let renameHistory = [];
let scanInProgress = false;
let oauthClient;

function getOAuthClient() {
  if (!CLIENT_ID || !CLIENT_SECRET) throw new Error("Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env first.");
  if (!oauthClient) oauthClient = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
  return oauthClient;
}
async function getDrive() {
  const auth = getOAuthClient();
  try {
    const saved = JSON.parse(await fs.readFile(TOKEN_FILE, "utf8"));
    auth.setCredentials(saved);
  } catch {
    throw new Error("Google Drive is not connected. Click Connect Google Drive first.");
  }
  auth.on("tokens", async (tokens) => {
    try {
      const current = JSON.parse(await fs.readFile(TOKEN_FILE, "utf8"));
      await fs.writeFile(TOKEN_FILE, JSON.stringify({ ...current, ...tokens }, null, 2));
    } catch (error) { console.error("Could not save refreshed Google token:", error.message); }
  });
  return google.drive({ version: "v3", auth });
}
async function saveJson(file, value) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2));
}
async function loadJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); } catch { return fallback; }
}
function slug(value) {
  return String(value || "pose").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 55) || "pose";
}
function proposedFilename(item) {
  const ext = path.extname(item.name || "").toLowerCase() || ".png";
  const orientation = item.bodyOrientation && !["unclear", "front"].includes(item.bodyOrientation.toLowerCase())
    ? `-${slug(item.bodyOrientation)}` : "";
  return `${slug(item.pose)}${orientation}${ext}`;
}
async function listDriveImages(drive) {
  const files = [];
  let pageToken;
  do {
    const result = await drive.files.list({
      q: `'${FOLDER_ID}' in parents and trashed = false and mimeType contains 'image/'`,
      pageSize: 1000,
      pageToken,
      fields: "nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink)",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true
    });
    files.push(...(result.data.files || []));
    pageToken = result.data.nextPageToken || undefined;
  } while (pageToken);
  return files;
}
async function downloadDriveImage(drive, fileId) {
  const result = await drive.files.get({ fileId, alt: "media", supportsAllDrives: true }, { responseType: "arraybuffer" });
  const mimeType = result.headers["content-type"] || "image/jpeg";
  if (!mimeType.startsWith("image/")) throw new Error("Drive did not return an image file.");
  return { buffer: Buffer.from(result.data), mimeType: mimeType.split(";")[0] };
}
function parseJson(text) {
  return JSON.parse(String(text || "{}").replace(/^```json\s*/i, "").replace(/\s*```$/, "").trim());
}
async function analyseImage(drive, file) {
  if (!GEMINI_KEY) throw new Error("Missing GEMINI_API_KEY in .env.");
  const { buffer, mimeType } = await downloadDriveImage(drive, file.id);
  const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      { inlineData: { data: buffer.toString("base64"), mimeType } },
      `Inspect the actual pixels, not the filename. Identify the visible mascot/body pose. Return ONLY JSON:
{"pose":"short clear pose name","labels":["search terms and synonyms"],"description":"one sentence about visible body position/action","body_orientation":"front, side, back, or unclear"}
Be precise. Do not infer hidden details.`
    ],
    config: { responseMimeType: "application/json" }
  });
  const result = parseJson(response.text);
  const item = {
    id: file.id, name: file.name, originalName: file.name, mimeType: file.mimeType,
    modifiedTime: file.modifiedTime || "", webViewLink: file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`,
    pose: String(result.pose || "Unclassified pose"),
    labels: Array.isArray(result.labels) ? result.labels.map(String) : [],
    description: String(result.description || ""),
    bodyOrientation: String(result.body_orientation || "unclear"),
    indexedAt: new Date().toISOString(), failed: false
  };
  item.proposedName = proposedFilename(item);
  return item;
}

app.get("/auth/google", (_req, res) => {
  try {
    const auth = getOAuthClient();
    const url = auth.generateAuthUrl({
      access_type: "offline", prompt: "consent",
      scope: ["https://www.googleapis.com/auth/drive"]
    });
    res.redirect(url);
  } catch (error) { res.status(400).send(error.message); }
});
app.get("/auth/google/callback", async (req, res) => {
  try {
    if (req.query.error) throw new Error(String(req.query.error));
    const auth = getOAuthClient();
    const { tokens } = await auth.getToken(String(req.query.code || ""));
    await saveJson(TOKEN_FILE, tokens);
    res.redirect("http://localhost:5173/?drive=connected");
  } catch (error) { res.status(400).send(`Google authorization failed: ${error.message}`); }
});
app.get("/api/status", async (_req, res) => {
  let connected = false;
  try { await fs.access(TOKEN_FILE); connected = true; } catch {}
  res.json({ ready: Boolean(connected && GEMINI_KEY), connected, count: poseIndex.length, scanning: scanInProgress });
});
app.get("/api/images", (_req, res) => res.json({ images: poseIndex }));
app.post("/api/scan", async (_req, res) => {
  if (scanInProgress) return res.status(409).json({ error: "A scan is already running." });
  if (!GEMINI_KEY) return res.status(400).json({ error: "Add GEMINI_API_KEY to .env." });
  scanInProgress = true;
  try {
    const drive = await getDrive();
    const files = await listDriveImages(drive);
    const previous = new Map(poseIndex.map((item) => [item.id, item]));
    const next = [];
    let analysed = 0, reused = 0;
    for (const file of files) {
      const cached = previous.get(file.id);
      if (cached && cached.modifiedTime === (file.modifiedTime || "") && !cached.failed) {
        next.push({ ...cached, name: file.name, webViewLink: file.webViewLink || cached.webViewLink });
        reused++;
      } else {
        try {
          const item = await analyseImage(drive, file);
          const prior = previous.get(file.id);
          item.originalName = prior?.originalName || file.name;
          next.push(item);
          analysed++;
        } catch (error) {
          next.push({ id: file.id, name: file.name, originalName: previous.get(file.id)?.originalName || file.name,
            mimeType: file.mimeType, modifiedTime: file.modifiedTime || "", pose: "Analysis failed",
            labels: [], description: error.message, bodyOrientation: "unclear", failed: true });
        }
      }
      poseIndex = [...next];
      await saveJson(INDEX_FILE, poseIndex);
    }
    poseIndex = next;
    await saveJson(INDEX_FILE, poseIndex);
    res.json({ total: files.length, analysed, reused, images: poseIndex });
  } catch (error) { res.status(500).json({ error: error.message || "Scan failed." }); }
  finally { scanInProgress = false; }
});
app.post("/api/rename/preview", (_req, res) => {
  const candidates = poseIndex.filter((item) => !item.failed).map((item) => ({
    id: item.id, currentName: item.name, originalName: item.originalName || item.name,
    proposedName: item.proposedName || proposedFilename(item), pose: item.pose,
    description: item.description, webViewLink: item.webViewLink
  }));
  const counts = new Map();
  for (const item of candidates) counts.set(item.proposedName, (counts.get(item.proposedName) || 0) + 1);
  const used = new Set();
  for (const item of candidates) {
    if (counts.get(item.proposedName) > 1 || used.has(item.proposedName)) {
      const ext = path.extname(item.proposedName);
      const base = item.proposedName.slice(0, -ext.length);
      let n = 2, candidate = `${base}-${n}${ext}`;
      while (used.has(candidate)) candidate = `${base}-${++n}${ext}`;
      item.proposedName = candidate;
    }
    used.add(item.proposedName);
  }
  res.json({ candidates });
});
app.post("/api/rename/apply", async (_req, res) => {
  try {
    const drive = await getDrive();
    const preview = await new Promise((resolve) => {
      const candidates = poseIndex.filter((item) => !item.failed).map((item) => ({
        id: item.id, currentName: item.name, proposedName: item.proposedName || proposedFilename(item)
      }));
      const counts = new Map();
      candidates.forEach((item) => counts.set(item.proposedName, (counts.get(item.proposedName) || 0) + 1));
      const used = new Set();
      for (const item of candidates) {
        if (counts.get(item.proposedName) > 1 || used.has(item.proposedName)) {
          const ext = path.extname(item.proposedName), base = item.proposedName.slice(0, -ext.length);
          let n = 2, candidate = `${base}-${n}${ext}`;
          while (used.has(candidate)) candidate = `${base}-${++n}${ext}`;
          item.proposedName = candidate;
        }
        used.add(item.proposedName);
      }
      resolve(candidates);
    });
    const operations = [];
    for (const item of preview) {
      if (item.currentName === item.proposedName) continue;
      const result = await drive.files.update({
        fileId: item.id, requestBody: { name: item.proposedName },
        fields: "id,name,modifiedTime", supportsAllDrives: true
      });
      operations.push({ id: item.id, originalName: item.currentName, renamedTo: result.data.name });
      const indexed = poseIndex.find((entry) => entry.id === item.id);
      if (indexed) { indexed.name = result.data.name; indexed.modifiedTime = result.data.modifiedTime || indexed.modifiedTime; }
    }
    if (operations.length) {
      renameHistory.push({ id: `rename-${Date.now()}`, createdAt: new Date().toISOString(), operations });
      await saveJson(HISTORY_FILE, renameHistory);
      await saveJson(INDEX_FILE, poseIndex);
    }
    res.json({ renamed: operations.length, operations, images: poseIndex });
  } catch (error) { res.status(500).json({ error: error.message || "Bulk rename failed." }); }
});
app.post("/api/rename/undo", async (_req, res) => {
  try {
    const drive = await getDrive();
    const batch = renameHistory[renameHistory.length - 1];
    if (!batch) return res.status(400).json({ error: "There is no rename batch to undo." });
    const restored = [], skipped = [];
    for (const operation of [...batch.operations].reverse()) {
      try {
        const current = await drive.files.get({ fileId: operation.id, fields: "id,name", supportsAllDrives: true });
        if (current.data.name !== operation.renamedTo) {
          skipped.push({ id: operation.id, expected: operation.renamedTo, actual: current.data.name });
          continue;
        }
        const result = await drive.files.update({
          fileId: operation.id, requestBody: { name: operation.originalName },
          fields: "id,name,modifiedTime", supportsAllDrives: true
        });
        restored.push({ id: operation.id, name: result.data.name });
        const indexed = poseIndex.find((entry) => entry.id === operation.id);
        if (indexed) { indexed.name = result.data.name; indexed.modifiedTime = result.data.modifiedTime || indexed.modifiedTime; }
      } catch (error) { skipped.push({ id: operation.id, error: error.message }); }
    }
    renameHistory.pop();
    await saveJson(HISTORY_FILE, renameHistory);
    await saveJson(INDEX_FILE, poseIndex);
    res.json({ restored: restored.length, skipped, images: poseIndex });
  } catch (error) { res.status(500).json({ error: error.message || "Undo failed." }); }
});
function normalise(value) {
  return String(value || "").toLowerCase().replace(/[_-]+/g, " ").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}
const synonyms = {
  pushup: ["push up", "push ups", "pushup", "pushups"], pullup: ["pull up", "pull ups", "pullup", "pullups", "chin up", "chinups"],
  squat: ["squat", "squats"], plank: ["plank", "planking"], running: ["run", "running", "jog", "jogging"],
  sitting: ["sit", "sitting", "seated"], jumping: ["jump", "jumping", "leap"], stretching: ["stretch", "stretching", "mobility"]
};
app.get("/api/search", (req, res) => {
  const query = normalise(req.query.q);
  if (!query) return res.json({ images: poseIndex.filter((item) => !item.failed) });
  const terms = new Set([query, ...query.split(" ")]);
  for (const group of Object.values(synonyms)) if (group.some((term) => query.includes(normalise(term)) || normalise(term).includes(query))) group.forEach((term) => terms.add(normalise(term)));
  const results = poseIndex.filter((item) => !item.failed).map((item) => {
    const haystack = normalise([item.name, item.originalName, item.pose, ...(item.labels || []), item.description, item.bodyOrientation].join(" "));
    let score = 0;
    for (const term of terms) if (term.length > 1 && haystack.includes(term)) score += term.includes(" ") ? 5 : 2;
    return { ...item, score };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score);
  res.json({ images: results });
});
app.get("/api/image/:id", async (req, res) => {
  try {
    const drive = await getDrive();
    const { buffer, mimeType } = await downloadDriveImage(drive, req.params.id);
    res.set("Content-Type", mimeType);
    res.set("Cache-Control", "private, max-age=3600");
    res.send(buffer);
  } catch (error) { res.status(404).send(error.message); }
});
await fs.mkdir(DATA_DIR, { recursive: true });
poseIndex = await loadJson(INDEX_FILE, []);
renameHistory = await loadJson(HISTORY_FILE, []);
app.listen(PORT, () => console.log(`Pose Finder API running at http://localhost:${PORT}`));
