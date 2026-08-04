'use strict';

/**
 * Writes RELEASE_NOTES.md from the CHANGELOG section matching package.json's
 * version, and fails if that section is missing or empty.
 *
 * This runs before `npm publish` in the release workflow, so a missing changelog
 * entry stops the release rather than producing an empty GitHub Release after the
 * package is already on npm.
 *
 * Run locally to preview: node scripts/release-notes.js --dry-run
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dryRun = process.argv.includes('--dry-run');
const version = require(path.join(root, 'package.json')).version;
const changelogPath = path.join(root, 'CHANGELOG.md');
const changelog = fs.readFileSync(changelogPath, 'utf8');

const heading = `## [${version}]`;
const start = changelog.indexOf(`\n${heading}`);
if (start === -1) {
  console.error(`::error::CHANGELOG.md has no "${heading}" section for version ${version}.`);
  process.exit(1);
}

// Body runs from the end of the heading line to the next "## [" heading.
const afterHeading = changelog.slice(start + 1);
const bodyStart = afterHeading.indexOf('\n');
const rest = afterHeading.slice(bodyStart);
const nextHeading = rest.search(/\n## \[/);
const body = (nextHeading === -1 ? rest : rest.slice(0, nextHeading)).trim();

if (!body) {
  console.error(`::error::The "${heading}" section in CHANGELOG.md is empty.`);
  process.exit(1);
}

const notes = `${body}\n`;
if (dryRun) {
  console.log(`--- release notes for ${version} (${notes.length} bytes) ---`);
  console.log(notes);
} else {
  fs.writeFileSync(path.join(root, 'RELEASE_NOTES.md'), notes);
  console.log(`Wrote RELEASE_NOTES.md for ${version} (${notes.length} bytes).`);
}
