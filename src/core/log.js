'use strict';

const fs = require('fs');
const path = require('path');
const PATHS = require('./paths');

class RunLog {
  constructor(name) {
    fs.mkdirSync(PATHS.logs, { recursive: true });
    this.file = path.join(PATHS.logs, `last-${name}.log`);
    this.failed = false;
    fs.writeFileSync(this.file, `alfred ${name} ${new Date().toISOString()}\n\n`);
  }

  write(text) {
    fs.appendFileSync(this.file, text.endsWith('\n') ? text : text + '\n');
  }

  step(name, fn) {
    try {
      const detail = fn(this);
      console.log(`OK    ${name}${detail ? `: ${detail}` : ''}`);
      this.write(`OK ${name}${detail ? `: ${detail}` : ''}`);
      return true;
    } catch (err) {
      this.failed = true;
      const stderr = err.stderr ? String(err.stderr).trim() : '';
      console.log(`FAIL  ${name}: ${err.message}`);
      if (stderr) console.log(`      ${stderr.split('\n').join('\n      ')}`);
      this.write(`FAIL ${name}: ${err.message}\n${err.stack}\n${stderr}\n`);
      return false;
    }
  }

  skip(name, reason) {
    console.log(`SKIP  ${name}: ${reason}`);
    this.write(`SKIP ${name}: ${reason}`);
  }
}

module.exports = { RunLog };
