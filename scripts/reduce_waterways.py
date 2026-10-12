"""ลดขนาด GeoJSON — เก็บเฉพาะลำน้ำที่มีชื่อ + เขื่อน/ฝาย + อ่างเก็บน้ำที่มีชื่อ"""
import json, os, sys
sys.stdout.reconfigure(encoding='utf-8')

src = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "thailand_waterways.geojson")
dst = os.path.join(os.path.dirname(src), "thailand_waterways_lite.geojson")

with open(src, encoding='utf-8') as f:
    gj = json.load(f)

kept = []
for feat in gj['features']:
    p = feat['properties']
    tp = p.get('type', '')
    nm = p.get('name', '')

    # เก็บเขื่อน/ฝาย ที่มีชื่อ
    if tp in ('dam', 'weir') and nm:
        kept.append(feat)
    # เก็บ river ที่มีชื่อ
    elif tp == 'river' and nm:
        kept.append(feat)
    # เก็บ canal ที่มีชื่อ
    elif tp == 'canal' and nm:
        kept.append(feat)
    # เก็บ reservoir ที่มีชื่อ
    elif tp in ('water', 'reservoir') and nm:
        kept.append(feat)

# ลด precision + simplify
def simplify_line(coords, tol=0.003):
    if len(coords) <= 3:
        return coords
    result = [coords[0]]
    for i in range(1, len(coords) - 1):
        dx = coords[i][0] - result[-1][0]
        dy = coords[i][1] - result[-1][1]
        if dx*dx + dy*dy > tol * tol:
            result.append(coords[i])
    result.append(coords[-1])
    return result

def reduce_coords(coords, geom_type):
    if geom_type == 'Point':
        return [round(coords[0], 4), round(coords[1], 4)]
    elif geom_type == 'LineString':
        simplified = simplify_line(coords, 0.002)
        return [[round(c[0], 4), round(c[1], 4)] for c in simplified]
    elif geom_type == 'Polygon':
        return [[[round(c[0], 4), round(c[1], 4)] for c in simplify_line(ring, 0.003)] for ring in coords]
    return coords

for feat in kept:
    g = feat['geometry']
    g['coordinates'] = reduce_coords(g['coordinates'], g['type'])

out = {"type": "FeatureCollection", "features": kept}
with open(dst, 'w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False, separators=(',', ':'))

size = os.path.getsize(dst) / 1024 / 1024
types = {}
for feat in kept:
    t = feat['properties'].get('type', '?')
    types[t] = types.get(t, 0) + 1
print(f"Saved: {dst}")
print(f"Features: {len(kept)} (from {len(gj['features'])})")
print(f"Size: {size:.1f} MB")
print(f"Types: {types}")
