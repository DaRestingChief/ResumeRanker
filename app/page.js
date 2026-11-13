"use client";
 
import { useMemo, useRef, useState } from "react";
import base from "../data/results.json";
 
const ROLES = {
  lca: { name: "LCA Consultant", color: "var(--lca)" },
  ux: { name: "UI/UX Intern", color: "var(--ux)" },
};
 
// Maximum points each part can contribute, per role (matches the weights in engine.mjs)
const MAX = {
  lca: { skills: 30, tfidf: 20, experience: 30, education: 10, headline: 10 },
  ux: { skills: 35, tfidf: 25, experience: 20, education: 10, headline: 10 },
};
 
const PART_LABEL = {
  skills: "Skills and tools",
  tfidf: "Wording similar to the job post",
  experience: "Relevant experience",
  education: "Education",
  headline: "Job title",
};
 
const FIT_STYLE = { LCA: "lca", "UI/UX": "ux", both: "both", uncertain: "unsure" };
const FIT_LABEL = { LCA: "LCA", "UI/UX": "UI/UX", both: "Both", uncertain: "Uncertain" };
 
// "anonymized_AA_1793682784144.docx" becomes "Candidate AA-144"
function displayName(file) {
  const base = file.replace(/\.(docx|pdf)$/i, "").replace(/^anonymized_/, "");
  const m = base.match(/^([A-Za-z]+)_(\d{10,})$/);
  return m ? `Candidate ${m[1].toUpperCase()}-${m[2].slice(-3)}` : base.replace(/_/g, " ");
}
 
// One plain-English sentence on why a role score looks the way it does
function explain(r, role) {
  const s = r.roles[role];
  const bits = [];
  if (s.evidence.tools.length) {
    bits.push(`${s.evidence.tools.join(", ")} ${s.demonstrated ? "used in work or projects" : "only listed in skills"}`);
  }
  if (s.evidence.core.length) bits.push(`${s.evidence.core.length} role terms matched`);
  bits.push(s.relYears > 0 ? `${s.relYears} years of relevant experience` : "no dated relevant experience found");
  const text = bits.join("; ") + ".";
  return text.charAt(0).toUpperCase() + text.slice(1);
}
 
