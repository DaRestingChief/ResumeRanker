// Run with: npm run precompute
// Reads every resume in /resumes, scores it, and writes data/results.json + data/model.json
import fs from "fs";
import path from "path";
import { readText } from "../lib/read.mjs";
import { analyze, buildIdf } from "../lib/engine.mjs";

const dir = "resumes";
const jds = {
  lca: fs.readFileSync("data/jd_lca.txt", "utf8"),
  ux: fs.readFileSync("data/jd_ux.txt", "utf8"),
};

const files = fs.readdirSync(dir).filter((f) => /\.(docx|pdf)$/i.test(f));

// 1. Extract text from every resume
const texts = {};
for (const f of files) {
  texts[f] = await readText(fs.readFileSync(path.join(dir, f)), f);
}

// 2. Build the TF-IDF vocabulary from all resumes + both JDs
const idf = buildIdf([...Object.values(texts), jds.lca, jds.ux]);

// 3. Analyze each resume and copy the source file so it can be linked
fs.mkdirSync("public/resumes", { recursive: true });
const results = files.map((f) => {
  fs.copyFileSync(path.join(dir, f), path.join("public/resumes", f));
  return { name: f, url: "/resumes/" + f, ...analyze(texts[f], idf, jds) };
});

fs.writeFileSync("data/results.json", JSON.stringify(results));
fs.writeFileSync("data/model.json", JSON.stringify({ idf, jds }));

console.log("done", results.length, "resumes;", results.filter((r) => r.flags.length).length, "flagged");
