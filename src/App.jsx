import { useEffect, useMemo, useState } from "react";
import { Search, Download, ExternalLink, X, Image as ImageIcon, FolderOpen, RefreshCw, Sparkles, ScanSearch, Pencil, Undo2, CheckCircle2 } from "lucide-react";

const API = "/api";
function App() {
  const [images, setImages] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState(null);
  const [preview, setPreview] = useState([]);
  const [showPreview, setShowPreview] = useState(false);

  async function request(url, options) {
    const response = await fetch(url, options);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Request failed.");
    return data;
  }
  async function loadIndex() {
    setLoading(true); setError("");
    try {
      const [index, status] = await Promise.all([request(`${API}/images`), request(`${API}/status`)]);
      setImages(index.images || []); setConnected(status.connected);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }
  async function scanLibrary() {
    setScanning(true); setError(""); setNotice("AI is inspecting the actual image pixels. No Drive filenames will be changed yet.");
    try {
      const data = await request(`${API}/scan`, { method: "POST" });
      setImages(data.images || []);
      setNotice(`Scan complete: ${data.analysed} analysed, ${data.reused} reused, ${data.total} images found. Review the proposed names before applying them.`);
    } catch (err) { setError(err.message); setNotice(""); }
    finally { setScanning(false); }
  }
  async function loadRenamePreview() {
    try {
      const data = await request(`${API}/rename/preview`, { method: "POST" });
      setPreview(data.candidates || []); setShowPreview(true);
    } catch (err) { setError(err.message); }
  }
  async function applyRename() {
    if (!window.confirm(`Rename ${preview.length} Google Drive image files? This changes their actual Drive filenames.`)) return;
    setRenaming(true); setError("");
    try {
      const data = await request(`${API}/rename/apply`, { method: "POST" });
      setImages(data.images || []); setShowPreview(false);
      setNotice(`Renamed ${data.renamed} file(s) in Google Drive. ${data.failures?.length ? `${data.failures.length} file(s) could not be renamed; check your Drive permissions.` : "All selected files were renamed."} You can undo the successful changes.`);
    } catch (err) { setError(err.message); }
    finally { setRenaming(false); }
  }
  async function undoRename() {
    if (!window.confirm("Undo the most recent bulk rename? Files whose names have since changed manually will be skipped.")) return;
    setRenaming(true); setError("");
    try {
      const data = await request(`${API}/rename/undo`, { method: "POST" });
      setImages(data.images || []);
      setNotice(`Restored ${data.restored} filename(s). Skipped ${data.skipped?.length || 0} file(s) that had changed since.`);
    } catch (err) { setError(err.message); }
    finally { setRenaming(false); }
  }
  useEffect(() => { loadIndex(); }, []);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase().replace(/[-_]+/g, " ");
    if (!term) return images.filter((image) => !image.failed);
    return images.filter((image) => !image.failed && [image.name, image.originalName, image.pose, ...(image.labels || []), image.description, image.bodyOrientation].join(" ").toLowerCase().replace(/[-_]+/g, " ").includes(term));
  }, [images, query]);
  const imageUrl = (id) => `${API}/image/${encodeURIComponent(id)}`;
  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Skill Maxxing home"><span className="brand-mark">SM</span><span>SKILL<span className="brand-light">MAXXING</span></span></a>
        <div className="topbar-right"><span className={connected ? "status-dot" : "status-dot disconnected"} /> {connected ? "GOOGLE DRIVE CONNECTED" : "DRIVE NOT CONNECTED"}</div>
      </header>
      <section className="hero">
        <div className="eyebrow"><Sparkles size={14} /> VISUAL RECOGNITION · SMART FILE NAMING</div>
        <h1>Find the <span>perfect pose.</span></h1>
        <p className="hero-copy">AI recognises the pose from the image itself, suggests a useful filename, and lets you search both.</p>
        <div className="search-wrap"><Search size={21} className="search-icon" /><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setQuery(""); }} placeholder="Search pose, action or filename…" aria-label="Search poses and filenames" />{query && <button className="clear-search" onClick={() => setQuery("")} aria-label="Clear search"><X size={17} /></button>}<span className="search-shortcut">SEARCH</span></div>
        <div className="quick-searches"><span>TRY:</span>{["push-up", "pull-up", "squat", "plank", "running"].map((term) => <button key={term} onClick={() => setQuery(term)}>{term}</button>)}</div>
      </section>
      <section className="library-section">
        <div className="section-heading">
          <div><div className="section-kicker">GOOGLE DRIVE · VISUAL INDEX</div><h2>Recognised poses <span className="count">{images.filter((image) => !image.failed).length}</span></h2></div>
          <div className="toolbar"><button className="refresh-button" onClick={scanLibrary} disabled={scanning || !connected}><ScanSearch size={15} className={scanning ? "spin" : ""} /> {scanning ? "Scanning…" : "Scan Drive"}</button>{images.some((image) => !image.failed) && <button className="refresh-button" onClick={loadRenamePreview} disabled={scanning || renaming}><Pencil size={15}/> Preview names</button>}<button className="refresh-button" onClick={undoRename} disabled={renaming}><Undo2 size={15}/> Undo rename</button></div>
        </div>
        {!connected && <div className="connect-panel"><div><h3>Connect your Google Drive</h3><p>Required to scan and rename your actual Drive files. Sign in with the Google account that owns or can edit the folder.</p></div><a className="download-button" href="http://localhost:3001/auth/google"> <FolderOpen size={16}/> Connect Google Drive</a></div>}
        {notice && <div className="message-panel notice-panel"><CheckCircle2 size={18}/><p>{notice}</p></div>}
        {error && <div className="message-panel error-panel"><div className="message-icon"><FolderOpen size={23}/></div><h3>Couldn't complete that action</h3><p>{error}</p><button className="retry-button" onClick={loadIndex}><RefreshCw size={15}/> Retry</button></div>}
        {loading && !error && <div className="message-panel"><div className="loader"/><p>Loading your saved visual index…</p></div>}
        {!loading && !connected && !error && <div className="message-panel"><p>Connect Drive to start visual scanning.</p></div>}
        {!loading && connected && images.length === 0 && !scanning && <div className="message-panel"><div className="message-icon"><ScanSearch size={23}/></div><h3>Your visual index is waiting</h3><p>Click Scan Drive. AI will inspect each image and suggest a descriptive filename. Nothing is renamed until you approve it.</p></div>}
        {scanning && <div className="message-panel"><div className="loader"/><p>Gemini is analysing image pixels. Keep this tab open; large folders take longer.</p></div>}
        {!loading && !scanning && images.length > 0 && filtered.length === 0 && <div className="message-panel"><div className="message-icon"><Search size={22}/></div><h3>No matching poses</h3><p>Try another search term.</p><button className="retry-button" onClick={() => setQuery("")}>Show all poses</button></div>}
        {!loading && !scanning && filtered.length > 0 && (
          <><div className="results-line"><span>{filtered.length} MATCHING IMAGES</span><span>VISUAL + FILENAME SEARCH</span></div><div className="image-grid">
            {filtered.map((image) => <button className="image-card" key={image.id} onClick={() => setSelected(image)}><div className="image-frame"><img src={imageUrl(image.id)} alt={image.description || image.pose} loading="lazy"/><span className="preview-label">PREVIEW ↗</span></div><div className="image-meta"><span className="file-icon"><ImageIcon size={14}/></span><span className="file-name" title={image.name}>{image.name}</span></div><p className="pose-description">{image.description}</p><div className="pose-tags">{(image.labels || []).slice(0,4).map((label) => <span key={label}>{label}</span>)}</div></button>)}
          </div></>
        )}
      </section>
      <footer className="footer"><span>SKILL MAXXING <span className="footer-muted">· AI POSE FINDER</span></span><a href="https://drive.google.com/drive/folders/1jvgXybzg6NObxAQqaAgHVUUe85F7A2mH" target="_blank" rel="noreferrer">OPEN DRIVE FOLDER <ExternalLink size={12}/></a></footer>
      {showPreview && <div className="modal-backdrop" onClick={() => setShowPreview(false)} role="presentation"><section className="preview-modal rename-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Bulk rename preview"><div className="modal-header"><div><span className="section-kicker">BULK RENAME · REVIEW FIRST</span><h3>Proposed Google Drive filenames ({preview.length})</h3></div><button className="modal-close" onClick={() => setShowPreview(false)} aria-label="Close"><X size={20}/></button></div><p className="modal-description">Check the suggested names. Your original names are preserved in the undo history. Nothing changes in Drive until you click Rename all.</p><div className="rename-list">{preview.map((item) => <div className="rename-row" key={item.id}><div><span className="old-name">{item.currentName}</span><span className="new-name">{item.proposedName}</span><span className="rename-pose">{item.pose}</span></div></div>)}</div><div className="modal-actions"><button className="download-button" onClick={applyRename} disabled={renaming}><Pencil size={16}/>{renaming ? "Renaming…" : `Rename all ${preview.length} files`}</button><button className="open-drive-button" onClick={() => setShowPreview(false)}>Cancel</button></div></section></div>}
      {selected && <div className="modal-backdrop" onClick={() => setSelected(null)} role="presentation"><section className="preview-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Image preview"><div className="modal-header"><div><span className="section-kicker">AI RECOGNISED POSE</span><h3>{selected.pose}</h3></div><button className="modal-close" onClick={() => setSelected(null)} aria-label="Close"><X size={20}/></button></div><div className="modal-image"><img src={imageUrl(selected.id)} alt={selected.description || selected.pose}/></div><p className="modal-description">{selected.description}</p><div className="modal-actions"><a className="download-button" href={selected.webViewLink} target="_blank" rel="noreferrer"><Download size={16}/> Open original in Drive</a><a className="open-drive-button" href={selected.webViewLink} target="_blank" rel="noreferrer">Open in Drive <ExternalLink size={14}/></a></div></section></div>}
    </main>
  );
}
export default App;
