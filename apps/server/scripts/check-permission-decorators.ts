#!/usr/bin/env tsx
/**
 * CI lint：扫描所有 Controller 文件，确保每个 HTTP 方法上都有
 * @RequirePermission 或 @Public 装饰器。
 */
import { readFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { glob } from 'glob';

const HTTP_METHOD_RE = /@(Get|Post|Put|Patch|Delete)\(/;
const PERMISSION_RE = /@(RequirePermission|Public)\(/;

interface Problem {
  file: string;
  line: number;
  hint: string;
}

async function main() {
  const root = resolve(__dirname, '..', 'src');
  const files = await glob('**/*.controller.ts', { cwd: root, absolute: true });
  const problems: Problem[] = [];

  for (const file of files) {
    const source = readFileSync(file, 'utf-8');
    const lines = source.split('\n');

    for (let i = 0; i < lines.length; i++) {
      if (!HTTP_METHOD_RE.test(lines[i])) continue;

      // The decorator stack spans from the FIRST consecutive decorator line
      // above the method signature down to the method signature itself.
      // Order between @Get/@Post and @RequirePermission/@Public within that
      // stack is free — we check the whole stack.

      // Scan UP to find the top of the decorator stack
      let top = i;
      while (top > 0) {
        const prev = lines[top - 1].trim();
        if (prev.startsWith('@') || prev === '') {
          top -= 1;
          continue;
        }
        break;
      }

      // Scan DOWN from the HTTP decorator line until we hit the method
      // signature (first non-decorator, non-empty line)
      let bottom = i;
      while (bottom < lines.length - 1) {
        const next = lines[bottom + 1].trim();
        if (next.startsWith('@')) {
          bottom += 1;
          continue;
        }
        break;
      }

      // Check the full [top, bottom] range for @RequirePermission / @Public
      let hasPermission = false;
      for (let j = top; j <= bottom; j++) {
        if (PERMISSION_RE.test(lines[j])) {
          hasPermission = true;
          break;
        }
      }
      if (hasPermission) continue;

      // Find method signature as a hint for the error message
      let hint = '(unknown)';
      for (let k = i + 1; k < Math.min(i + 6, lines.length); k++) {
        const t = lines[k].trim();
        if (t && !t.startsWith('@')) {
          hint = t.slice(0, 80);
          break;
        }
      }
      problems.push({
        file: relative(resolve(__dirname, '..'), file).replace(/\\/g, '/'),
        line: i + 1,
        hint,
      });
    }
  }

  if (problems.length === 0) {
    console.log(`✔ All ${files.length} controller files passed permission decorator check.`);
    process.exit(0);
  }

  console.error(`✖ Found ${problems.length} HTTP methods missing @RequirePermission/@Public:\n`);
  for (const p of problems) {
    console.error(`  ${p.file}:${p.line}  →  ${p.hint}`);
  }
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