export default function Page() {
  const [rows, setRows] = useState(base);
  const [role, setRole] = useState("lca");
  const [sort, setSort] = useState("score");
  const [fit, setFit] = useState("all");
  const [query, setQuery] = useState("");
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [selName, setSelName] = useState(null);
 
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [stage, setStage] = useState("");
  const [notice, setNotice] = useState(null);
  const fileInput = useRef(null);
 
  // ---------- Upload with a progress bar ----------
  function upload() {
    if (!file) return;
    setBusy(true);
    setPct(0);
    setStage("Uploading file");
    setNotice(null);
 
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
 
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setPct(Math.round((e.loaded / e.total) * 60));
    };
    xhr.upload.onload = () => {
      setStage("Reading and scoring the resume");
      setPct(85);
    };
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (!data.result) throw new Error(data.error || "No result returned");
        setPct(100);
        setStage("Done");
        setRows((prev) => [data.result, ...prev]);
        setSelName(data.result.name);
        setNotice({
          text: `${displayName(data.result.name)} ranks #${data.result.ranks.lca} for LCA Consultant and #${data.result.ranks.ux} for UI/UX Intern, out of ${data.total + 1} resumes.`,
        });
      } catch (err) {
        setNotice({ text: `Upload failed: ${err.message}. Try a .docx or .pdf file.`, error: true });
      }
      setBusy(false);
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
    };
    xhr.onerror = () => {
      setBusy(false);
      setNotice({ text: "Upload failed: could not reach the server. Check your connection and try again.", error: true });
    };
 
    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  }
 
  // ---------- Filtering, sorting, ranking ----------
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((r) => fit === "all" || r.label === fit)
      .filter((r) => !flaggedOnly || r.flags.length > 0)
      .filter((r) => !q || (displayName(r.name) + " " + r.name).toLowerCase().includes(q))
      .sort((a, b) => {
        const sa = a.roles[role], sb = b.roles[role];
        return sort === "experience"
          ? sb.relYears - sa.relYears || sb.score - sa.score
          : sb.score - sa.score;
      });
  }, [rows, role, sort, fit, query, flaggedOnly]);
 
  // Ties share a rank (1 + number of strictly higher scores), same rule as the upload message
  const rankOf = (r) => 1 + list.filter((x) => x.roles[role].score > r.roles[role].score).length;
 
  const selected = rows.find((r) => r.name === selName) || null;
  // Summary counts cover the original pile only, not resumes uploaded during this visit
  const pile = rows.filter((r) => !r.uploaded);
  const count = (label) => pile.filter((r) => r.label === label).length;
  const needReview = pile.filter((r) => r.flags.length > 0).length;
 
  function exportCsv() {
    const head = ["Rank", "Candidate", "File", "Fit", "Score", "Relevant years", "Notes"];
    const body = list.map((r) => [
      rankOf(r), displayName(r.name), r.name, FIT_LABEL[r.label],
      r.roles[role].score, r.roles[role].relYears, r.flags.join(" | "),
    ]);
    const csv = [head, ...body]
      .map((line) => line.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `ranking-${role === "lca" ? "lca-consultant" : "ui-ux-intern"}.csv`;
    a.click();
  }
 
  const other = role === "lca" ? "ux" : "lca";
 
  return (
    <main className="page">
      <header>
        <h1>Resume review</h1>
        <p className="sub">
          Each resume is scored against the LCA Consultant and UI/UX Intern job posts. Pick a role, then select
          a candidate to see how the score was built.
        </p>
        <p className="summary">
          {pile.length} resumes: {count("LCA")} fit LCA, {count("UI/UX")} fit UI/UX, {count("both")} fit both, and{" "}
          {count("uncertain")} are uncertain. {needReview} have notes that need a closer look.
        </p>
      </header>
 
      {/* Upload */}
      <section className="upload" aria-label="Add a resume">
        <h2>Add a resume</h2>
        <p>Upload a .docx or .pdf to see where it would rank among the current resumes.</p>
        <div className="upload-row">
          <input
            ref={fileInput}
            type="file"
            accept=".pdf,.docx"
            disabled={busy}
            onChange={(e) => setFile(e.target.files[0] || null)}
          />
          <button className="btn" onClick={upload} disabled={!file || busy}>
            {busy ? "Working..." : "Upload and rank"}
          </button>
        </div>
        {busy && (
          <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100">
            <div className="progress-track">
              <div className="progress-fill" style={{ width: pct + "%" }} />
            </div>
            <div className="progress-label">{stage} ({pct}%)</div>
          </div>
        )}
        {notice && <div className={"notice" + (notice.error ? " error" : "")}>{notice.text}</div>}
      </section>
 
      {/* Role tabs */}
      <nav className="tabs" aria-label="Job role">
        {Object.keys(ROLES).map((k) => (
          <button key={k} className={"tab" + (role === k ? " active" : "")} onClick={() => setRole(k)}>
            {ROLES[k].name}
          </button>
        ))}
      </nav>
 
      {/* Filters */}
      <div className="toolbar">
        <input
          type="search"
          placeholder="Search candidates"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search candidates"
        />
        <select value={fit} onChange={(e) => setFit(e.target.value)} aria-label="Filter by fit">
          <option value="all">All fits</option>
          <option value="LCA">LCA</option>
          <option value="UI/UX">UI/UX</option>
          <option value="both">Both</option>
          <option value="uncertain">Uncertain</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort by">
          <option value="score">Sort by score</option>
          <option value="experience">Sort by relevant experience</option>
        </select>
        <label className="check">
          <input type="checkbox" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)} />
          Only resumes with notes
        </label>
        <span className="spacer" />
        <button className="btn ghost" onClick={exportCsv}>Download this list (CSV)</button>
      </div>
 
      <div className="split">
        {/* Ranked table */}
        <table>
          <thead>
            <tr>
              <th className="num">Rank</th>
              <th>Candidate</th>
              <th>Fit</th>
              <th className="num">Score</th>
              <th className="num">Relevant years</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => {
              const s = r.roles[role];
              return (
                <tr
                  key={r.name}
                  className={selName === r.name ? "selected" : ""}
                  tabIndex={0}
                  onClick={() => setSelName(r.name)}
                  onKeyDown={(e) => e.key === "Enter" && setSelName(r.name)}
                >
                  <td className="num">{rankOf(r)}</td>
                  <td>{displayName(r.name)}{r.uploaded ? " (uploaded)" : ""}</td>
                  <td><span className={"pill " + FIT_STYLE[r.label]}>{FIT_LABEL[r.label]}</span></td>
                  <td className="num">
                    <span className="score-cell">
                      <span className="mini-bar"><span style={{ width: s.score + "%", background: ROLES[role].color }} /></span>
                      {s.score}
                    </span>
                  </td>
                  <td className="num">{s.relYears}</td>
                  <td>{r.flags.length ? <span className="flag">{r.flags.length} to check</span> : ""}</td>
                </tr>
              );
            })}
            {!list.length && (
              <tr><td colSpan="6" className="empty">No resumes match these filters. Clear the search or filters to see everyone.</td></tr>
            )}
          </tbody>
        </table>
 
        {/* Candidate detail */}
        <aside className="detail" aria-live="polite">
          {!selected ? (
            <p className="muted">Select a candidate to see how their score was built.</p>
          ) : (
            <>
              <h2>{displayName(selected.name)}</h2>
              <div className="file">
                {selected.name}
                {selected.url && (
                  <> {" "}<a href={selected.url} target="_blank" rel="noreferrer">Open original resume</a></>
                )}
              </div>
              <span className={"pill " + FIT_STYLE[selected.label]}>{FIT_LABEL[selected.label]}</span>
              <p className="muted">
                {selected.totalYears} years of experience in total (overlapping jobs counted once), {selected.jobsParsed} dated jobs found.
              </p>
 
              {selected.flags.length > 0 && (
                <>
                  <h3>Check this resume</h3>
                  {selected.flags.map((f) => <div className="problem" key={f}>{f}</div>)}
                </>
              )}
 
              <h3>{ROLES[role].name}: {selected.roles[role].score} out of 100</h3>
              <p>{explain(selected, role)}</p>
              {Object.entries(selected.roles[role].parts).map(([k, v]) => (
                <div className="part" key={k}>
                  <div className="part-head"><span>{PART_LABEL[k]}</span><span>{v} / {MAX[role][k]}</span></div>
                  <div className="part-track"><div className="part-fill" style={{ width: (v / MAX[role][k]) * 100 + "%" }} /></div>
                </div>
              ))}
 
              <h3>Matched in the resume</h3>
              <div className="chips">
                {selected.roles[role].evidence.tools.map((t) => <span className="chip tool" key={t}>{t}</span>)}
                {selected.roles[role].evidence.core.map((t) => <span className="chip" key={t}>{t}</span>)}
                {selected.roles[role].evidence.related.map((t) => <span className="chip" key={t}>{t}</span>)}
                {!selected.roles[role].evidence.tools.length &&
                  !selected.roles[role].evidence.core.length &&
                  !selected.roles[role].evidence.related.length && <span className="muted">Nothing matched for this role.</span>}
              </div>
 
              <h3>{ROLES[other].name}</h3>
              <p className="muted">{selected.roles[other].score} out of 100. {explain(selected, other)}</p>
 
              <h3>Education</h3>
              <p className="muted">{selected.education || "Not found in this resume."}</p>
              <h3>Skills listed</h3>
              <p className="muted">{selected.skillsText || "Not found in this resume."}</p>
            </>
          )}
        </aside>
      </div>
    </main>
  );
}
 