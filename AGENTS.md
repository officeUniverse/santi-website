# Santi Universe website maintenance

When adding or changing a client project/case study:
- Update the case-study page, portfolio.html, the homepage Selected Work carousel, and sitemap.xml together.
- The Websites tab runs the local concave case-study image gallery in assets/js/studio-gallery.js. No CodePen iframe. Run python3 scripts/sync-case-studies.py whenever project images change; its registry is loaded by the homepage.
- The AI tab contains the local number experiment in assets/css/studio-numbers.css and assets/js/studio-numbers.js. The homepage chat disclosure has been removed.
- Keep names, dates, service scope and results factual; do not present template projects or placeholder imagery as real clients.
- Preserve matching image heights in the homepage carousel.

See STUDIO-REFERENCES.md for the user's creative direction and gallery maintenance workflow. The AI art panel is procedural artwork. The homepage has no live chat interface.
