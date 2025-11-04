import os, io, json, hashlib, uuid, re, mimetypes
from pathlib import Path
from PIL import Image, ImageOps
import imagehash
from dotenv import load_dotenv
from supabase import create_client, Client

# ---------- Config ----------
SEED = 42                         # controls deterministic split
DATA_ROOT = "data"                # local data directory
DEFAULT_BUCKET = "deepfake-dataset"
VALID_DOMAINS = {"id", "receipt", "car_accident"}
VALID_AUTH = {"real", "fake"}
SPLIT_THRESHOLDS = (0.8, 0.9)     # train<0.8, val<0.9, else test
THUMB_SIZE = (256, 256)           # thumbnail size (square)
THUMB_JPEG_QUALITY = 85
# -----------------------------

load_dotenv()
SUPABASE_URL = os.environ["SUPABASE_URL"]
SERVICE_ROLE = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
BUCKET = os.getenv("BUCKET", DEFAULT_BUCKET)
sb: Client = create_client(SUPABASE_URL, SERVICE_ROLE)

def sha256_bytes(b: bytes) -> str:
    import hashlib as _hash
    return _hash.sha256(b).hexdigest()

def compute_phash(img: Image.Image) -> int:
    return int(str(imagehash.phash(img)), 16)

def to_signed_bigint(value: int) -> int:
    if value >= 2**63:
        value -= 2**64
    return value

def assign_split_from_checksum(sha: str) -> str:
    r = int(sha[:8], 16) / 0xFFFFFFFF
    t, v = SPLIT_THRESHOLDS
    if r < t: return "train"
    if r < v: return "val"
    return "test"

def ensure_bucket(bucket: str):
    # Create if missing (ignore if exists)
    try:
        res = sb.storage.create_bucket(bucket, {"public": False})
        if isinstance(res, dict) and res.get("error"):
            msg = str(res["error"])
            if "already exists" not in msg:
                raise RuntimeError(msg)
    except Exception:
        buckets = sb.storage.list_buckets()
        names = []
        for b in (buckets or []):
            if isinstance(b, dict):
                names.append(b.get("name"))
            else:
                names.append(getattr(b, "name", None))
        if bucket not in names:
            raise

def upload_bytes(path: str, b: bytes, content_type="image/jpeg"):
    res = sb.storage.from_(BUCKET).upload(path, b, {"contentType": content_type, "upsert": False})
    if isinstance(res, dict) and res.get("error"):
        msg = str(res["error"])
        if "already exists" in msg:
            return
        raise RuntimeError(msg)

def row_exists_by_checksum(checksum: str) -> bool:
    resp = sb.table("deepfake_images").select("id").eq("checksum", checksum).limit(1).execute()
    data = getattr(resp, "data", None) or []
    return len(data) > 0

def insert_row(row: dict):
    resp = sb.table("deepfake_images").insert(row).execute()
    if getattr(resp, "error", None):
        raise RuntimeError(resp.error)

def signed_url(path: str, expires=3600) -> str:
    out = sb.storage.from_(BUCKET).create_signed_url(path, expires)
    return (out.get("signedURL") or (out.get("data") or {}).get("signedURL") or "")

def normalize_domain(name: str) -> str:
    n = name.lower().strip()
    n = re.sub(r"[^a-z_]", "", n)
    aliases = {"caraccident": "car_accident", "car_accidents": "car_accident"}
    n = aliases.get(n, n)
    if n not in VALID_DOMAINS:
        raise ValueError(f"Unsupported domain folder '{name}'. Use one of {sorted(VALID_DOMAINS)}")
    return n

def to_jpeg_bytes(img: Image.Image, quality=95) -> bytes:
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality, optimize=True)
    return buf.getvalue()

def make_thumbnail(img: Image.Image, size=(256, 256)) -> Image.Image:
    # Center-crop + resize to fixed square (preserves framing, avoids letterboxing)
    return ImageOps.fit(img, size, method=Image.LANCZOS)

