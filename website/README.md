# BChat website

Static marketing site: landing page, Privacy Policy and Terms of Service. Plain HTML and CSS with no build step, so it can be hosted anywhere that serves static files (GitHub Pages, Netlify, Vercel, Cloudflare Pages).

```
website/
  index.html           landing page
  privacy.html         generated from docs/legal/privacy-policy.md
  terms.html           generated from docs/legal/terms-of-service.md
  css/styles.css       design tokens match client/context/ThemeContext.tsx
  assets/              logo, favicons, app screenshots
  scripts/build-legal.mjs
```

## Preview locally

```bash
cd website && python3 -m http.server 8090
# open http://localhost:8090
```

## Updating the legal pages

`docs/legal/*.md` is the single source of truth for both the app and the site. After editing either document:

```bash
npm run legal:sync     # app copy (client/legal/content.ts)
npm run website:legal  # website/privacy.html and terms.html
```

Don't edit `privacy.html` or `terms.html` by hand; they're overwritten.

## Notes

- The App Store and Google OAuth consent screen both need public URLs for the privacy policy and home page. Use `/privacy.html` and `/` once this is deployed.
- The hero chat is HTML styled like the app's chat screen, not a screenshot. Screenshots in `assets/screens/` were taken from the iOS simulator in light mode. Retake them if those screens change.
- Light and dark mode follow the visitor's system setting.
