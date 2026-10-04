# AI Content Detector evaluation

Run: 2026-10-03T16:27:35.764Z
Text model: none connected · Image model: none connected

## Text (28 samples)

| Group | n | Likely AI | Mixed | Likely human | Inconclusive |
|---|---|---|---|---|---|
| Human · African/Liberian English | 14 | 0 | 0 | 0 | 14 |
| AI · African English style | 4 | 0 | 0 | 0 | 4 |
| AI · Standard English | 6 | 0 | 0 | 0 | 6 |
| Edited (human ideas, AI wording) | 2 | 0 | 0 | 0 | 2 |
| Mixed (human + AI paragraphs) | 2 | 0 | 0 | 0 | 2 |

- **False positives** (human text called AI or mixed): 0/14 (0%); African/Liberian English: 0/14
- **AI detected** (AI text called Likely AI or Mixed): 0/10
- **AI missed** (AI text called Likely human): 0/10
- **Inconclusive**: 28/28
- Writing-pattern signals pointed to AI on 0/14 human samples and 3/10 AI samples — too unreliable to use for verdicts, so PanPen shows them only as context.

<details><summary>Per-sample results</summary>

| Sample | Label | Words | Verdict | AI score |
|---|---|---|---|---|
| human-plaatje-1 | human | 204 | inconclusive | — |
| human-plaatje-2 | human | 249 | inconclusive | — |
| human-plaatje-3 | human | 250 | inconclusive | — |
| human-plaatje-4 | human | 195 | inconclusive | — |
| human-plaatje-5 | human | 218 | inconclusive | — |
| human-plaatje-6 | human | 212 | inconclusive | — |
| human-equiano-1 | human | 202 | inconclusive | — |
| human-equiano-2 | human | 243 | inconclusive | — |
| human-equiano-3 | human | 299 | inconclusive | — |
| human-equiano-4 | human | 304 | inconclusive | — |
| human-teague-1 | human | 283 | inconclusive | — |
| human-teague-2 | human | 73 | inconclusive | — |
| human-blyden-1 | human | 225 | inconclusive | — |
| ai-std-agriculture | ai | 237 | inconclusive | — |
| ai-std-report | ai | 206 | inconclusive | — |
| ai-std-socialmedia | ai | 245 | inconclusive | — |
| ai-std-abstract | ai | 226 | inconclusive | — |
| ai-afr-liberia-education | ai | 264 | inconclusive | — |
| ai-afr-nigeria-letter | ai | 248 | inconclusive | — |
| ai-afr-ghana-report | ai | 242 | inconclusive | — |
| ai-afr-pidgin-story | ai | 256 | inconclusive | — |
| ai-artifacts | ai | 211 | inconclusive | — |
| edit-plaatje-ai-polished | edited | 227 | inconclusive | — |
| edit-equiano-ai-modernized | edited | 188 | inconclusive | — |
| mixed-teague-plus-ai | mixed | 403 | inconclusive | — |
| mixed-ai-plus-blyden | mixed | 314 | inconclusive | — |
| short-ai | ai | 56 | inconclusive | — |
| human-plaatje-zero-width | human | 204 | inconclusive | — |

</details>

## Images (19 fixtures)

| Fixture | Expected (no model) | Got | Model score |
|---|---|---|---|
| c2pa-ai-generated.jpg | ai_generated | ai_generated | — |
| c2pa-ai-generated.png | ai_generated | ai_generated | — |
| c2pa-ai-edited.jpg | ai_edited | ai_edited | — |
| c2pa-photoshop-generative-fill.jpg | ai_generated | ai_generated | — |
| c2pa-camera-capture.jpg | inconclusive | inconclusive | — |
| c2pa-ai-then-altered.jpg | likely_ai | likely_ai | — |
| c2pa-valid-no-ai.jpg | inconclusive | inconclusive | — |
| c2pa-data-changed.jpg | tampered | tampered | — |
| c2pa-bad-signature.jpg | tampered | tampered | — |
| c2pa-remote-manifest.jpg | inconclusive | inconclusive | — |
| sd-a1111-parameters.png | ai_generated | ai_generated | — |
| comfyui-workflow.png | ai_generated | ai_generated | — |
| xmp-trained-algorithmic.jpg | ai_generated | ai_generated | — |
| xmp-composite-ai.jpg | ai_edited | ai_edited | — |
| exif-software-midjourney.jpg | likely_ai | likely_ai | — |
| camera-exif-gps.jpg | inconclusive | inconclusive | — |
| description-firefly-insect.jpg | inconclusive | inconclusive | — |
| plain-no-metadata.png | inconclusive | inconclusive | — |
| plain.webp | inconclusive | inconclusive | — |

Provenance checks matched the expected verdict on 19/19 fixtures.

## Limits of this evaluation

- Human samples are public-domain writing by African and Liberian authors (1789–1916), which is certainly human but older in style than today's writing. Measure false positives on modern writing with EVAL_TEXT_DIR before relying on the detector for decisions.
- AI samples were written by one AI model; other models may be easier or harder to detect.
- Without a connected detection model every text result is Inconclusive by design: PanPen never turns writing patterns into a verdict or a score.
