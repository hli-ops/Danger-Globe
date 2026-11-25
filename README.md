# Danger Globe

A single-page 3D globe that rates countries and regions on a 120-step danger scale
(+60 safest to -60 most dangerous) with 30 faces. Click a country, then a region.

Everything is in `index.html`. There is no build step and no server code.
The page loads three.js from cdnjs, so it needs an internet connection to open.

## Faces follow the data

Every face is picked from the place's own score. The 30 faces are split across the four official advisory bands
(8 faces for Level 1, 7 for Level 2, 8 for Level 3, 7 for Level 4), so a face never mixes two advisory levels:
a Do-Not-Travel place can only ever show a Level 4 face. The Legend lists the exact score range of each face.

## Live district search (new)

Open any country or district and the panel runs a **Live search** automatically. It asks three free
public sources straight from your browser. There is no server and no API key:

- **Wikivoyage**: the "Stay safe", "Get around", "See" and "Understand" sections of the matching travel guide page.
- **Wikipedia**: a short summary of the place.
- **GDELT news**: up to 6 recent English-language headlines (last 3 months) about crime, unrest, protests, security or disasters there.

Edit the box (use `Place, Country`, e.g. `Chiapas, Mexico`) and press **Search** to refine it. Web, News, US advisory and UK advice
links open a normal web search. Results are cached while the page is open.

Good to know:
- A page is only shown when its title really matches the place, so small districts with no guide page say so instead of showing a wrong page.
- This is community-written context and news, not an official advisory. It never changes the score.
- The news feed limits how often it can be asked. If it says it did not answer, wait a few seconds and press Search.
- If a network, ad blocker or company firewall blocks these sites, that section says it could not be reached and the rest of the page keeps working.

## Live news report (new): needs server.js

Opening any country or district now runs a keyless news search and writes a short report:

- `server.js` (Node 18+, no dependencies) reads public Google News RSS, caches 20 minutes and rate-limits. Run it with `node server.js` and open http://localhost:3000.
- Only vetted outlets count: wire services (Reuters, AP, AFP), public broadcasters (BBC, Al Jazeera, DW...), major newspapers, and government/UN sites. Other outlets are hidden by default, with a count and a toggle.
- The report shows a signal (quiet, active, heavy), topic bars, the latest headlines with source tier, a cross-check against the rating, and a Download report button (Markdown).
- Hovering a region in the list pre-loads its news so it opens instantly.
- Without the server (static hosting or file://), the page falls back to GDELT from the browser, still filtered to vetted outlets.
- The report is built from headlines by simple rules. It never changes the danger score.
- Deploy: `render.yaml` is now a Node web service.

## Search (works offline inside the page, no API)

Type in the search box at the top. It searches:

- **Place names**: countries and regions, accents and capitals ignored, ISO codes work (try `MEX`).
- **The written reports**: summaries, danger spots, getting-around tips, places to visit and
  advisory notes. Try `kidnapping`, `beach`, `toll road`. Several words must all appear.
  Matches show a highlighted snippet under "In the reports".
- **Questions**: ask in plain words, e.g. `Is Colima safe?` or `kidnapping risk in Davao`. The page finds the place,
  shows its score and report (or the estimate and a note that no report exists), lists matching report snippets,
  and gives "Search the web", "US advisory" and "UK advice" links that open a normal web search in a new tab.
  Nothing is sent anywhere until you click one of those links.
- **Scores**: type `+45` or `-30` to list everything rated that number.

Arrow keys move through results, Enter opens one, Escape closes the list.
Only researched countries and regions have report text. Other regions show
an "Estimated" chip with the reason for the estimate.

## Publish it: GitHub + Render (free static site)

### 1. Put the files on GitHub

Easiest (no command line):

1. Sign in at github.com, click **New repository**, name it `danger-globe`, keep it Public
   (or Private; Render can read both), click **Create repository**.
2. Click **uploading an existing file**, drag in `index.html`, `render.yaml` and `README.md`,
   then **Commit changes**.

Or with Git in a terminal, from this folder:

    git init
    git add .
    git commit -m "Danger Globe"
    git branch -M main
    git remote add origin https://github.com/YOUR-USERNAME/danger-globe.git
    git push -u origin main

### 2. Deploy on Render

Option A, dashboard (simplest):

1. Sign up or log in at render.com (using "Sign in with GitHub" is easiest).
2. Click **New +** then **Static Site**.
3. Connect your GitHub account, pick the `danger-globe` repository.
4. Branch: `main`. Build Command: leave empty (or `echo "No build"`).
   **Publish Directory: `.`** (a single period).
5. Click **Create Static Site**. After a minute you get a URL like
   `https://danger-globe.onrender.com`.

Option B, Blueprint (uses `render.yaml` in this folder):

1. In Render click **New +** then **Blueprint**.
2. Connect the repository. Render reads `render.yaml` and shows one static site.
3. Click **Apply**.

### 3. Update later

Edit `index.html` in GitHub (pencil icon) or push a new version. Render redeploys
automatically on every push to `main`. To redeploy by hand: open the site in Render,
**Manual Deploy**, **Deploy latest commit**.

### Optional

- **Custom domain**: Render site, **Settings**, **Custom Domains**, then add DNS records as shown.
- **GitHub Pages instead of Render**: repo **Settings**, **Pages**, deploy from branch `main`, folder `/ (root)`.

## Notes

- The "Live check" button asks an outside feed (travel-advisory.info) for current country scores.
  If the browser or the feed blocks it, the page says so and keeps using the built-in data.
- Region scores marked "Estimated" are computed from border exposure and distance from the
  country centre. They are not individual research. Official advice: check your government's
  current travel advisory before you travel.
