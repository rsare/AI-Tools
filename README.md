A lightweight, full-stack playground of everyday AI utilities.
It’s a single-page frontend that dynamically loads “tools”, backed by an Express server that safely proxies requests to external AI APIs so your keys never hit the browser.

What’s inside
Image Fixer – upload and get a cleaned/processed image (placeholder pipeline you can swap for your model/API).
- Image Generator – prompt → images using Google GenAI (Imagen) via @google/genai.
- Text Generator – long-form generation via Writer’s Palmyra.
- Text Summarizer – paragraph or bullet summary with justified formatting.
- Voice Generator – text-to-speech (plug-in your TTS vendor).
- Video Generator – image+prompt → short animation via Stability AI.
- Face Pixelizer – blur/pixelate faces (local CPU pipeline or proxy to a vendor).
- Background Remover – remove backgrounds via Pixian/remove.bg or a custom vendor.
- Auth – simple session-based register / login / logout protecting tool routes.
- Consistent UI: sidebar, keyboard shortcuts, robust “scroll to top / to output” helpers

  Project Structure
  rsare-ai-tools/
├─ index.js                 # Express server + API routes
├─ package.json
├─ LICENSE
├─ .env                     # put your secrets here (see below)
└─ frontend/
   ├─ index.html            # Main page (auth-aware)
   ├─ api.html              # Tool loader: /api.html?tool=<name>
   ├─ css/
   │  └─ style.css
   └─ js/
      ├─ main.js            # Dynamic import of tools
      └─ apis/
         ├─ imageFixer.js
         ├─ imageGenerator.js
         ├─ textGenerator.js
         ├─ textSummarize.js
         ├─ voiceGenerator.js
         ├─ videoGenerator.js
         └─ facePixelizer.js


   Quick start
1) Prerequisites

Node.js 18+ (works on Node 20/22 as well)

npm

2) Install
npm install

3) Configure environment

Create a .env in the project root. Pick the vendors you’ll actually use.

Required (common)
PORT=4001
SESSION_SECRET=change_me

Google GenAI (Imagen)
GOOGLE_API_KEY=YOUR_GOOGLE_API_KEY

Writer (Text generation)
TEXT_GENERATION=YOUR_WRITER_API_KEY

Stability AI (video)
STABILITY_AI_API_KEY=YOUR_STABILITY_KEY

Face Pixelizer (if using a vendor)
FACE_PIXELIZER_API_KEY=YOUR_FACE_API_KEY   # optional; local CPU fallback exists

4) Run
node index.js

Authentication
Session-based auth via express-session.

Endpoints:
POST /auth/register → { email, password }
POST /auth/login → { email, password }
POST /auth/logout
Protected routes (tools & APIs) require a session; public pages: /, /login.html, /register.html.

API overview

All APIs are mounted by index.js and proxied server-side so your keys stay private.

POST /api/imageFixer
Multipart image → returns { output: <dataUrl> }. (Currently a placeholder pipeline.)

POST /api/generate-image
{ prompt, n, model? } → { images: [{dataUrl}], model, count }.

POST /api/text-generator
{ prompt } → { output } (Writer Palmyra).

POST /api/stability-ai-video-generator
Multipart { image, prompt } → { videoUrl }.

POST /api/video-generator
Backward-compat proxy to the route above.

POST /api/face-pixelize
Multipart { image, mode=blur, level } → { output, via } (either proxy or local).


Frontend
frontend/api.html?tool=<name> dynamically imports frontend/js/apis/<name>.js and renders into #app.
A shared sidebar and consistent design (Tailwind-ish utility classes in CSS).
Robust scroll helpers:
Back to top fixed button
Jump to output button (doesn’t auto-scroll you; you’re in control)
Accessibility: labeled buttons, aria- attributes on controls, keyboard shortcuts (e.g. Alt+U in Text Generator to focus the prompt).


Add a new tool
Backend: create an Express route under /api/….
Frontend: create frontend/js/apis/<tool>.js exporting run({ backendBaseUrl }).
Add a link to the sidebar (or navigate to /api.html?tool=<tool>).
Keep UI consistent: use the same “panel” styles and buttons.


Login & Register Page:
<img width="1906" height="912" alt="image" src="https://github.com/user-attachments/assets/ddc9ee2f-d0a5-40c2-8696-d804021b0770" />
Main Page:
<img width="1899" height="910" alt="image" src="https://github.com/user-attachments/assets/1f55178f-c366-4aee-b1be-c7ec6a739944" />
Main Page (Cont):
<img width="1894" height="909" alt="image" src="https://github.com/user-attachments/assets/4d891d69-bcd5-4ecc-90cf-a681fbcefc97" />
Image Fixer:
<img width="1916" height="906" alt="image" src="https://github.com/user-attachments/assets/94d36c70-5d3f-4747-bae7-39aec882cc32" />
Text Generator:
<img width="1917" height="908" alt="image" src="https://github.com/user-attachments/assets/f4e87de7-5a36-45e7-8e5d-22c738cb5c73" />
Voice Generator:
<img width="1919" height="912" alt="image" src="https://github.com/user-attachments/assets/ad97bc34-f516-41c5-823a-ebdbc0af8fa4" />
Image Generator:
<img width="1895" height="908" alt="image" src="https://github.com/user-attachments/assets/fb0b324c-8a21-4ab4-a179-e7abfed4440a" />
Text Summarizer:
<img width="1894" height="908" alt="image" src="https://github.com/user-attachments/assets/4229136a-750c-490f-a3e6-3f1d6c1c6911" />
Image Pixelizer:
<img width="1898" height="908" alt="image" src="https://github.com/user-attachments/assets/b30d8c94-fc34-46d6-82d8-8d053037b8fa" />









