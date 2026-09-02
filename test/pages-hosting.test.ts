import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

function readProjectFile(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("calendar workflow updates and deploys GitHub Pages", () => {
  const workflow = readProjectFile(".github/workflows/update-calendar.yml");

  assert.ok(workflow.includes("name: Update and deploy sales calendar"));
  assert.ok(
    workflow.includes("push:\n    branches:\n      - master"),
    "workflow must deploy ordinary master pushes",
  );
  assert.ok(workflow.includes("contents: write"));
  assert.ok(workflow.includes("pages: write"));
  assert.ok(workflow.includes("id-token: write"));
  assert.ok(workflow.includes("if: github.event_name != 'push'"));
  assert.ok(
    workflow.includes(
      "actions/configure-pages@45bfe0192ca1faeb007ade9deae92b16b8254a0d",
    ),
  );
  assert.ok(
    workflow.includes(
      "actions/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9",
    ),
  );
  assert.ok(workflow.includes("path: public"));
  assert.ok(
    workflow.includes(
      "actions/deploy-pages@368f82528645a54fb793d4d04e342629a3f51346",
    ),
  );
  assert.ok(workflow.includes("name: github-pages"));
});

test("site and documentation use the canonical calendar domain", () => {
  const index = readProjectFile("public/index.html");
  const readme = readProjectFile("README.md");
  const canonicalFeed =
    "https://aesales.kalenderabos.de/aliexpress-sales.ics";

  assert.ok(index.includes(canonicalFeed));
  assert.ok(readme.includes(canonicalFeed));
  assert.ok(
    readme.includes(
      "webcal://aesales.kalenderabos.de/aliexpress-sales.ics",
    ),
  );
  assert.ok(!index.includes("aliexpress-calendar.vercel.app"));
  assert.ok(!readme.includes("aliexpress-calendar.vercel.app"));
  assert.ok(index.includes("Updated monthly"));
});

test("README contains the approved compact badge row", () => {
  const readme = readProjectFile("README.md");

  assert.ok(
    readme.includes(
      "actions/workflows/update-calendar.yml/badge.svg?branch=master",
    ),
  );
  assert.ok(
    readme.includes("img.shields.io/badge/Subscribe-calendar-FF4747"),
  );
  assert.ok(
    readme.includes("img.shields.io/badge/License-MIT-2F80ED.svg"),
  );
});

test("tracked Vercel configuration is removed", () => {
  const packageJson = JSON.parse(readProjectFile("package.json")) as {
    scripts: Record<string, string>;
  };

  assert.equal(packageJson.scripts.dev, undefined);
  assert.equal(
    existsSync(new URL("../vercel.json", import.meta.url)),
    false,
  );
});
