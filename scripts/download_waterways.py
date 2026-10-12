"""
ดาวน์โหลดข้อมูลแม่น้ำหลัก คลอง เขื่อน ฝาย และอ่างเก็บน้ำทั่วประเทศไทย
บันทึกเป็น GeoJSON สำหรับใช้เป็นชั้นข้อมูลถาวรใน aiSolar Platform

เฉพาะ river + canal + dam + weir + reservoir (ไม่รวม stream/drain เพื่อลดขนาด)
"""
import json, time, urllib.request, urllib.parse, sys, os

OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]

# แบ่งประเทศไทยเป็น 6 พื้นที่ (ใหญ่พอแต่ไม่เกิน timeout)
REGIONS = [
    ("north",  "17.0,97.3,20.6,101.5"),
    ("central","13.5,98.5,17.0,102.0"),
    ("northeast","14.0,101.5,18.5,106.0"),
    ("east",   "12.0,100.5,14.0,103.0"),
    ("south-upper", "8.5,98.0,13.5,101.5"),
    ("south-lower", "5.5,99.0,8.5,103.0"),
]

def query_overpass(bbox, attempt=0):
    q = f"""[out:json][timeout:180];(
        way["waterway"="river"]({bbox});
        way["waterway"="canal"]({bbox});
        way["waterway"="dam"]({bbox});
        way["waterway"="weir"]({bbox});
        node["waterway"="dam"]({bbox});
        node["waterway"="weir"]({bbox});
        way["landuse"="reservoir"]({bbox});
        way["natural"="water"]["water"~"^(lake|reservoir|pond)$"]({bbox});
    );out geom;"""

    url_idx = attempt % len(OVERPASS_URLS)
    url = OVERPASS_URLS[url_idx]
    data = urllib.parse.urlencode({"data": q}).encode()
    req = urllib.request.Request(url, data=data)
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    req.add_header("User-Agent", "aiSolar-waterway-downloader/1.0")

    resp = urllib.request.urlopen(req, timeout=200)
    return json.loads(resp.read().decode())

def simplify_coords(coords, tolerance=0.001):
    if len(coords) <= 3:
        return coords
    result = [coords[0]]
    for i in range(1, len(coords) - 1):
        dx = coords[i][0] - result[-1][0]
        dy = coords[i][1] - result[-1][1]
        if dx*dx + dy*dy > tolerance * tolerance:
            result.append(coords[i])
    result.append(coords[-1])
    return result

def to_geojson_feature(el):
    tags = el.get("tags", {})
    props = {}
    props["name"] = tags.get("name:th") or tags.get("name") or tags.get("name:en") or ""
    ww = tags.get("waterway", "")
    nat = tags.get("natural", "")
    lu = tags.get("landuse", "")

    if ww:
        props["type"] = ww
        if el["type"] == "node":
            return {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [el["lon"], el["lat"]]},
                "properties": props
            }
        elif el.get("geometry"):
            coords = [[p["lon"], p["lat"]] for p in el["geometry"]]
            if ww in ("dam", "weir") and len(coords) >= 3:
                coords.append(coords[0])
                return {
                    "type": "Feature",
                    "geometry": {"type": "Polygon", "coordinates": [coords]},
                    "properties": props
                }
            if len(coords) < 2:
                return None
            coords = simplify_coords(coords, 0.0008 if ww == "river" else 0.002)
            if len(coords) < 2:
                return None
            return {
                "type": "Feature",
                "geometry": {"type": "LineString", "coordinates": coords},
                "properties": props
            }
    elif nat == "water" or lu == "reservoir":
        props["type"] = lu or nat or "water"
        if el.get("geometry"):
            coords = [[p["lon"], p["lat"]] for p in el["geometry"]]
            coords = simplify_coords(coords, 0.002)
            if len(coords) < 3:
                return None
            if coords[0] != coords[-1]:
                coords.append(coords[0])
            return {
                "type": "Feature",
                "geometry": {"type": "Polygon", "coordinates": [coords]},
                "properties": props
            }
    return None

def main():
    # Force UTF-8 output
    sys.stdout.reconfigure(encoding='utf-8')

    out_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out_path = os.path.join(out_dir, "data", "thailand_waterways.geojson")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    all_features = []
    seen_ids = set()

    for i, (name, bbox) in enumerate(REGIONS):
        print(f"[{i+1}/{len(REGIONS)}] Downloading {name} ({bbox})...")
        max_retries = 3
        for attempt in range(max_retries):
            try:
                result = query_overpass(bbox, attempt)
                count = 0
                for el in result.get("elements", []):
                    eid = f"{el['type']}/{el['id']}"
                    if eid in seen_ids:
                        continue
                    seen_ids.add(eid)
                    feat = to_geojson_feature(el)
                    if feat:
                        all_features.append(feat)
                        count += 1
                print(f"   OK: {count} features (total {len(all_features)})")
                break
            except Exception as e:
                print(f"   Attempt {attempt+1} failed: {e}")
                if attempt < max_retries - 1:
                    wait = 10 * (attempt + 1)
                    print(f"   Waiting {wait}s before retry...")
                    time.sleep(wait)
                else:
                    print(f"   SKIPPED {name}")

        if i < len(REGIONS) - 1:
            print("   Waiting 5s...")
            time.sleep(5)

    geojson = {
        "type": "FeatureCollection",
        "features": all_features
    }

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False, separators=(",", ":"))

    size_mb = os.path.getsize(out_path) / 1024 / 1024
    print(f"\nSaved: {out_path}")
    print(f"   Features: {len(all_features)}")
    print(f"   Size: {size_mb:.1f} MB")

    types = {}
    for feat in all_features:
        t = feat["properties"].get("type", "unknown")
        types[t] = types.get(t, 0) + 1
    print(f"   Types: {types}")

if __name__ == "__main__":
    main()
