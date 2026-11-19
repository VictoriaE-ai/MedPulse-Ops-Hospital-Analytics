# MedPulse Ops — free static portfolio demonstration

**This package contains only fictional, newly generated sample records. It is not a live hospital system.**

React + TypeScript + Vite hospital operations dashboard with admissions, staffing, forecasting, CSV mapping and exports. The online guide uses deterministic local calculations rather than Gemini AI. No API keys, backend service, or paid model usage is required.

## Deploy free with Cloudflare Pages (Git integration)
1. Create a **new** GitHub repository, upload the contents of this folder (not a zip into the repository).
2. In Cloudflare Dashboard > Workers & Pages > Create application > Pages > Connect to Git, choose the repository.
3. Build command: `npm run build`
4. Build output directory: `dist`
5. Install command if requested: `npm install`; build-time environment variables: none.
6. Choose the **Free** plan. Do not enable paid Workers, APIs, or a billing upgrade.

## Local development
`npm install`, then `npm run dev`. Build with `npm run build`.

## Safety and limitations
- The sample `public/data/hospital_admissions.csv` was created from scratch and has fictional patient names and attributes, unrelated to the original upload. This makes dashboard figures illustrative, **not evidence about any actual hospital**.
- Uploaded CSV files are processed locally in your browser, but avoid uploading real patient data to publicly hosted apps without an approved data protection assessment.
- The guide is an offline, rule-based analytics helper, **not a generative AI chatbot**.
- The forecast is statistical and should not be used for clinical, operational, or staffing decisions.
- Public assets can be viewed by anyone. Never place secrets or real patient records in `public/`.
- Source-only zip: Cloudflare must build this source via Git integration. Do not drag the source ZIP onto Direct Upload; Direct Upload requires a `dist/` build output.
