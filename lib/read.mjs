// Reads a .docx or .pdf file buffer and returns plain text.
// Returns "" on failure so the engine can flag the file as unreadable.
import mammoth from "mammoth";
import pdf from "pdf-parse/lib/pdf-parse.js";

export async function readText(buffer, name) {
  try {
    if (/\.docx$/i.test(name)) {
      return (await mammoth.extractRawText({ buffer })).value;
    }
    if (/\.pdf$/i.test(name)) {
      return (await pdf(buffer)).text;
    }
  } catch (e) {
    // fall through: unreadable file
  }
  return "";
}
