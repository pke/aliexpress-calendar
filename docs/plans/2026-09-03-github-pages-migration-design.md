# GitHub Pages Migration Design

**Date:** 2026-09-03

## Goal

Move the static AliExpress calendar website and subscription feed from Vercel to GitHub Pages at `https://aesales.kalenderabos.de`. After the new site and feed are verified, delete the Vercel project. The existing Vercel feed URL will intentionally stop working.

## Hosting architecture

GitHub Pages publishes the existing `public/` directory. A single GitHub Actions workflow handles both calendar updates and Pages deployments:

- Pushes to `master` deploy the checked-in `public/` directory.
- The monthly schedule and manual dispatch run tests, scrape and validate the source, commit genuine calendar changes, and deploy the resulting `public/` directory in the same run.
- Combining both paths avoids relying on a second workflow being triggered by a commit made with `GITHUB_TOKEN`.

The workflow receives only the permissions it needs: repository contents write access for calendar commits, Pages write access for deployments, and an OIDC token for Pages. Deployment concurrency prevents overlapping releases.

## Domain and URLs

GitHub Pages uses `aesales.kalenderabos.de` as its custom domain. Before assigning it to the repository, `kalenderabos.de` is verified for the `pke` GitHub account with GitHub's DNS TXT challenge to prevent domain takeover. The verification TXT record remains in DNS. Porkbun currently resolves `aesales` through the wildcard CNAME `*.kalenderabos.de → pixie.porkbun.com`; that shared wildcard remains in place, while a more specific `aesales → pke.github.io` CNAME is added to override it only for this site. With a custom Actions workflow, GitHub stores the custom domain in the Pages settings; a repository `CNAME` file is neither required nor used.

The canonical URLs become:

- Website: `https://aesales.kalenderabos.de/`
- Feed: `https://aesales.kalenderabos.de/aliexpress-sales.ics`

The website and README use the custom domain explicitly. This keeps the subscription URL independent of GitHub's repository path and makes a future hosting migration possible without changing subscriptions again.

## README badges

The README places a compact badge row directly below the title:

- A dynamic GitHub Actions badge links to the combined update-and-deploy workflow.
- An AliExpress-red Subscribe badge links directly to the canonical calendar feed.
- An MIT License badge links to the repository license.

The three badges provide operational status and useful actions without turning the README header into a large technical dashboard.

## Failure behavior

The existing scraper safeguards remain unchanged. An invalid, empty, or excessively divergent scrape fails before files are committed or deployed, leaving the last good Pages deployment online. A failed Pages deployment likewise leaves the previous deployment available.

Vercel is not removed until all of the following succeed over HTTPS on the custom domain:

1. The website loads.
2. The feed returns non-empty calendar content.
3. The feed contains the same number of events as the checked-in source.
4. Subscription and download links point to the custom domain.

## Migration sequence

1. Update the workflow, site metadata, and tracked hosting configuration for GitHub Pages.
2. Enable Pages with GitHub Actions as its source and verify `kalenderabos.de` for the `pke` GitHub account.
3. Push the repository changes and verify the first Pages deployment at the inherited `https://pke.fyi/aliexpress-calendar/` project URL.
4. Configure the Pages custom domain.
5. Add a specific Porkbun `aesales` CNAME to override the existing wildcard for this hostname.
6. Wait for DNS and GitHub's HTTPS certificate, then verify the site and feed end to end.
7. Delete the linked Vercel project.

## Alternatives considered

- **Separate update and deploy workflows:** clearer separation, but monthly commits made with `GITHUB_TOKEN` do not reliably trigger a second push workflow without extra orchestration.
- **Dedicated `gh-pages` branch:** common but duplicates generated files and creates unnecessary deployment history.
- **Combined workflow publishing `public/` (selected):** the fewest moving parts and guarantees that a validated monthly update is the version deployed.
