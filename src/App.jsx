import { useEffect, useMemo, useState } from "react";
import { Search, Download, ExternalLink, X, Image as ImageIcon, FolderOpen, RefreshCw, Sparkles } from "lucide-react";

const FOLDER_ID = "1jvgXybzg6NObxAQqaAgHVUUe85F7A2mH";
const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;

function driveImageUrl(fileId, size = 1000) {
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w${size}`;
}

function App() {
  const [files, setFiles] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [loaded, setLoaded] = useState(false);

  async function loadImages() {
    if (!API_KEY || API_KEY === "YOUR_GOOGLE_API_KEY") {
      setError("Add your Google Drive API key in the .env file to connect your image library.");
      setLoaded(true);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        q: `'${FOLDER_ID}' in parents and trashed = false and mimeType contains 'image/'`,
        pageSize: "1000",
        orderBy: "name",
        fields: "files(id,name,mimeType,thumbnailLink,webViewLink),nextPageToken",
        key: API_KEY,
      });

      let allFiles = [];
      let nextPageToken = "";
      do {
        if (nextPageToken) params.set("pageToken", nextPageToken);
        const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`);
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error?.message || "Google Drive could not be reached. Check your API key and folder sharing.");
        }
        allFiles = allFiles.concat(data.files || []);
        nextPageToken = data.nextPageToken || "";
      } while (nextPageToken);

      setFiles(allFiles);
      setLoaded(true);
      if (allFiles.length === 0) {
        setError("No images found. Check that the folder contains images and is shared as Anyone with the link — Viewer.");
      }
    } catch (err) {
      setError(err.message || "Something went wrong while loading the folder.");
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadImages();
  }, []);

  const filteredFiles = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return files;
    return files.filter((file) => file.name.toLowerCase().includes(term));
  }, [files, query]);

  const popularSearches = ["push up", "squat", "running", "stretch", "pull up"];

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Skill Maxxing home">
          <span className="brand-mark">SM</span>
          <span>SKILL<span className="brand-light">MAXXING</span></span>
        </a>
        <div className="topbar-right"><span className="status-dot" /> MASCOT LIBRARY</div>
      </header>

      <section className="hero">
        <div className="eyebrow"><Sparkles size={14} /> YOUR CREATIVE ASSET LIBRARY</div>
        <h1>Find the <span>perfect pose.</span></h1>
        <p className="hero-copy">Search your mascot image collection. Find it, preview it, use it.</p>

        <div className="search-wrap">
          <Search size={21} className="search-icon" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Escape") setQuery(""); }}
            placeholder="Search poses… try “push up” or “running”"
            aria-label="Search mascot poses"
          />
          {query && <button className="clear-search" onClick={() => setQuery("")} aria-label="Clear search"><X size={17} /></button>}
          <span className="search-shortcut">SEARCH</span>
        </div>

        <div className="quick-searches">
          <span>TRY:</span>
          {popularSearches.map((term) => (
            <button key={term} onClick={() => setQuery(term)}>{term}</button>
          ))}
        </div>
      </section>

      <section className="library-section">
        <div className="section-heading">
          <div>
            <div className="section-kicker">GOOGLE DRIVE</div>
            <h2>Your pose library <span className="count">{loaded && !error ? files.length : "—"}</span></h2>
          </div>
          <button className="refresh-button" onClick={loadImages} disabled={loading} title="Refresh library">
            <RefreshCw size={15} className={loading ? "spin" : ""} /> Refresh
          </button>
        </div>

        {loading && (
          <div className="message-panel"><div className="loader" /><p>Connecting to your Drive library…</p></div>
        )}

        {!loading && error && (
          <div className="message-panel error-panel">
            <div className="message-icon"><FolderOpen size={23} /></div>
            <h3>{error.includes("API key") ? "Almost connected" : "Couldn't load the library"}</h3>
            <p>{error}</p>
            <button className="retry-button" onClick={loadImages}><RefreshCw size={15} /> Try again</button>
          </div>
        )}

        {!loading && !error && loaded && filteredFiles.length === 0 && (
          <div className="message-panel">
            <div className="message-icon"><Search size={22} /></div>
            <h3>No matching poses</h3>
            <p>Try another keyword or clear your search.</p>
            <button className="retry-button" onClick={() => setQuery("")}>Clear search</button>
          </div>
        )}

        {!loading && !error && filteredFiles.length > 0 && (
          <>
            <div className="results-line"><span>{filteredFiles.length} {filteredFiles.length === 1 ? "IMAGE" : "IMAGES"}</span><span>CLICK A CARD TO PREVIEW</span></div>
            <div className="image-grid">
              {filteredFiles.map((file) => (
                <button className="image-card" key={file.id} onClick={() => setSelected(file)}>
                  <div className="image-frame">
                    <img src={driveImageUrl(file.id, 600)} alt={file.name} loading="lazy" />
                    <span className="preview-label">PREVIEW ↗</span>
                  </div>
                  <div className="image-meta">
                    <span className="file-icon"><ImageIcon size={14} /></span>
                    <span className="file-name" title={file.name}>{file.name}</span>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      <footer className="footer">
        <span>SKILL MAXXING <span className="footer-muted">· POSE FINDER</span></span>
        <a href={`https://drive.google.com/drive/folders/${FOLDER_ID}`} target="_blank" rel="noreferrer">OPEN DRIVE FOLDER <ExternalLink size={12} /></a>
      </footer>

      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)} role="presentation">
          <section className="preview-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Image preview">
            <div className="modal-header">
              <div><span className="section-kicker">IMAGE PREVIEW</span><h3>{selected.name}</h3></div>
              <button className="modal-close" onClick={() => setSelected(null)} aria-label="Close preview"><X size={20} /></button>
            </div>
            <div className="modal-image"><img src={driveImageUrl(selected.id, 1600)} alt={selected.name} /></div>
            <div className="modal-actions">
              <a className="download-button" href={`https://drive.google.com/uc?export=download&id=${selected.id}`} target="_blank" rel="noreferrer"><Download size={16} /> Download original</a>
              <a className="open-drive-button" href={selected.webViewLink || `https://drive.google.com/file/d/${selected.id}/view`} target="_blank" rel="noreferrer">Open in Drive <ExternalLink size={14} /></a>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

export default App;
