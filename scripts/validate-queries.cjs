const fs = require('fs');
const path = require('path');
const { buildSchema, parse, validate } = require('graphql');

const root = process.cwd();
const schema = buildSchema(
  fs.readFileSync(path.join(root, 'server/schema.gql'), 'utf8'),
);
const source = fs.readFileSync(
  path.join(root, 'web/src/lib/queries.ts'),
  'utf8',
);

const consts = {};
for (const m of source.matchAll(/const (\w+) = `([\s\S]*?)`;/g))
  consts[m[1]] = m[2];

let failures = 0;
let checked = 0;

for (const m of source.matchAll(/gql`([\s\S]*?)`;/g)) {
  let text = m[1];
  for (let i = 0; i < 5; i += 1) {
    text = text.replace(/\$\{(\w+)\}/g, (_, name) => consts[name] ?? '');
  }

  let document;
  try {
    document = parse(text);
  } catch (error) {
    console.log(`  PARSE ERROR: ${error.message}`);
    failures += 1;
    continue;
  }

  checked += 1;
  const errors = validate(schema, document);
  if (errors.length > 0) {
    const name = /(?:query|mutation)\s+(\w+)/.exec(text)?.[1] ?? '(anonymous)';
    console.log(`  INVALID  ${name}: ${errors[0].message}`);
    failures += 1;
  }
}

console.log(`  ${checked} documents checked, ${failures} invalid`);
process.exit(failures === 0 ? 0 : 1);
