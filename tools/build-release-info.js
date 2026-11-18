'use strict';
const fs = require('node:fs');
const path = require('node:path');
const revision = process.argv[2];
if (!/^[a-f0-9]{40}$/.test(revision || '')) throw new Error('A full release commit is required');
fs.writeFileSync(path.join(__dirname, '..', 'build-info.json'), JSON.stringify({ revision }) + '\n');
