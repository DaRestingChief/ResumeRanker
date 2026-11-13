// ============================================================
// Resume analysis engine: extraction, scoring, classification
// ============================================================

const MONTHS = "jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec";
const MON = `(?:${MONTHS})[a-z]*\\.?`;
const NOW_WORDS = "present|current|now";
const JD_TOOLS = ["gabi", "simapro"]; // LCA software named in the job description
const BOTH_MIN = 40; // each role needs at least this score, with hands-on evidence, to count as "both"

// ------------------------------------------------------------
// Keyword dictionary. Each canonical term has a list of aliases.
// ------------------------------------------------------------
export const T = {
  lca: {
    core: {
      "life cycle assessment": ["life cycle assessment", "life cycle analysis", "life-cycle assessment", "lca"],
      "life cycle inventory": ["life cycle inventory", "lci"],
      "epd": ["epd", "environmental product declaration"],
      "cradle-to-gate": ["cradle-to-gate", "cradle to gate"],
      "product carbon footprint": ["carbon footprint of products", "product carbon footprint"],
      "iso 14040": ["iso 14040", "iso 14044"],
    },
    tools: {
      "gabi": ["gabi"],
      "simapro": ["simapro"],
      "openlca": ["openlca"],
      "air.e": ["air.e"],
      "one click lca": ["one click lca"],
    },
    related: {
      "emission inventory": ["emission inventory"],
      "ghg": ["ghg", "greenhouse gas"],
      "carbon accounting": ["carbon accounting"],
      "sustainability": ["sustainability"],
      "esg": ["esg"],
      "data validation": ["data validation", "validated"],
      "benchmarking": ["benchmarking"],
    },
    edu: ["environment", "civil", "chemical", "sustainab", "energy"],
    // Headline credit only for LCA or sustainability titles (not generic ESG/environment)
    head: /lca|life cycle|sustainab/i,
  },
  ux: {
    core: {
      "user research": ["user research"],
      "wireframing": ["wireframe", "wireframes", "wireframing"],
      "prototyping": ["prototype", "prototypes", "prototyping"],
      "usability testing": ["usability testing"],
      "user flow": ["user flow", "user flows"],
      "information architecture": ["information architecture"],
      "design thinking": ["design thinking"],
      "ui/ux": ["ui/ux", "ux design", "ui design"],
      "user-centered": ["user-centered", "user-centric", "human-centered"],
    },
    tools: {
      "figma": ["figma"],
      "adobe xd": ["adobe xd"],
      "framer": ["framer"],
      "sketch": ["sketch app"],
    },
    related: {
      "visual hierarchy": ["visual hierarchy"],
      "typography": ["typography"],
      "accessibility": ["accessibility", "wcag"],
      "interaction design": ["interaction design"],
      "mockup": ["mockup", "mockups"],
      "graphic design": ["graphic design"],
    },
    edu: ["design", "hci", "human computer", "computer science", "communication", "multimedia"],
    head: /design|ux|ui\b/i,
  },
};

// ------------------------------------------------------------
// Keyword matching
// ------------------------------------------------------------
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&");

// Returns the canonical terms (from group g) that appear in text t
function hits(t, g) {
  return Object.keys(g).filter((canonical) =>
    g[canonical].some((alias) =>
      new RegExp("(^|[^a-z])" + escapeRegex(alias) + "($|[^a-z])", "i").test(t)
    )
  );
}

