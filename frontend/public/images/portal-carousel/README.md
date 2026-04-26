# Portal carousel images (three sets)

The **landing**, **login**, and **registration** pages each use their **own** slideshow folder so images do not repeat across those routes.

| Page | Folder | Files |
|------|--------|--------|
| Home / landing | `landing/` | `01.png` … `06.png` |
| Login | `login/` | `01.png` … `06.png` |
| Register | `register/` | `01.png` … `06.png` |

All scenes are intended to show **Indian people and Indian healthcare settings** (see alt text in `frontend/src/lib/portal-carousel-images.ts`).

Generate all **18** PNGs (1024×1024) with your EURI key:

```bash
cd backend
python scripts/generate_landing_carousel_images.py
```

Until files exist, the UI shows gradient placeholders for missing slides.

**Legacy:** Older builds used flat `portal-carousel/01.png` … `06.png` in this directory. Those paths are no longer used; run the script above to populate `landing/`, `login/`, and `register/`.
