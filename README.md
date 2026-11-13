# Resume Ranker

A small web app that reads resumes (.docx or .pdf), pulls out job-related information, and ranks each resume against two job posts: **LCA Consultant** and **UI/UX Design Intern**. It is built to help a non-technical hiring team review candidates. It supports review and does not make hiring decisions.

Live app: [add Vercel link here]

## What it does

- Reads all 47 supplied resumes and both job descriptions.
- Extracts skills and tools, role-specific keywords, jobs with dates, years of experience, education, and a link back to the original file.
- Classifies each resume as **LCA**, **UI/UX**, **Both**, or **Uncertain**.
- Ranks resumes separately for each role with a 0 to 100 score and a plain-English explanation.
- Lets a reviewer search, filter by fit, sort by score or relevant experience, show only resumes with notes(lets a reviewer jump straight to resumes that have been flagged with a warning symbol(for having no dated jobs, unreadable file etc.))
- Open a candidate's score breakdown, and download the ranked list as CSV.
- Lets a reviewer upload a new resume(in either .docx or .pdf format) and see where it ranks among the existing resumes.

## How it works

1. **Read the file.** `mammoth` for .docx, `pdf-parse` for .pdf. An empty or unreadable file is flagged, not silently scored.
2. **Split into sections** (Experience, Education, Projects, Core Skills).
3. **Read job dates** in four formats (`Mar 2022 - Present`, `09/2024 - Current`, `Jan - April 2026`, `2016 - 2019`). Overlapping jobs are merged so years are not counted twice. Year-only dates assume mid-year.
4. **Match keywords** from a dictionary of LCA and UI/UX terms, tools and synonyms (for example "LCA" and "life cycle assessment" count as one term).
5. **Score** each resume for each role, then **classify** it.

 It uses rules plus TF-IDF similarity, so every score can be explained. No AI model runs inside the app.

## Scoring

| Part | LCA Consultant | UI/UX Intern |
|---|---|---|
| Skills and tools | 30 | 35 |
| Relevant experience | 30 | 20 |
| Wording similarity to the job post (TF-IDF cosine) | 20 | 25 |
| Education | 10 | 10 |
| Job title | 10 | 10 |

