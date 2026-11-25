import express from "express";
import { GoogleGenAI } from "@google/genai";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const PORT = process.env.PORT || 3001;
const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || "1jvgXybzg6NObxAQqaAgHVUUe85F7A2mH";
const DRIVE_KEY = process.env.GOOGLE_DRIVE_API_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const INDEX_FILE = path.join(DATA_DIR, "pose-index.json");

app.use(express.json({ limit: "1mb" }));

let poseIndex = [];
let scanInProgress = false;

async function saveIndex() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(INDEX_FILE, JSON.stringify(poseIndex, null, 2));
}

async function loadIndex() {
  try {
    poseIndex = JSON.parse(await fs.readFile(INDEX_FILE, "utf8"));
  } catch {
    poseIndex = [];
  }
}

async function listDriveImages() {
  if (!DRIVE_KEY) throw new Error("Missing GOOGLE_DRIVE_API_KEY in your .env file.");
  const files = [];
  let pageToken = "";
  do {
    const params = new URLSearchParams({
      q: `'${FOLDER_ID}' in parents and trashed = false and mimeType contains 'image/'`,
      pageSize: "1000",
      fields: "nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink)",
      key: DRIVE_KEY,
    });
    if (pageToken) params.set("pageToken", pageToken);
    const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "Could not list Google Drive images.");
    files.push(...(data.files || []));
    pageToken = data.nextPageToken || "";
  } while (pageToken);
  return files;
}

async function downloadDriveImage(fileId) {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&key=${encodeURIComponent(DRIVE_KEY)}`);
  if (!response.ok) throw new Error(`Could not download Drive image ${fileId} (${response.status}). Check that it is shared as Anyone with the link — Viewer.`);
  const type = response.headers.get("content-type") || "image/jpeg";
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!type.startsWith("image/")) throw new Error("A Drive file was not returned as an image.");
  return { buffer, mimeType: type.split(";")[0] };
}

function parseJson(text) {
  const cleaned = text.replace(/^```json\s*/i, "").replace(/\s*```$/, "").trim();
  return JSON.parse(cleaned);
}

async function analyseImage(file) {
  if (!GEMINI_KEY) throw new Error("Missing GEMINI_API_KEY in your .env file.");
  const { buffer, mimeType } = await downloadDriveImage(file.id);
  const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      { inlineData: { data: buffer.toString("base64"), mimeType } },
      `Inspect the actual pixels of this mascot/character image. Identify the visible body pose and action. Do not use or infer anything from the filename. Return ONLY valid JSON with this shape:
{"pose":"short pose name","labels":["short searchable pose/action terms"],"description":"one sentence describing body orientation, limb positions and action","body_orientation":"front, side, back, or unclear"}
If it is not a person/mascot doing a recognisable physical pose, describe what is visible and use labels that fit. Do not invent hidden details.`
    ],
    config: { responseMimeType: "application/json" }
  });
  const result = parseJson(response.text || "{}");
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    modifiedTime: file.modifiedTime || "",
    webViewLink: file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`,
    pose: String(result.pose || "Unclassified pose"),
    labels: Array.isArray(result.labels) ? result.labels.map(String) : [],
    description: String(result.description || ""),
    bodyOrientation: String(result.body_orientation || "unclear"),
    indexedAt: new Date().toISOString()
  };
}

app.get("/api/status", (_req, res) => {
  res.json({ ready: Boolean(DRIVE_KEY && GEMINI_KEY), count: poseIndex.length, scanning: scanInProgress });
});

app.get("/api/images", (_req, res) => {
  res.json({ images: poseIndex });
});

app.post("/api/scan", async (_req, res) => {
  if (scanInProgress) return res.status(409).json({ error: "A scan is already running." });
  if (!DRIVE_KEY || !GEMINI_KEY) return res.status(400).json({ error: "Add GOOGLE_DRIVE_API_KEY and GEMINI_API_KEY to your .env file first." });
  scanInProgress = true;
  try {
    const files = await listDriveImages();
    const previous = new Map(poseIndex.map((item) => [item.id, item]));
    const next = [];
    let analysed = 0;
    let reused = 0;
    for (const file of files) {
      const cached = previous.get(file.id);
      if (cached && cached.modifiedTime === (file.modifiedTime || "")) {
        next.push(cached);
        reused++;
        continue;
      }
      try {
        next.push(await analyseImage(file));
        analysed++;
        poseIndex = [...next, ...files.slice(next.length).map((f) => previous.get(f.id)).filter(Boolean)];
        await saveIndex();
      } catch (error) {
        console.error("Image analysis failed:", file.id, error.message);
        next.push({
          id: file.id, name: file.name, mimeType: file.mimeType,
          modifiedTime: file.modifiedTime || "",
          webViewLink: file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`,
          pose: "Analysis failed", labels: [], description: error.message,
          bodyOrientation: "unclear", indexedAt: new Date().toISOString(), failed: true
        });
      }
    }
    poseIndex = next;
    await saveIndex();
    res.json({ message: "Visual scan complete.", total: files.length, analysed, reused, images: poseIndex });
  } catch (error) {
    res.status(500).json({ error: error.message || "The image scan failed." });
  } finally {
    scanInProgress = false;
  }
});

function normalise(value) {
  return String(value || "").toLowerCase().replace(/[_-]+/g, " ").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

const synonyms = {
  pushup: ["push up", "push ups", "pushup", "pushups"],
  pullup: ["pull up", "pull ups", "pullup", "pullups", "chin up", "chinups"],
  squat: ["squat", "squats"],
  plank: ["plank", "planking"],
  running: ["run", "running", "jog", "jogging"],
  sitting: ["sit", "sitting", "seated"],
  jumping: ["jump", "jumping", "leap"],
  stretching: ["stretch", "stretching", "mobility"]
};

app.get("/api/search", (req, res) => {
  const query = normalise(req.query.q);
  if (!query) return res.json({ images: poseIndex.filter((item) => !item.failed) });
  const terms = new Set([query, ...query.split(" ")]);
  for (const group of Object.values(synonyms)) {
    if (group.some((term) => query.includes(normalise(term)) || normalise(term).includes(query))) {
      group.forEach((term) => terms.add(normalise(term)));
    }
  }
  const results = poseIndex.filter((item) => !item.failed).map((item) => {
    const haystack = normalise([item.pose, ...(item.labels || []), item.description, item.bodyOrientation].join(" "));
    let score = 0;
    for (const term of terms) {
      if (term.length > 1 && haystack.includes(term)) score += term.includes(" ") ? 5 : 2;
    }
    return { ...item, score };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score);
  res.json({ images: results });
});

app.get("/api/image/:id", async (req, res) => {
  try {
    if (!DRIVE_KEY) return res.status(400).send("Missing Google Drive API key.");
    const { buffer, mimeType } = await downloadDriveImage(req.params.id);
    res.set("Content-Type", mimeType);
    res.set("Cache-Control", "public, max-age=3600");
    res.send(buffer);
  } catch (error) {
    res.status(404).send(error.message);
  }
});

await loadIndex();
app.listen(PORT, () => console.log(`Pose Finder API running at http://localhost:${PORT}`));
