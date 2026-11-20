import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const read = (...parts: string[]): string =>
  readFileSync(join(__dirname, ...parts), 'utf8');

const shell = read('AppShell.tsx');
const styles = read('..', 'styles.css');

const ruleFor = (selector: string): string => {
  const match = new RegExp(`\\${selector} \\{([^}]*)\\}`, 'u').exec(styles);

  if (match === null) {
    throw new Error(`${selector} is not in styles.css`);
  }

  return match[1];
};

describe('the tab bar', () => {
  it('keeps the overflow menu outside the element that scrolls', () => {
    const innerOpens = shell.indexOf('className="tabbar__inner"');
    const moreOpens = shell.indexOf('className="tabbar__more"');

    expect(innerOpens).toBeGreaterThan(-1);
    expect(moreOpens).toBeGreaterThan(innerOpens);

    const between = shell.slice(innerOpens, moreOpens);
    const opened = (between.match(/<div\b/gu) ?? []).length;
    const closed = (between.match(/<\/div>/gu) ?? []).length;

    expect(closed).toBe(opened);
  });

  it('still lets the tabs scroll, which is the reason for the arrangement', () => {
    expect(ruleFor('.tabbar__inner')).toMatch(/overflow-x:\s*auto/u);
    expect(ruleFor('.tabbar__row')).not.toMatch(/overflow/u);
  });
});
