// POST /api/upload: analyze one uploaded resume and rank it against the stored pile
import { readText } from "../../../lib/read.mjs";
import { analyze } from "../../../lib/engine.mjs";
import model from "../../../data/model.json";
import results from "../../../data/results.json";

export const runtime = "nodejs";

export async function POST(req) {
  const file = (await req.formData()).get("file");
  if (!file) {
    return Response.json({ error: "No file received" }, { status: 400 });
  }

  const text = await readText(Buffer.from(await file.arrayBuffer()), file.name);
  const result = { name: file.name, uploaded: true, ...analyze(text, model.idf, model.jds) };

  // Rank = 1 + number of existing resumes with a strictly higher score
  result.ranks = {};
  for (const role of ["lca", "ux"]) {
    result.ranks[role] = 1 + results.filter((x) => x.roles[role].score > result.roles[role].score).length;
  }

  return Response.json({ result, total: results.length });
}