def process_file(img_path: Path, authenticity: str, domain: str, root: Path, source="local_import"):
    root_path = Path(root)
    file_bytes = img_path.read_bytes()
    checksum = sha256_bytes(file_bytes)
    if row_exists_by_checksum(checksum):
        print(f"SKIP duplicate (checksum) → {img_path}")
        return None

    with Image.open(io.BytesIO(file_bytes)) as im:
        im_rgb = im.convert("RGB")
        width, height = im_rgb.size
        phash = to_signed_bigint(compute_phash(im_rgb))
        thumb_img = make_thumbnail(im_rgb, THUMB_SIZE)
        thumb_w, thumb_h = thumb_img.size
        thumb_jpeg = to_jpeg_bytes(thumb_img, quality=THUMB_JPEG_QUALITY)

    relative_path = img_path.relative_to(root_path).as_posix()
    object_path = relative_path
    thumb_relative = Path(relative_path).with_suffix(".jpg").as_posix()
    thumb_path = f"thumbs/{thumb_relative}"

    content_type = mimetypes.guess_type(img_path.name)[0] or "application/octet-stream"

    split = assign_split_from_checksum(checksum)

    # Upload originals and thumbs
    upload_bytes(object_path, file_bytes, content_type=content_type)
    upload_bytes(thumb_path, thumb_jpeg, content_type="image/jpeg")

    row = {
        "bucket_name": BUCKET,
        "object_path": object_path,
        "domain": domain,
        "authenticity": authenticity,
        "split": split,
        "filename": img_path.name,
        "size": len(file_bytes),
        "content_type": content_type,
        "checksum": checksum,
        "phash": phash,
        "width": width,
        "height": height,
        "thumb_path": thumb_path,
        "thumb_width": thumb_w,
        "thumb_height": thumb_h,
        "source": source,
    }
    insert_row(row)
    return row

def process_bucket_object(object_path: str, authenticity: str, domain: str, metadata=None, source="bucket_scan"):
    blob = sb.storage.from_(BUCKET).download(object_path)
    if isinstance(blob, bytes):
        file_bytes = blob
    else:
        file_bytes = getattr(blob, "data", None)
    if not file_bytes and hasattr(blob, "error") and blob.error:
        raise RuntimeError(f"Failed to download {object_path}: {blob.error}")
    if not file_bytes:
        raise RuntimeError(f"Failed to download {object_path} from bucket {BUCKET}")

    checksum = sha256_bytes(file_bytes)
    if row_exists_by_checksum(checksum):
        print(f"SKIP duplicate (checksum) → {object_path}")
        return None

    with Image.open(io.BytesIO(file_bytes)) as im:
        im_rgb = im.convert("RGB")
        width, height = im_rgb.size
        phash = to_signed_bigint(compute_phash(im_rgb))
        thumb_img = make_thumbnail(im_rgb, THUMB_SIZE)
    thumb_w, thumb_h = thumb_img.size
    thumb_jpeg = to_jpeg_bytes(thumb_img, quality=THUMB_JPEG_QUALITY)

    thumb_relative = Path(object_path).with_suffix(".jpg").as_posix()
    thumb_path = f"thumbs/{thumb_relative}"
    upload_bytes(thumb_path, thumb_jpeg, content_type="image/jpeg")

    metadata = metadata or {}
    row = {
        "bucket_name": BUCKET,
        "object_path": object_path,
        "domain": domain,
        "authenticity": authenticity,
        "split": assign_split_from_checksum(checksum),
        "filename": Path(object_path).name,
        "size": metadata.get("size") or len(file_bytes),
        "content_type": metadata.get("mimetype") or "image/jpeg",
        "checksum": checksum,
        "phash": phash,
        "width": width,
        "height": height,
        "thumb_path": thumb_path,
        "thumb_width": thumb_w,
        "thumb_height": thumb_h,
        "source": source,
    }
    insert_row(row)
    return row

