import { readFileSync } from 'node:fs';

const reportPath = process.argv[2];
if (!reportPath) {
  console.error('Usage: node scripts/check-no-skips.mjs <vitest-json-path>');
  process.exit(1);
}

const raw = readFileSync(reportPath, 'utf8');
const data = JSON.parse(raw);

const numPending = data.numPendingTests ?? 0;
const numTodo = data.numTodoTests ?? 0;

let hasSkipsOrTodos = false;
let skippedCount = 0;
let todoCount = 0;

if (Array.isArray(data.testResults)) {
  for (const suite of data.testResults) {
    if (Array.isArray(suite.assertionResults)) {
      for (const test of suite.assertionResults) {
        if (test.status === 'skipped' || test.status === 'pending') {
          hasSkipsOrTodos = true;
          skippedCount++;
        } else if (test.status === 'todo') {
          hasSkipsOrTodos = true;
          todoCount++;
        }
      }
    }
  }
}

if (numPending > 0 || numTodo > 0 || hasSkipsOrTodos) {
  const finalSkipped = numPending > 0 ? numPending : skippedCount;
  const finalTodo = numTodo > 0 ? numTodo : todoCount;
  console.log(`skipped: ${finalSkipped}, todo: ${finalTodo}`);
  process.exit(1);
}

process.exit(0);
