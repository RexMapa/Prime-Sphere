# PrimeSphere website

Static site: index.html, styles.css, script.js, assets/.

## Deploy to Vercel
1. Drag this whole folder onto https://vercel.com/new (or run `npx vercel` inside it).
2. Framework preset: "Other". No build command, output directory is the root.

## Before going live
- Replace placeholder blocks (class "ph") with your images: <img src="assets/your-photo.jpg" alt="...">
- Stats: edit data-count="8" and data-count="5" in index.html.
- Testimonials, client logos, contact details, social links (href="#").
- Contact form: set data-endpoint on #contact-form to a form service URL
  (e.g. Formspree). Without one, it opens the visitor's email app addressed to data-email.