// ------------------------------------------------------------
// TF-IDF similarity (unigrams + bigrams)
// ------------------------------------------------------------
function tokenize(text) {
  const words = text.toLowerCase().match(/[a-z][a-z0-9+#]+/g) || [];
  const tokens = [...words];
  for (let i = 0; i < words.length - 1; i++) {
    tokens.push(words[i] + "_" + words[i + 1]);
  }
  return tokens;
}

export function buildIdf(docs) {
  const docFreq = {};
  docs.forEach((d) => {
    new Set(tokenize(d)).forEach((k) => {
      docFreq[k] = (docFreq[k] || 0) + 1;
    });
  });

  const idf = {};
  for (const k in docFreq) {
    if (docFreq[k] > 1) {
      idf[k] = +(Math.log((1 + docs.length) / (1 + docFreq[k])) + 1).toFixed(3);
    }
  }
  return idf;
}

function toVector(text, idf) {
  const freq = {};
  tokenize(text).forEach((t) => {
    freq[t] = (freq[t] || 0) + 1;
  });

  const vec = {};
  let norm = 0;
  for (const k in freq) {
    const w = (1 + Math.log(freq[k])) * (idf[k] || 4); // 4 = default weight for unseen terms
    vec[k] = w;
    norm += w * w;
  }
  norm = Math.sqrt(norm) || 1;
  for (const k in vec) vec[k] /= norm;
  return vec;
}

function cosine(a, b) {
  let sum = 0;
  for (const k in a) {
    if (b[k]) sum += a[k] * b[k];
  }
  return sum;
}

// ------------------------------------------------------------
// Section splitting (Experience, Education, Core Skills, ...)
// ------------------------------------------------------------
function splitSections(text) {
  const sections = { head: [] };
  let current = "head";

  for (const line of text.split(/\n+/)) {
    const t = line.trim();
    const heading =
      t.length < 40 &&
      t.match(/^(experience|education|projects?|certifications?|professional|core|skills|tools|languages|awards)\b/i);

    if (heading) {
      current = heading[1].toLowerCase();
      sections[current] = [];
    } else {
      (sections[current] = sections[current] || []).push(t);
    }
  }

  for (const k in sections) sections[k] = sections[k].join("\n");
  return sections;
}

// ------------------------------------------------------------
// Job date parsing. Supported formats:
//   "Mar 2022 – Present", "Dec 2022 – Dec 2023"
//   "09/2024 – Current", "10/2023 – 01/2024"
//   "Jan – April 2026" (shared year)
// ------------------------------------------------------------
const today = new Date();
const NOW = today.getFullYear() * 12 + today.getMonth();
const monthIndex = (m) => MONTHS.split("|").indexOf(m.slice(0, 3).toLowerCase());

function parseJobs(experience) {
  const found = [];
  let m;

  // Format 1: Mon YYYY – (Mon )YYYY | Present
  const p1 = new RegExp(`(${MON})\\s+(\\d{4})\\s*[–-]\\s*(?:(${NOW_WORDS})|(?:(${MON})\\s+)?(\\d{4}))`, "gi");
  while ((m = p1.exec(experience))) {
    const start = +m[2] * 12 + monthIndex(m[1]);
    const end = m[3] ? NOW : +m[5] * 12 + (m[4] ? monthIndex(m[4]) : 11);
    found.push({ index: m.index, len: m[0].length, start, end });
  }

  // Format 2: MM/YYYY – MM/YYYY | Present
  const p2 = new RegExp(`(\\d{1,2})\\/(\\d{4})\\s*[–-]\\s*(?:(${NOW_WORDS})|(\\d{1,2})\\/(\\d{4}))`, "gi");
  while ((m = p2.exec(experience))) {
    const start = +m[2] * 12 + (+m[1] - 1);
    const end = m[3] ? NOW : +m[5] * 12 + (+m[4] - 1);
    found.push({ index: m.index, len: m[0].length, start, end });
  }

  // Format 3: Mon – Mon YYYY (both months share the year)
  const p3 = new RegExp(`(${MON})\\s*[–-]\\s*(${MON})\\s+(\\d{4})`, "gi");
  while ((m = p3.exec(experience))) {
    found.push({
      index: m.index,
      len: m[0].length,
      start: +m[3] * 12 + monthIndex(m[1]),
      end: +m[3] * 12 + monthIndex(m[2]),
    });
  }

  // Format 4: YYYY – YYYY or YYYY – Present (year only). Mid-year is assumed,
  // so "2016 - 2019" counts as 3 years. Skipped when a dated format already matched there.
  const p4 = new RegExp(`(\\d{4})\\s*[–-]\\s*(?:(${NOW_WORDS})|(\\d{4}))`, "gi");
  while ((m = p4.exec(experience))) {
    const inside = found.some((j) => m.index >= j.index && m.index < j.index + j.len);
    if (inside) continue;
    found.push({
      index: m.index,
      len: m[0].length,
      start: +m[1] * 12 + 6,
      end: m[2] ? NOW : +m[3] * 12 + 6,
    });
  }

  found.sort((a, b) => a.index - b.index);

  // Each job's text runs from its date to the next job's date
  return found.map((j, k) => ({
    start: j.start,
    end: Math.min(j.end, NOW),
    futureEnd: j.end > NOW,
    text: experience.slice(j.index, found[k + 1] ? found[k + 1].index : undefined),
  }));
}

// Total years across ranges, merging overlaps so nothing is double counted
function mergedYears(ranges) {
  const sorted = ranges.filter((r) => r[1] >= r[0]).sort((a, b) => a[0] - b[0]);
  let total = 0;
  let end = -1e9;
  for (const [s, e] of sorted) {
    if (e > end) {
      total += e - Math.max(s, end);
      end = e;
    }
  }
  return total / 12;
}

// ------------------------------------------------------------
// Main analysis: one resume -> scores, label, evidence, flags
// ------------------------------------------------------------
export function analyze(text, idf, jds) {
  text = text || "";
  const flags = [];

  if (text.trim().length < 200) {
    flags.push("Little or no text extracted (scanned/corrupt file?). Scores unreliable.");
  }

  const sec = splitSections(text);
  const jobs = parseJobs(sec.experience || "");
  const workText = (sec.experience || "") + "\n" + (sec.projects || "");

  if (!jobs.length) flags.push("No dated jobs found (may be a fresher or an unusual date format). Experience scored as 0.");
  if (jobs.some((j) => j.futureEnd)) flags.push("A job end date is in the future; it was clipped to today.");

  const totalYears = mergedYears(jobs.map((j) => [j.start, j.end]));

  const claimed = (text.match(/(\d+)\+?\s*years?/i) || [])[1];
  if (claimed && jobs.length && Math.abs(claimed - totalYears) > 1.5) {
    flags.push(`Text claims ${claimed} yrs, dates give ${totalYears.toFixed(1)} (overlaps merged)`);
  }

  const futureEdu = ((sec.education || "").match(/\b20\d\d\b/g) || []).some((y) => +y > today.getFullYear() + 5);
  if (futureEdu) flags.push("Education has an implausible future year (typo?)");

  const roles = {};

  for (const r of ["lca", "ux"]) {
    const g = T[r];

    // Evidence anywhere in the resume vs. evidence in work/projects only
    const toolsAll = hits(text, g.tools);
    const coreAll = hits(text, g.core);
    const related = hits(text, g.related);
    const toolsWork = hits(workText, g.tools);
    const coreWork = hits(workText, g.core);

    // Years of experience in jobs that mention role terms
    const relevantJobs = jobs.filter((j) => hits(j.text, g.core).length || hits(j.text, g.tools).length);
    const relYears = mergedYears(relevantJobs.map((j) => [j.start, j.end]));

    // "Demonstrated" = used in work or projects, not just listed in skills
    const demonstrated = toolsWork.length > 0 || coreWork.length > 0;

    // LCA only: terms found outside work/projects (e.g. a skills list) count half,
    // because the JD requires hands-on LCA work. UI/UX gets full credit (freshers welcome).
    const unlistedCredit = r === "lca" ? 0.5 : 1;

    // LCA tool tiers: the JD's named tools (GaBi, SimaPro) get full credit; other
    // recognised LCA software (OpenLCA, One Click LCA, Air.e) gets 0.75. UI/UX: any tool = 1.
    const toolStrength = (list) =>
      !list.length ? 0 : r !== "lca" || list.some((t) => JD_TOOLS.includes(t)) ? 1 : 0.75;
    const toolCredit = toolsWork.length
      ? toolStrength(toolsWork)
      : toolsAll.length
      ? unlistedCredit * toolStrength(toolsAll)
      : 0;
    const coreCredit = coreWork.length + unlistedCredit * (coreAll.length - coreWork.length);

    const skill = Math.min(
      1,
      0.4 * toolCredit + 0.45 * Math.min(coreCredit / 4, 1) + 0.15 * Math.min(related.length / 4, 1)
    );
    const exp = r === "lca" ? Math.min(relYears / 2, 1) : Math.min(1, 0.3 + relYears * 0.7);
    // Education: field match = 1. For LCA the JD accepts any Bachelor's/Master's
    // (environmental "highly desired"), so another degree earns 0.6; no degree = 0.3.
    const eduText = (sec.education || "").toLowerCase();
    const hasDegree = /b\.?\s?tech|b\.?\s?e\b|bachelor|master|m\.?\s?tech|m\.?\s?sc|b\.?\s?sc|mba|ph\.?d/.test(eduText);
    const otherDegree = r === "lca" && hasDegree ? 0.6 : 0.3;
    const edu = g.edu.some((w) => eduText.includes(w)) ? 1 : otherDegree;
    const head = g.head.test((sec.head || "").slice(0, 200)) ? 1 : 0;
    const sim = Math.min(1, cosine(toVector(text, idf), toVector(jds[r] || "", idf)) / 0.3);

    // Weighted score out of 100. The LCA JD stresses years of experience and hands-on
    // projects, so experience weighs more there.
    const W = r === "lca"
      ? { skills: 0.3, tfidf: 0.2, experience: 0.3, education: 0.1, headline: 0.1 }
      : { skills: 0.35, tfidf: 0.25, experience: 0.2, education: 0.1, headline: 0.1 };
    const parts = {
      skills: W.skills * skill,
      tfidf: W.tfidf * sim,
      experience: W.experience * exp,
      education: W.education * edu,
      headline: W.headline * head,
    };
    const score = 100 * Object.values(parts).reduce((a, b) => a + b, 0);

    if (r === "lca" && !demonstrated && (toolsAll.length || coreAll.length)) {
      flags.push("LCA terms/tools appear only in the skills list, not in work or projects. Not counted as hands-on.");
    }

    roles[r] = {
      score: +score.toFixed(1),
      parts: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, +(v * 100).toFixed(1)])),
      relYears: +relYears.toFixed(1),
      demonstrated,
      evidence: { tools: toolsAll, core: coreAll, related },
    };
  }

  // ----------------------------------------------------------
  // Classification
  // LCA that is never demonstrated in work is capped below the
  // uncertain cutoff, since the JD requires hands-on LCA work.
  // ----------------------------------------------------------
  const lcaScore = roles.lca.demonstrated ? roles.lca.score : Math.min(roles.lca.score, 29);
  const uxScore = roles.ux.score;

  let label;
  if (Math.max(lcaScore, uxScore) < 30) label = "uncertain";
  else if (
    roles.lca.demonstrated && roles.ux.demonstrated &&
    roles.lca.score >= BOTH_MIN && roles.ux.score >= BOTH_MIN
  ) label = "both"; // hands-on evidence for both roles, not just a close score
  else label = lcaScore > uxScore ? "LCA" : "UI/UX";

  return {
    label,
    totalYears: +totalYears.toFixed(1),
    jobsParsed: jobs.length,
    roles,
    flags,
    education: (sec.education || "").split("\n").slice(0, 6).join(" | "),
    skillsText: (sec.core || "").slice(0, 400),
  };
}
