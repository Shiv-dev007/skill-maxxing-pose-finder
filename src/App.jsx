import { useEffect, useMemo, useState } from "react";
import { Search, Download, ExternalLink, X, Image as ImageIcon, FolderOpen, RefreshCw, Sparkles, ScanSearch } from "lucide-react";

const API = "/api";

function App() {
  const [images, setImages] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState(null);

  async function loadIndex() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API}/images`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load the visual index.");
      setImages(data.images || []);
    } catch (err) {
      setError(err.message || "Could not connect to the local server.");
    } finally {
      setLoading(false);
    }
  }

  async function scanLibrary() {
    setScanning(true);
    setError("");
    setNotice("Scanning images with AI. This can take a while for a large folder — keep this tab open.");
    try {
      const response = await fetch(`${API}/scan`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Scan failed.");
      setImages(data.images || []);
      setNotice(`Scan complete: AI analysed ${data.analysed} image(s) and reused ${data.reused} existing result(s), from ${data.total} total.`);
    } catch (err) {
      setError(err.message || "Image scan failed.");
      setNotice("");
    } finally {
      setScanning(false);
    }
  }

  useEffect(() => { loadIndex(); }, []);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase().replace(/[-_]+/g, " ");
    if (!term) return images.filter((image) => !image.failed);
    return images.filter((image) => !image.failed && [
      image.pose, ...(image.labels || []), image.description, image.bodyOrientation
    ].join(" ").toLowerCase().replace(/[-_]+/g, " ").includes(term));
  }, [images, query]);

  const imageUrl = (id) => `${API}/image/${encodeURIComponent(id)}`;

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Skill Maxxing home">
          <span className="brand-mark">SM</span><span>SKILL<span className="brand-light">MAXXING</span></span>
        </a>
        <div className="topbar-right"><span className="status-dot" /> AI VISUAL LIBRARY</div>
      </header>

      <section className="hero">
        <div className="eyebrow"><Sparkles size={14} /> IMAGE UNDERSTANDING · NOT FILE SEARCH</div>
        <h1>Find the <span>perfect pose.</span></h1>
        <p className="hero-copy">AI looks at the actual mascot images and understands the movement. Filenames don't matter.</p>
        <div className="search-wrap">
          <Search size={21} className="search-icon" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setQuery(""); }} placeholder="Describe a pose… e.g. push-up, side plank, running" aria-label="Search visually recognised poses" />
          {query && <button className="clear-search" onClick={() => setQuery("")} aria-label="Clear search"><X size={17} /></button>}
          <span className="search-shortcut">AI INDEX</span>
        </div>
        <div className="quick-searches"><span>TRY:</span>{["push-up", "pull-up", "squat", "plank", "running"].map((term) => <button key={term} onClick={() => setQuery(term)}>{term}</button>)}</div>
      </section>

      <section className="library-section">
        <div className="section-heading">
          <div><div className="section-kicker">GOOGLE DRIVE · VISUAL INDEX</div><h2>Recognised poses <span className="count">{images.filter((image) => !image.failed).length}</span></h2></div>
          <button className="refresh-button" onClick={scanLibrary} disabled={scanning}><ScanSearch size={15} className={scanning ? "spin" : ""} /> {scanning ? "Scanning…" : "Scan Drive images"}</button>
        </div>
        {notice && <div className="message-panel"><p>{notice}</p></div>}
        {error && <div className="message-panel error-panel"><div className="message-icon"><FolderOpen size={23} /></div><h3>Couldn't connect</h3><p>{error}</p><button className="retry-button" onClick={loadIndex}><RefreshCw size={15} /> Retry</button></div>}
        {loading && !error && <div className="message-panel"><div className="loader" /><p>Loading your saved visual index…</p></div>}
        {!loading && !error && images.length === 0 && !scanning && <div className="message-panel"><div className="message-icon"><ScanSearch size={23} /></div><h3>Your visual index is waiting</h3><p>Press “Scan Drive images” once. AI will inspect each image and save its pose description for future searches.</p></div>}
        {scanning && <div className="message-panel"><div className="loader" /><p>AI is inspecting the actual image pixels. Keep this tab open; the first scan may take a few minutes.</p></div>}
        {!loading && !scanning && !error && images.length > 0 && filtered.length === 0 && <div className="message-panel"><div className="message-icon"><Search size={22} /></div><h3>No visual matches</h3><p>Try another description or scan the library again if you've added new images.</p><button className="retry-button" onClick={() => setQuery("")}>Show all poses</button></div>}
        {!loading && !scanning && !error && filtered.length > 0 && (
          <>
            <div className="results-line"><span>{filtered.length} MATCHING IMAGE{filtered.length === 1 ? "" : "S"}</span><span>RESULTS FROM VISUAL ANALYSIS</span></div>
            <div className="image-grid">
              {filtered.map((image) => <button className="image-card" key={image.id} onClick={() => setSelected(image)}>
                <div className="image-frame"><img src={imageUrl(image.id)} alt={image.description || image.pose} loading="lazy" /><span className="preview-label">PREVIEW ↗</span></div>
                <div className="image-meta"><span className="file-icon"><ImageIcon size={14} /></span><span className="file-name">{image.pose}</span></div>
                <p className="pose-description">{image.description}</p>
                <div className="pose-tags">{(image.labels || []).slice(0, 4).map((label) => <span key={label}>{label}</span>)}</div>
              </button>)}
            </div>
          </>
        )}
      </section>

      <footer className="footer"><span>SKILL MAXXING <span className="footer-muted">· AI POSE FINDER</span></span><a href="https://drive.google.com/drive/folders/1jvgXybzg6NObxAQqaAgHVUUe85F7A2mH" target="_blank" rel="noreferrer">OPEN DRIVE FOLDER <ExternalLink size={12} /></a></footer>

      {selected && <div className="modal-backdrop" onClick={() => setSelected(null)} role="presentation">
        <section className="preview-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Image preview">
          <div className="modal-header"><div><span className="section-kicker">AI RECOGNISED POSE</span><h3>{selected.pose}</h3></div><button className="modal-close" onClick={() => setSelected(null)} aria-label="Close preview"><X size={20} /></button></div>
          <div className="modal-image"><img src={imageUrl(selected.id)} alt={selected.description || selected.pose} /></div>
          <p className="modal-description">{selected.description}</p>
          <div className="modal-actions"><a className="download-button" href={`https://drive.google.com/uc?export=download&id=${selected.id}`} target="_blank" rel="noreferrer"><Download size={16} /> Download original</a><a className="open-drive-button" href={selected.webViewLink} target="_blank" rel="noreferrer">Open in Drive <ExternalLink size={14} /></a></div>
        </section>
      </div>}
    </main>
  );
}

export default App;
