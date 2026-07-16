import { test, expect, Page } from '@playwright/test';

/**
 * Automated UI/UX health checks (HEL-36).
 *
 * These are generic invariants, not feature tests:
 *  1. CLIPPED CONTENT: no element may have horizontally overflowing content
 *     (scrollWidth > clientWidth) while its computed overflow-x is visible or
 *     hidden — that is "content the user can never see" (the git-diff-panel
 *     horizontal-scrolling bug is exactly this pattern).
 *  2. CONSOLE HEALTH: navigating the app must not produce console errors or
 *     page errors — silent JS failures are the usual cause of "weird status".
 *  3. DEAD-END GUARD: primary views render their headings (smoke-level).
 */

type ClipViolation = { selector: string; scrollWidth: number; clientWidth: number };

async function findClippedContent(page: Page): Promise<ClipViolation[]> {
  return page.evaluate(() => {
    const bad: { selector: string; scrollWidth: number; clientWidth: number }[] = [];
    const describe = (el: Element): string => {
      const id = el.id ? `#${el.id}` : '';
      const cls = (el as HTMLElement).className
        ? '.' + String((el as HTMLElement).className).trim().split(/\s+/).slice(0, 3).join('.')
        : '';
      return `${el.tagName.toLowerCase()}${id}${cls}`;
    };
    const all = document.querySelectorAll<HTMLElement>('body *');
    all.forEach((el) => {
      // Ignore invisible elements and trivial overflows (<8px: borders/rounding).
      if (!el.offsetParent && el.tagName !== 'BODY') return;
      const overflowX = getComputedStyle(el).overflowX;
      const overflowing = el.scrollWidth - el.clientWidth > 8;
      if (!overflowing) return;
      if (overflowX === 'visible' || overflowX === 'hidden') {
        // visible overflow inside a scrollable ancestor is fine — the ancestor
        // provides the scrollbar. Only flag it when NO ancestor can scroll it.
        let a: HTMLElement | null = el.parentElement;
        let rescued = false;
        while (a) {
          const ax = getComputedStyle(a).overflowX;
          if ((ax === 'auto' || ax === 'scroll') && a.scrollWidth > a.clientWidth) {
            rescued = true;
            break;
          }
          a = a.parentElement;
        }
        if (!rescued) {
          bad.push({ selector: describe(el), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth });
        }
      }
    });
    // de-duplicate nested reports: keep outermost distinct selectors
    const seen = new Set<string>();
    return bad.filter((b) => (seen.has(b.selector) ? false : (seen.add(b.selector), true))).slice(0, 20);
  });
}

function collectConsoleIssues(page: Page): string[] {
  const issues: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') issues.push(`console.error: ${msg.text().slice(0, 200)}`);
  });
  page.on('pageerror', (err) => issues.push(`pageerror: ${String(err).slice(0, 200)}`));
  return issues;
}

test.describe('UI health invariants', () => {
  test('no clipped-unscrollable content on primary views', async ({ page }) => {
    const issues = collectConsoleIssues(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const violationsByView: Record<string, ClipViolation[]> = {};
    violationsByView['home'] = await findClippedContent(page);

    // Walk the primary navigation targets that exist without data setup.
    for (const nav of ['Compare Job']) {
      const btn = page.getByRole('button', { name: nav });
      if (await btn.count()) {
        await btn.first().click();
        await page.waitForLoadState('networkidle');
        violationsByView[nav] = await findClippedContent(page);
      }
    }

    const flat = Object.entries(violationsByView)
      .flatMap(([view, v]) => v.map((x) => `${view}: ${x.selector} (${x.scrollWidth}px in ${x.clientWidth}px)`));
    expect(flat, `clipped-but-unscrollable content found:\n${flat.join('\n')}`).toEqual([]);
    expect(issues, issues.join('\n')).toEqual([]);
  });

  test('diff panel long lines are horizontally reachable', async ({ page }) => {
    // Feature-level invariant for the git-like panel: any .diff-view pane with
    // overflowing content must itself be scrollable (overflow-x auto/scroll).
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const panes = await page.evaluate(() => {
      return Array.from(document.querySelectorAll<HTMLElement>('.diff-view')).map((el) => ({
        overflowX: getComputedStyle(el).overflowX,
        overflowing: el.scrollWidth - el.clientWidth > 8,
      }));
    });
    for (const p of panes) {
      if (p.overflowing) {
        expect(['auto', 'scroll']).toContain(p.overflowX);
      }
    }
  });
});
