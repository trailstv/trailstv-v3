# Park hero images

One landscape photo per park, named after the park (run `npm run images:report` for the full list):

    acadia.jpg, arches.jpg, grand-canyon.jpg, great-smoky-mountains.jpg, sequoia-kings-canyon.jpg …

- Formats: .jpg, .webp, .avif or .png. The 4-letter park code also works (acad.jpg).
- Size: landscape, at least 2400px wide, ideally under ~600 KB. Next.js resizes and serves modern formats automatically.
- The homepage picks a random image from this folder on every visit.
- Credits (optional): add `credits.json` here, e.g. { "acadia.jpg": "Photo: NPS / Kristi Rugg" }.
- NPS photos are generally public domain; check the license of any other photo you use.
