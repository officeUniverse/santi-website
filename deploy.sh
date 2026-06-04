#!/usr/bin/env bash
# Update the live santi.co.za static site from GitHub. Run this ON the server.
#   curl -s https://raw.githubusercontent.com/officeUniverse/santi-website/main/deploy.sh | bash
set -e
cd ~
rm -rf ~/_santi_deploy
git clone --depth 1 https://github.com/officeUniverse/santi-website.git ~/_santi_deploy
cp -a \
  ~/_santi_deploy/index.html ~/_santi_deploy/services.html ~/_santi_deploy/portfolio.html \
  ~/_santi_deploy/about.html ~/_santi_deploy/contact.html ~/_santi_deploy/aeo.html \
  ~/_santi_deploy/project-details.html ~/_santi_deploy/terms.html ~/_santi_deploy/privacy.html \
  ~/_santi_deploy/cookies.html ~/_santi_deploy/assets ~/_santi_deploy/api ~/_santi_deploy/.htaccess \
  ~/_santi_deploy/llms.txt ~/_santi_deploy/robots.txt ~/_santi_deploy/sitemap.xml \
  ~/public_html/
rm -rf ~/_santi_deploy
echo "✓ santi.co.za updated $(date)"
