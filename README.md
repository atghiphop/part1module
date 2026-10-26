# eConverge Part 1 Module

Static React proof-of-concept for the Part 1 contract flow.

## Local development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```

The `postcss-selector-parser` override keeps Tailwind 3's parser dependency on a patched release. Run `npm run build` and `npm audit` when changing this override.

## GitHub Pages

This repo includes [`.github/workflows/deploy.yml`](/Users/jarodtrebas/Documents/eConvergeGit/part1module/.github/workflows/deploy.yml), which builds the app and deploys `dist/` to GitHub Pages on pushes to `main`.

Important limitation: this is a static app. Saved contracts are stored in `localStorage`, so they only exist in the browser profile where they were created.
