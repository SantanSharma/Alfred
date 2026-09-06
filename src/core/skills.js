'use strict';

const fs = require('fs');
const path = require('path');
const PATHS = require('./paths');
const { parseFrontmatter } = require('./frontmatter');

// Recursively finds every .md file under skills/, so future subfolders
// (categories, namespaced skill packs) work without touching this code.
function findSkillFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  let results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(findSkillFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(full);
    }
  }
  return results;
}

function loadSkills() {
  const files = findSkillFiles(PATHS.skills);
  return files.map((file) => {
    const raw = fs.readFileSync(file, 'utf8');
    const { data } = parseFrontmatter(raw);
    return {
      name: data.name || path.basename(file, '.md'),
      description: data.description || '',
      file: path.relative(PATHS.skills, file),
      path: file,
    };
  });
}

module.exports = { loadSkills, findSkillFiles };
