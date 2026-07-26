#!/usr/bin/env node
/**
 * Daily SEO article generator for sunnygh.com
 *
 * Pulls the next "pending" row from content/seo/keywords.csv, generates a
 * long-form article via the Claude API in Sunny FM's devotional voice,
 * naturally links 2-3 relevant existing articles for internal SEO, writes
 * it as a Decap-CMS-compatible markdown file into content/news or
 * content/lifestyle, and marks the keyword row as "done".
 *
 * Requires: ANTHROPIC_API_KEY env var (set as a GitHub Actions secret)
 * Node 18+ (uses global fetch)
 */

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");
const KEYWORDS_PATH = path.join(REPO_ROOT, "content/seo/keywords.csv");

const NEWS_TAGS = ["Community", "Church", "Events", "Announcements", "National", "Ministry"];
const LIFESTYLE_CATEGORIES = [
  "Faith & Family",
  "Health & Wellness",
  "Relationships",
  "Parenting",
  "Personal Growth",
  "Work & Career",
];

function parseCsvLine(line) {
  // Minimal CSV parser that handles one quoted field (tags_or_category)
  const result = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

function readKeywords() {
  const raw = fs.readFileSync(KEYWORDS_PATH, "utf8");
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  const header = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const cols = parseCsvLine(line);
    const row = {};
    header.forEach((h, i) => (row[h.trim()] = (cols[i] || "").trim()));
    return row;
  });
  return { header, rows, rawLines: lines };
}

function writeKeywordsCsv(header, rows) {
  const lines = [header.join(",")];
  for (const row of rows) {
    const tagsField = row.tags_or_category.includes(",")
      ? `"${row.tags_or_category}"`
      : row.tags_or_category;
    lines.push([row.status, row.collection, row.keyword, row.angle, tagsField].join(","));
  }
  fs.writeFileSync(KEYWORDS_PATH, lines.join("\n") + "\n", "utf8");
}

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

function yamlSingleQuote(str) {
  // YAML single-quoted scalar: escape ' as ''
  return `'${String(str).replace(/'/g, "''")}'`;
}

function yamlFoldedText(str) {
  // Keep it simple: single-quoted, works fine for summary-length text
  return yamlSingleQuote(str.replace(/\n/g, " ").trim());
}

function slugFromFilename(filename) {
  // mirrors build.js: 2026-06-15-my-post-title.md -> my-post-title
  const base = filename.replace(/\.md$/, "");
  const match = base.match(/^\d{4}-\d{2}-\d{2}-(.+)$/);
  return match ? match[1] : base;
}

function extractFrontmatterField(raw, field) {
  const match = raw.match(new RegExp(`^${field}:\\s*(.+)$`, "m"));
  if (!match) return null;
  return match[1].trim().replace(/^'(.*)'$/, "$1").replace(/''/g, "'");
}

function getExistingArticles(excludeCollection, excludeCount = 60) {
  // Gather title + live URL for existing news/lifestyle articles, so the
  // model can link to genuinely related ones instead of inventing URLs.
  const articles = [];
  for (const collection of ["news", "lifestyle"]) {
    const dir = path.join(REPO_ROOT, "content", collection);
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
    for (const file of files) {
      const raw = fs.readFileSync(path.join(dir, file), "utf8");
      const title = extractFrontmatterField(raw, "title");
      if (!title) continue;
      const slug = slugFromFilename(file);
      articles.push({ title, url: `https://sunnygh.com/${collection}/${slug}/` });
    }
  }
  // Most recent first (filenames are date-prefixed, so reverse-sort works),
  // capped so the prompt stays a reasonable size.
  return articles.reverse().slice(0, excludeCount);
}

