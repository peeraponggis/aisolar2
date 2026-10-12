"""
ดาวน์โหลดข้อมูลลำน้ำ แหล่งน้ำ เขื่อน และฝายทั้งประเทศไทยจาก OpenStreetMap
บันทึกเป็น GeoJSON สำหรับใช้เป็นชั้นข้อมูลถาวรใน aiSolar Platform
"""
import json, time, urllib.request, urllib.parse, sys, os

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

# แบ่งประเทศไทยเป็น 18 พื้นที่ย่อย
REGIONS = [
    ("เหนือ-บน", "19.0,97.3,20.5,101.0"),
    ("เหนือ-ล่าง", "17.5,97.3,19.0,101.5"),
    ("กลาง-เหนือ", "15.5,99.0,17.5,101.5"),
    ("กลาง", "14.0,99.0,15.5,101.5"),
    ("กรุงเทพฯ", "13.3,100.0,14.0,101.0"),
    ("อีสาน-บน-ซ้าย", "17.0,101.5,18.5,103.5"),
    ("อีสาน-บน-ขวา", "17.0,103.5,18.5,105.7"),
    ("อีสาน-กลาง", "15.5,101.5,17.0,105.0"),
    ("อีสาน-ล่าง-ซ้าย", "14.0,101.5,15.5,103.5"),
    ("อีสาน-ล่าง-ขวา", "14.0,103.5,15.5,106.0"),
    ("ตะวันออก", "12.0,100.5,14.0,103.0"),
    ("ตะวันตก-บน", "15.5,97.5,17.5,99.5"),
    ("ตะวันตก-ล่าง", "13.5,97.5,15.5,99.5"),
    ("ใต้-บน1", "11.5,98.0,13.5,101.0"),
    ("ใต้-บน2", "9.5,98.0,11.5,100.5"),
    ("ใต้-กลาง", "7.5,99.0,9.5,101.5"),
    ("ใต้-ล่าง1", "6.0,99.5,7.5,101.5"),
    ("ใต้-ล่าง2", "5.5,100.0,6.5,103.0"),
]

def query_overpass(bbox):
    q = f"""[out:json][timeout:120];(
        way["waterway"~"^(river|canal)$"]({bbox});
        way["waterway"~"^(dam|weir)$"]({bbox});
        node["waterway"~"^(dam|weir)$"]({bbox});
        way["natural"="water"]({bbox});
        way["landuse"="reservoir"]({bbox});
    );out geom;"""

    data = urllib.parse.urlencode({"data": q}).encode()
    req = urllib.request.Request(OVERPASS_URL, data=data)
    req.add_header("Content-Type", "application/x-www-form-urlencoded")

    resp = urllib.request.urlopen(req, timeout=180)
    return json.loads(resp.read().decode())

def simplify_coords(coords, tolerance=0.002):
    """ลดจำนวนจุดในเส้นโดยตัดจุดที่อยู่ใกล้กันเกินไป"""
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

    if tags.get("waterway"):
        props["type"] = tags["waterway"]
        if el["type"] == "node":
            return {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [el["lon"], el["lat"]]},
                "properties": props
            }
        elif el.get("geometry"):
            coords = [[p["lon"], p["lat"]] for p in el["geometry"]]
            if tags["waterway"] in ("dam", "weir") and len(coords) >= 3:
                coords.append(coords[0])
                return {
                    "type": "Feature",
                    "geometry": {"type": "Polygon", "coordinates": [coords]},
                    "properties": props
                }
            if len(coords) < 2:
                return None
            # ลำน้ำ/คลอง: simplify
            if tags["waterway"] in ("river", "canal"):
                coords = simplify_coords(coords, 0.001)
            else:
                coords = simplify_coords(coords, 0.003)
            if len(coords) < 2:
                return None
            return {
                "type": "Feature",
                "geometry": {"type": "LineString", "coordinates": coords},
                "properties": props
            }
    elif tags.get("natural") == "water" or tags.get("landuse") == "reservoir":
        props["type"] = tags.get("landuse") or tags.get("natural") or "water"
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
    out_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out_path = os.path.join(out_dir, "data", "thailand_waterways.geojson")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    all_features = []
    seen_ids = set()

    for i, (name, bbox) in enumerate(REGIONS):
        print(f"[{i+1}/{len(REGIONS)}] กำลังดาวน์โหลด {name} ({bbox})...")
        try:
            result = query_overpass(bbox)
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
            print(f"   ✅ ได้ {count} features (รวม {len(all_features)})")
        except Exception as e:
            print(f"   ❌ ล้มเหลว: {e}")

        if i < len(REGIONS) - 1:
            print("   ⏳ รอ 3 วินาที...")
            time.sleep(3)

    geojson = {
        "type": "FeatureCollection",
        "features": all_features
    }

    # บันทึกแบบ compact (ไม่มี indent) เพื่อลดขนาดไฟล์
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False, separators=(",", ":"))

    size_mb = os.path.getsize(out_path) / 1024 / 1024
    print(f"\n✅ บันทึกแล้ว: {out_path}")
    print(f"   จำนวน features: {len(all_features)}")
    print(f"   ขนาดไฟล์: {size_mb:.1f} MB")

    # สรุปตามประเภท
    types = {}
    for f in all_features:
        t = f["properties"].get("type", "unknown")
        types[t] = types.get(t, 0) + 1
    print(f"   ประเภท: {types}")

if __name__ == "__main__":
    main()
