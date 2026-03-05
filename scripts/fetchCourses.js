require('dotenv').config({
  path: require('path').resolve(__dirname, '../server/.env'),
});
const mongoose = require('mongoose');
const cheerio = require('cheerio');
const { connectDB } = require('../config/db');
const Course = require('../models/Course');

// --- UCLA Schedule of Classes scraper ---
// Scrapes per-quarter course offerings from sa.ucla.edu/ro/Public/SOC
// The public catalog API returns the entire catalog (~16K courses).
// The SOC gives us only courses actually offered in a given term (~4-5K).

const SOC_BASE = 'https://sa.ucla.edu/ro/Public/SOC';
const PAGE_SIZE = 25; // SOC returns 25 courses per page

// --- CLI args ---

function parseTerm() {
  const idx = process.argv.indexOf('--term');
  if (idx === -1 || !process.argv[idx + 1]) {
    console.error('Usage: node scripts/fetchCourses.js --term 26W');
    console.error('       node scripts/fetchCourses.js --term 26W --dry-run');
    console.error('');
    console.error('Term codes: YYQ format (e.g., 26W = Winter 2026, 26S = Spring 2026, 25F = Fall 2025)');
    process.exit(1);
  }
  return process.argv[idx + 1];
}

function isDryRun() {
  return process.argv.includes('--dry-run');
}

// --- Fetching ---

async function fetchSubjectAreas(termCode) {
  // Fetch the SOC Results page to get the subject area dropdown list.
  // The list is embedded in a SearchPanelSetup() call in the HTML.
  const url = `${SOC_BASE}/Results?t=${encodeURIComponent(termCode)}&sBy=subject&subj=COM+SCI`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load SOC page: HTTP ${res.status}`);
  const html = await res.text();

  const startMarker = "SearchPanelSetup('";
  const endMarker = "', 'select_filter_subject'";
  const startIdx = html.indexOf(startMarker);
  const endIdx = html.indexOf(endMarker, startIdx);
  if (startIdx === -1 || endIdx === -1) {
    throw new Error('Could not find subject area list in SOC page');
  }

  const jsonStr = html
    .substring(startIdx + startMarker.length, endIdx)
    .replace(/&quot;/g, '"')
    .replace(/\\u0026/g, '&');

  const subjects = JSON.parse(jsonStr);
  return subjects.map((s) => ({
    label: s.label,
    code: s.value.trim(),
  }));
}

async function fetchCoursePage(subjectArea, termCode, pageNumber) {
  const model = JSON.stringify({
    subj_area_cd: subjectArea,
    search_by: 'Subject',
    term_cd: termCode,
    ActiveEnrollmentFlag: 'n',
    HasData: 'False',
  });

  const params = new URLSearchParams({
    search_by: 'subject',
    model,
    filterFlags: '{}',
    pageNumber: String(pageNumber),
  });

  const url = `${SOC_BASE}/Results/CourseTitlesView?${params}`;
  const res = await fetch(url, {
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function parseCoursesFromHTML(html, subjectArea) {
  const $ = cheerio.load(html);
  const courses = [];

  // Each course is a button with id ending in "-title"
  // Text format: "31 - Introduction to Computer Science I"
  $('button[id$="-title"]').each((_, el) => {
    const text = $(el).text().trim();
    const dashIdx = text.indexOf(' - ');
    if (dashIdx === -1) return;

    const number = text.substring(0, dashIdx).trim();
    const title = text.substring(dashIdx + 3).trim();
    if (!number || !title) return;

    courses.push({ subjectArea, number, title });
  });

  return courses;
}

async function fetchAllCoursesForSubject(subjectArea, termCode) {
  const allCourses = [];
  let pageNumber = 1;

  while (true) {
    const html = await fetchCoursePage(subjectArea, termCode, pageNumber);
    const courses = parseCoursesFromHTML(html, subjectArea);

    if (courses.length === 0) break;
    allCourses.push(...courses);

    // If we got fewer than a full page, there are no more pages
    if (courses.length < PAGE_SIZE) break;
    pageNumber++;
  }

  return allCourses;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Main ---

async function main() {
  const termCode = parseTerm();
  const dryRun = isDryRun();

  if (dryRun) {
    console.log('=== DRY RUN — no database writes ===\n');
  }

  const conn = await connectDB();

  // Step 1: Get subject area list from SOC
  console.log(`Fetching subject areas for term ${termCode}...`);
  const subjects = await fetchSubjectAreas(termCode);
  console.log(`Found ${subjects.length} subject areas\n`);

  // Step 2: Scrape courses for each subject area
  let totalFetched = 0;
  let totalUpserted = 0;
  let errorCount = 0;
  const errors = [];

  for (let i = 0; i < subjects.length; i++) {
    const { code } = subjects[i];
    const prefix = `[${String(i + 1).padStart(3)}/${subjects.length}]`;

    try {
      const courses = await fetchAllCoursesForSubject(code, termCode);

      if (courses.length === 0) {
        console.log(`${prefix} ${code} — 0 courses`);
      } else {
        let upserted = 0;
        for (const c of courses) {
          if (!dryRun) {
            await Course.updateOne(
              { subjectArea: c.subjectArea, number: c.number, title: c.title, term: termCode },
              { $setOnInsert: { subjectArea: c.subjectArea, number: c.number, title: c.title, term: termCode } },
              { upsert: true }
            );
          }
          upserted++;
        }
        totalFetched += courses.length;
        totalUpserted += upserted;
        console.log(`${prefix} ${code} — ${courses.length} courses`);
      }
    } catch (err) {
      errorCount++;
      errors.push({ code, message: err.message });
      console.log(`${prefix} ${code} — ERROR: ${err.message}`);
    }

    // Rate limit: 200ms between subject areas
    if (i < subjects.length - 1) await sleep(200);
  }

  // Step 3: Summary
  console.log('\n--- Summary ---');
  console.log(`Term: ${termCode}`);
  console.log(`Subject areas: ${subjects.length}`);
  console.log(`Total courses fetched: ${totalFetched}`);
  if (!dryRun) {
    console.log(`Total courses upserted: ${totalUpserted}`);
  }
  if (errorCount > 0) {
    console.log(`Errors: ${errorCount}`);
    for (const e of errors) {
      console.log(`  - ${e.code}: ${e.message}`);
    }
  }
  if (dryRun) {
    console.log('\n(Dry run — nothing was written to the database)');
  }

  await conn.close();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.connection.close();
  } catch (_) {}
  process.exit(1);
});