def walk_local_and_ingest(write_manifest=True, root=DATA_ROOT):
    ensure_bucket(BUCKET)

    root = Path(root)
    rows = []
    for auth_folder in ["real", "fake"]:
        auth_dir = root / auth_folder
        if not auth_dir.exists():
            continue
        if auth_folder not in VALID_AUTH:
            raise ValueError(f"Folder '{auth_folder}' must be one of {sorted(VALID_AUTH)}")
        for domain_dir in auth_dir.iterdir():
            if not domain_dir.is_dir():
                continue
            domain = normalize_domain(domain_dir.name)
            for p in domain_dir.iterdir():
                if p.is_file():
                    try:
                        r = process_file(p, auth_folder, domain, root=root)
                        if r:
                            rows.append(r)
                            print(f"INGESTED {p} → {r['object_path']} (thumb: {r['thumb_path']}) "
                                  f"[{auth_folder}/{domain}/{r['split']}]")
                    except Exception as e:
                        print(f"ERROR {p}: {e}")

    if write_manifest and rows:
        manifest = []
        for r in rows:
            url_full  = signed_url(r["object_path"], 3600)
            url_thumb = signed_url(r["thumb_path"], 3600) if r.get("thumb_path") else ""
            manifest.append({
                "bucket": r["bucket_name"],
                "path": r["object_path"],
                "thumb_path": r.get("thumb_path"),
                "domain": r["domain"],
                "authenticity": r["authenticity"],
                "split": r["split"],
                "url": url_full,
                "thumb_url": url_thumb
            })
        Path("manifest.json").write_text(json.dumps(manifest, indent=2))
        print(f"\nWrote manifest.json with {len(manifest)} items.")

    print("\nDone.")
    return rows

def walk_bucket_and_ingest(write_manifest=True):
    ensure_bucket(BUCKET)

    rows = []
    for auth_folder in VALID_AUTH:
        for domain in VALID_DOMAINS:
            prefix = f"{auth_folder}/{domain}"
            offset = 0
            while True:
                try:
                    entries = sb.storage.from_(BUCKET).list(prefix, {"limit": 100, "offset": offset})
                except Exception as exc:
                    print(f"ERROR listing {prefix}: {exc}")
                    break
                if not entries:
                    break

                for entry in entries:
                    name = entry.get("name") if isinstance(entry, dict) else getattr(entry, "name", None)
                    metadata = entry.get("metadata") if isinstance(entry, dict) else getattr(entry, "metadata", None)
                    if not name:
                        continue
                    if not metadata or not metadata.get("size"):
                        # Skip subfolders or placeholders
                        continue
                    object_path = f"{prefix}/{name}"
                    try:
                        r = process_bucket_object(object_path, auth_folder, domain, metadata=metadata)
                        if r:
                            rows.append(r)
                            print(f"INGESTED {object_path} [{auth_folder}/{domain}/{r['split']}]")
                    except Exception as e:
                        print(f"ERROR {object_path}: {e}")

                if len(entries) < 100:
                    break
                offset += len(entries)

    if write_manifest and rows:
        manifest = []
        for r in rows:
            url_full = signed_url(r["object_path"], 3600)
            url_thumb = signed_url(r["thumb_path"], 3600) if r.get("thumb_path") else ""
            manifest.append({
                "bucket": r["bucket_name"],
                "path": r["object_path"],
                "thumb_path": r.get("thumb_path"),
                "domain": r["domain"],
                "authenticity": r["authenticity"],
                "split": r["split"],
                "url": url_full,
                "thumb_url": url_thumb
            })
        Path("manifest.json").write_text(json.dumps(manifest, indent=2))
        print(f"\nWrote manifest.json with {len(manifest)} items.")

    print("\nDone.")
    return rows

def walk_and_ingest(write_manifest=True, root=DATA_ROOT):
    root_path = Path(root)
    if root_path.exists() and any((root_path / auth).exists() for auth in VALID_AUTH):
        return walk_local_and_ingest(write_manifest=write_manifest, root=root)
    print(f"No local data found at '{root}'. Falling back to bucket ingestion.")
    return walk_bucket_and_ingest(write_manifest=write_manifest)

if __name__ == "__main__":
    walk_and_ingest()