- **Skills.** For LCA, GaBi and SimaPro (named in the job post) earn full credit and other LCA software earns 0.75. LCA terms found only in a skills list, not in work or projects, count half, because the job requires hands-on work. UI/UX gets full credit for any listed tool, since freshers are welcome.
- **Experience.** Years in jobs that mention role terms. LCA reaches full marks at 2 years. UI/UX starts at 0.3 for a fresher and grows with relevant years.
- **Education.** Field match is full credit. For LCA any other bachelor's or master's earns 0.6, because the job post accepts any degree.
- **Classification.** A resume is marked Uncertain if its best score is under 30 (an LCA score without hands-on evidence is capped at 29, so just listing LCA in skills doesn't mean the resume is LCA since the role requires experience). Both if there is hands-on evidence for both roles and each scores at least 40. Otherwise the higher role.

The job post for LCA says 2-3 years of experience, while the assignment brief says 4-6 years. I scored on the job post (full marks from 2 years) and treated the brief's range as the preferred end.

## Notes shown to reviewers

Unreadable file, no dated jobs found, future end date, text claiming different years than the dates give, implausible education year, and LCA terms listed only in skills.

## Data cleaning and validation

I started off with a naive scorer which was actually perfroming averagely with a few misclassifications into Uncertain class. Hence, to get an appropriate starting point, I used Claude to write the second version of the extractor and scorer. Naturally, its output could not be trusted as it was. It was checked in rounds: the extracted fields and scores for all 47 resumes were reviewed, each mismatch was traced to a cause, and the scoring scheme was further corrected. The main problems which I found and fixed:

- Dates written as `09/2024 - Current`, `Jan - April 2026` or `2016 - 2019` were not read, so some candidates got 0 years of experience (for example NP-325 and SS-484). All three formats are now supported.
- LCA terms that appeared only in a skills list pushed several non-LCA resumes into the LCA class (AA-144, AK-184, RS-414, VG-531). A term now counts fully only when it appears in work or projects(as relevant work experience with the skill is important).
- Overlapping jobs were double counted. Date ranges are now merged. For example AK-184 held two roles at IIT Tirupati in the same period (Dec 2022 to Dec 2023). Adding each job’s length would count that year twice, giving 24 months. Merging the dates counts it once, giving 12 months
- A degree in an environmental field plus a headline containing "environment" gave about 20 free points. Headline credit was narrowed.
- The skills-list rule also lowered real designers' scores, so it now applies to the LCA role only.
- A resume with 5 months of experience ranked above one with 3.9 years, so experience now carries 30% of the LCA score.
- The "Both" rule needed two scores within 15 points, which almost never happens. It now needs hands-on evidence for both roles.
- A second degree was cut off in the education summary.
- A blank resume file in the supplied pile is flagged as unreadable instead of being scored silently.
- The anonymizer removed ISO standard numbers, so standards cannot be matched. For example “ISO 14040” appears as “ISO /” (as in TM-495).

How it was checked:

- I hand labelled the 47 resumes because I did not want to blindly believe Claude. Results were compared with labels (LCA, UI/UX, Both, Uncertain) that Claude wrote after reading each resume. The first run agreed on 42 of 47. After understanding the intricacies and suggesting the fixes it agrees on 47 of 47. One label was wrong (UI-506 does real LCA work) and was corrected. The same 47 resumes were used to tune the rules.
- I ran the app and uploaded four made-up test resumes (a strong LCA profile, a hybrid, a blank file and an unrelated resume). They came out as LCA, Both, Uncertain and Uncertain. So, it seemed to be working out.
- I compared some resumes with the app to look for discrepancies. For e.g: I compared NP-325 against its original file and confirmed that its second degree was missing from the app. This is now fixed.
- **Other resumes checked and their logs are in a separate file spot_check.xlsx**
- **Every error found and fixed is in cleaning_log.xlsx**
- No individual resume's data was edited by hand. All corrections were made in the code.

## Known limitations

- Keyword-based: it does not understand meaning, so unusual wording can be missed.
- Tuned and checked on the same 47 resumes, with no independent test set. Treat accuracy figures as a sanity check.
- None of the 47 resumes is a true "Both", so that rule is tested only on a made-up resume.
- Resumes with unusual layouts, multiple columns or scanned pages may extract badly. Scanned PDFs show an unreadable-file note.
- The anonymizer removed ISO numbers, so standards such as ISO 14040 cannot be matched.
- Job dates must be written in one of the four supported formats. Freshers with no dated jobs get 0 experience points.
- Scores come from keywords and degree fields and could disadvantage unusual backgrounds. A human should ultimately review all results.
- Uploaded resumes are shown only during the visit and are not saved.

## AI assistance

Claude wrote the code, the keyword lists, the second scoring weights to improve the scoring, the four test resumes and the labels used for checking. I reviewed the results, found the reason for improper classification for some resumes, manually checked for any fields missed by the app which are actually present in the anonymised resumes, and decided which changes to keep. As mentioned before, the app, uses fixed rules and TF-IDF similarity. No AI model is used.



## Run it locally

```
npm install
npm run precompute   # reads /resumes, writes data/results.json
npm run dev          # http://localhost:3000
```

Put resumes in `resumes/` first. The app is deployed on Vercel from the precomputed `data/results.json` and `public/resumes/`.

## Project layout

- `lib/engine.mjs`: extraction, scoring and classification
- `lib/read.mjs`: .docx and .pdf reader
- `scripts/precompute.mjs`: scores the supplied resumes
- `app/page.js`, `app/globals.css`: the review interface
- `app/api/upload/route.js`: scores and ranks an uploaded resume
