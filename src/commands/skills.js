'use strict';

const { loadSkills } = require('../core/skills');

function run() {
  const skills = loadSkills();

  if (skills.length === 0) {
    console.log('No skills found yet. Add a .md file under skills/ to create one.');
    return;
  }

  console.log(`Alfred skills (${skills.length}):\n`);
  for (const skill of skills) {
    console.log(`  /${skill.name}`);
    console.log(`      ${skill.description || '(no description)'}`);
    console.log(`      ${skill.file}\n`);
  }
}

module.exports = { run };
