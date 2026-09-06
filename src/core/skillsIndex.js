'use strict';

const fs = require('fs');
const path = require('path');
const PATHS = require('./paths');
const { loadSkills } = require('./skills');

// Validates every skill and writes config/skills-index.json.
// Throws on any invalid skill so callers never sync a broken skill out to the tools.
function buildIndex() {
  const skills = loadSkills();
  const errors = [];
  const seen = new Map();

  for (const skill of skills) {
    if (!skill.description) errors.push(`${skill.file}: missing "description" in frontmatter`);
    if (seen.has(skill.name)) {
      errors.push(`${skill.file}: duplicate skill name "${skill.name}" (also ${seen.get(skill.name)})`);
    }
    seen.set(skill.name, skill.file);
  }

  if (errors.length > 0) {
    throw new Error(`invalid skills:\n  - ${errors.join('\n  - ')}`);
  }

  fs.mkdirSync(path.dirname(PATHS.skillsIndex), { recursive: true });
  fs.writeFileSync(
    PATHS.skillsIndex,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        count: skills.length,
        skills: skills.map(({ name, description, file }) => ({ name, description, file })),
      },
      null,
      2
    )
  );

  return skills;
}

module.exports = { buildIndex };
