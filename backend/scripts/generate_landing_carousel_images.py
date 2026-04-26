"""Generate portal carousel images (three sets) via EURI (OpenAI SDK) image API.

Requires EURI_API_KEY (and optional EURI_BASE_URL) in backend/.env.
Writes PNGs to:
  frontend/public/images/portal-carousel/landing/01.png … 06.png  — home page
  frontend/public/images/portal-carousel/login/01.png … 06.png   — login page
  frontend/public/images/portal-carousel/register/01.png … 06.png — registration page

Sets are disjoint: landing, login, and register each use different images.
All prompts: Indian / South Asian people, Indian healthcare settings, no text or logos.

Usage (from backend/):

    python scripts/generate_landing_carousel_images.py
"""

from __future__ import annotations

import base64
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

_BACKEND_ROOT = Path(__file__).resolve().parents[1]
_REPO_ROOT = _BACKEND_ROOT.parent
_OUT_ROOT = _REPO_ROOT / "frontend" / "public" / "images" / "portal-carousel"

# (subdir, stem, prompt) — stem is 01 … 06 within each folder
_PROMPTS: list[tuple[str, str, str]] = [
    # --- Landing (hospital / care overview) ---
    (
        "landing",
        "01",
        "Photorealistic exterior of a modern Indian multispecialty hospital with glass facade, "
        "Indian families and staff near the entrance, warm daylight, Indian urban context, "
        "no text or logos.",
    ),
    (
        "landing",
        "02",
        "Photorealistic: Indian doctors in white coats and Indian nurses in uniform walking in a "
        "bright clean hospital corridor in India, professional mood, no text or logos.",
    ),
    (
        "landing",
        "03",
        "Photorealistic: Indian medical team at a hospital nurses station in India, monitors and "
        "charts, collaborative discussion, no text or logos.",
    ),
    (
        "landing",
        "04",
        "Photorealistic: Indian patient with Indian family members seated in a hospital waiting area, "
        "supportive atmosphere, modern Indian hospital interior, no text or logos.",
    ),
    (
        "landing",
        "05",
        "Photorealistic: Indian reception staff at a busy clinic front desk in India, computers, "
        "helping visitors, no text or logos.",
    ),
    (
        "landing",
        "06",
        "Photorealistic: Indian cardiologist in Indian hospital consulting room showing an ECG "
        "printout to an Indian patient, respectful clinical mood, no text or logos.",
    ),
    # --- Login (returning access / digital sign-in) ---
    (
        "login",
        "01",
        "Photorealistic: Indian adult at home in a typical Indian living room using a laptop, "
        "blurred health website on screen, cozy lighting, no text or logos.",
    ),
    (
        "login",
        "02",
        "Photorealistic: Indian doctor at a desktop computer in a small Indian clinic office, "
        "signing in or working, professional, no text or logos.",
    ),
    (
        "login",
        "03",
        "Photorealistic: Indian visitor handing ID to Indian staff at a hospital reception security "
        "counter in India, no text or logos.",
    ),
    (
        "login",
        "04",
        "Photorealistic: Indian elderly person sitting on a sofa at home in India using a smartphone, "
        "calm expression, no text or logos.",
    ),
    (
        "login",
        "05",
        "Photorealistic: Indian nurse in uniform at a computer workstation on a hospital ward in India, "
        "entering notes, no text or logos.",
    ),
    (
        "login",
        "06",
        "Photorealistic: Indian office worker in Indian city clothes glancing at a smartphone during a "
        "short break, subtle wellness context, no text or logos.",
    ),
    # --- Register (new patient / onboarding) ---
    (
        "register",
        "01",
        "Photorealistic: Indian new patient at a hospital registration counter in India, Indian staff "
        "helping with forms, no text or logos.",
    ),
    (
        "register",
        "02",
        "Photorealistic: Indian family supporting an elderly Indian relative at an outpatient "
        "registration desk in an Indian hospital, no text or logos.",
    ),
    (
        "register",
        "03",
        "Photorealistic: Indian female receptionist helping a young Indian woman with registration at a "
        "clinic front desk in India, no text or logos.",
    ),
    (
        "register",
        "04",
        "Photorealistic: Indian mother with a young child at a hospital registration window in India, "
        "friendly staff, no text or logos.",
    ),
    (
        "register",
        "05",
        "Photorealistic: Indian administrative staff verifying documents with an Indian patient at a "
        "service desk in an Indian hospital, no text or logos.",
    ),
    (
        "register",
        "06",
        "Photorealistic: Indian hospital volunteer in vest guiding a visitor toward registration in a "
        "bright hospital lobby in India, no text or logos.",
    ),
]


def _save_image_data(client: OpenAI, out_path: Path, prompt: str) -> Path:
    resp = client.images.generate(
        model="gemini-3-pro-image-preview",
        prompt=prompt,
        n=1,
        size="1024x1024",
    )
    if not resp.data:
        raise RuntimeError(f"No image data for {out_path}")
    item = resp.data[0]
    url = getattr(item, "url", None) or getattr(item, "URL", None)
    if url:
        import urllib.request

        req = urllib.request.Request(url, headers={"User-Agent": "MedAssist-carousel-generator/1.0"})
        with urllib.request.urlopen(req, timeout=120) as r:
            out_path.write_bytes(r.read())
        return out_path
    b64 = getattr(item, "b64_json", None)
    if b64:
        raw = base64.b64decode(b64)
        out_path.write_bytes(raw)
        return out_path
    raise RuntimeError(f"Image response had neither url nor b64_json for {out_path}")


def main() -> int:
    load_dotenv(_BACKEND_ROOT / ".env")
    api_key = (os.environ.get("EURI_API_KEY") or "").strip()
    if not api_key:
        print("Set EURI_API_KEY in backend/.env", file=sys.stderr)
        return 1
    base = (
        os.environ.get("EURI_BASE_URL")
        or os.environ.get("BASE_URL")
        or os.environ.get("LLM_BASE_URL")
        or "https://api.euron.one/api/v1/euri"
    ).strip().rstrip("/")

    client = OpenAI(api_key=api_key, base_url=base)
    _OUT_ROOT.mkdir(parents=True, exist_ok=True)

    for subdir, stem, prompt in _PROMPTS:
        folder = _OUT_ROOT / subdir
        folder.mkdir(parents=True, exist_ok=True)
        out_path = folder / f"{stem}.png"
        print(f"Generating {subdir}/{stem}.png …")
        path = _save_image_data(client, out_path, prompt)
        print(f"  wrote {path.relative_to(_REPO_ROOT)}")

    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
