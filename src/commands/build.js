'use strict';

const path = require('path');
const PATHS = require('../core/paths');
const { buildIndex } = require('../core/skillsIndex');

function run() {
  try {
    const skills = buildIndex();
    console.log(`Build OK. Indexed ${skills.length} skill(s) -> ${path.relative(PATHS.root, PATHS.skillsIndex)}`);
  } catch (err) {
    console.log(`Build failed: ${err.message}`);
    process.exitCode = 1;
  }
}

module.exports = { run };