async function callClaude(row) {
  const isNews = row.collection === "news";
  const allowedTaxonomy = isNews ? NEWS_TAGS : LIFESTYLE_CATEGORIES;
  const existingArticles = getExistingArticles(row.collection);

  const linkListText = existingArticles.length
    ? existingArticles.map((a) => `- "${a.title}" -> ${a.url}`).join("\n")
    : "(no existing articles yet)";

  const systemPrompt = `You write SEO articles for Sunny 88.7 FM (sunnygh.com), a Christian radio station in Accra, Ghana.
Voice: warm, devotional, scripture-anchored, encouraging — never preachy or judgmental. Written for a Ghanaian Christian audience.

You will be given a list of the site's existing published articles with their exact live URLs. Where genuinely relevant to the topic, naturally weave in markdown links to 2-3 of them within the body text (e.g. "...as we explored in [our piece on flood preparedness](https://sunnygh.com/news/...)"). Only link articles that are topically relevant — never force a link, and never invent a URL that isn't in the provided list. If nothing in the list is relevant, include zero or one link rather than a forced one.

Output ONLY valid JSON, no markdown fences, no preamble, matching this exact schema:
{
  "title": "string, compelling and SEO-friendly, under 70 characters where possible",
  "summary": "string, 1-2 sentences, shown as a teaser on the article list page",
  "body": "string, markdown body, 1200-1800 words, with ### subheadings, no title heading (title is separate), naturally incorporating the target keyword and 2-3 relevant internal links from the provided list",
  "taxonomy": ${isNews ? '"array of 1-2 tags from: ' + NEWS_TAGS.join(", ") + '"' : '"single category from: ' + LIFESTYLE_CATEGORIES.join(", ") + '"'}
}`;

  const userPrompt = `Target keyword: "${row.keyword}"
Angle: ${row.angle}
Collection: ${row.collection}

Existing site articles available to link to:
${linkListText}

Write the article now as JSON only.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Claude API error: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const textBlock = data.content.find((b) => b.type === "text");
  if (!textBlock) throw new Error("No text block in Claude response");

  const cleaned = textBlock.text.replace(/```json|```/g, "").trim();
  return JSON.parse(cleaned);
}

function buildFrontmatter(row, article) {
  const now = new Date();
  const isoDate = now.toISOString().replace(/\.\d+Z$/, ".000+00:00");

  const lines = ["---"];
  lines.push(`title: ${yamlSingleQuote(article.title)}`);
  lines.push(`date: ${isoDate}`);
  lines.push(`summary: ${yamlFoldedText(article.summary)}`);

  if (row.collection === "news") {
    lines.push("tags:");
    const tags = Array.isArray(article.taxonomy) ? article.taxonomy : [article.taxonomy];
    tags.forEach((t) => lines.push(`  - ${t}`));
  } else {
    lines.push(`category: ${yamlSingleQuote(article.taxonomy)}`);
  }

  lines.push("---");
  return lines.join("\n");
}

async function main() {
  const { header, rows } = readKeywords();
  const nextIndex = rows.findIndex((r) => r.status === "pending");

  if (nextIndex === -1) {
    console.log("No pending keywords left in content/seo/keywords.csv — add more rows.");
    return;
  }

  const row = rows[nextIndex];
  console.log(`Generating article for keyword: "${row.keyword}" (${row.collection})`);

  const article = await callClaude(row);
  const frontmatter = buildFrontmatter(row, article);
  const fileContent = `${frontmatter}\n${article.body.trim()}\n`;

  const dateStr = new Date().toISOString().slice(0, 10);
  const slug = slugify(article.title);
  const filename = `${dateStr}-${slug}.md`;
  const outDir = path.join(REPO_ROOT, "content", row.collection);
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, filename);
  fs.writeFileSync(outPath, fileContent, "utf8");

  console.log(`Wrote ${path.relative(REPO_ROOT, outPath)}`);

  rows[nextIndex].status = "done";
  writeKeywordsCsv(header, rows);

  // Note: no featured image is set (image field is optional in Decap schema).
  // Add one manually in Decap CMS, or extend this script with an image step later.
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
