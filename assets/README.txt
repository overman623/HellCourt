Asset folder guide — 지옥법정 (text choice MVP)

images/ui     - title / ingame UI
audio         - (MVP 미사용)
data          - game-config.js (토글·수치), game-content.js (콘텐츠)
js            - game.js (규칙 코어)
fonts         - PF start dust ExtraBold

Playtest report:
docs/MVP_IMPLEMENTATION_REPORT.md


images/ui     - title / ingame UI, backgrounds, frames, portraits
audio         - BGM / SFX (연결 예정)
data          - game-data.js (스토리·선택지·아트 경로)
fonts         - UI font files

Relative paths from index.html, e.g.:
assets/images/ui/TitleBG.png

Expected art hooks (game-data.js -> art.paths):
assets/images/ui/TitleBG.png           - title full-bleed (brand baked in)
assets/images/ui/IngameBG.png          - center stage background (optional, not yet added)
assets/images/ui/QuestionCard.png      - question card layout reference

Font:
assets/fonts/PF_start_dust_3.0_ExtraBold.ttf  (PF start dust 3.0 ExtraBold)
