"""Create ultra-lite GeoJSON with only major Thai rivers + key dams/reservoirs.
Target: <400 features to avoid CesiumJS RangeError."""
import json, os, sys
sys.stdout.reconfigure(encoding='utf-8')

MAJOR_RIVERS = {
    'แม่น้ำโขง', 'แม่น้ำเจ้าพระยา', 'แม่น้ำปิง', 'แม่น้ำวัง', 'แม่น้ำยม', 'แม่น้ำน่าน',
    'แม่น้ำป่าสัก', 'แม่น้ำท่าจีน', 'แม่น้ำแม่กลอง', 'แม่น้ำชี', 'แม่น้ำมูล',
    'แม่น้ำตาปี', 'แม่น้ำบางปะกง', 'แม่น้ำสาละวิน', 'แม่น้ำกก',
    'แม่น้ำสงคราม', 'แม่น้ำเมย', 'แม่น้ำแควน้อย', 'แม่น้ำแควใหญ่',
    'แม่น้ำอิง', 'แม่น้ำเลย', 'แม่น้ำเพชรบุรี', 'แม่น้ำปาย',
    'แม่น้ำปัตตานี', 'แม่น้ำสายบุรี', 'แม่น้ำปราณบุรี',
    'แม่น้ำลี้', 'แม่น้ำปาด', 'แม่น้ำน้อย',
    'ลำน้ำพอง', 'ลำน้ำเสียว', 'ลำน้ำเชิญ', 'ลำน้ำเหือง',
    'ลำโดมใหญ่', 'น้ำแม่ตื่น', 'น้ำแม่ลาว', 'แม่ยวม',
    'ลำน้ำแม่แจ่ม', 'น้ำพรม', 'แม่น้ำลำภาชี',
}

src = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "thailand_waterways_lite.geojson")
dst = os.path.join(os.path.dirname(src), "thailand_rivers_major.geojson")

with open(src, encoding='utf-8') as f:
    gj = json.load(f)

kept = []
for feat in gj['features']:
    p = feat['properties']
    tp = p.get('type', '')
    nm = p.get('name', '').strip()

    if tp == 'river' and nm in MAJOR_RIVERS:
        kept.append(feat)
    elif tp in ('dam', 'weir') and nm:
        kept.append(feat)
    elif tp == 'reservoir' and nm:
        kept.append(feat)

def simplify_line(coords, tol=0.006):
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

for feat in kept:
    g = feat['geometry']
    if g['type'] == 'LineString':
        g['coordinates'] = [[round(c[0], 3), round(c[1], 3)] for c in simplify_line(g['coordinates'], 0.006)]
    elif g['type'] == 'Polygon':
        g['coordinates'] = [[[round(c[0], 3), round(c[1], 3)] for c in simplify_line(ring, 0.008)] for ring in g['coordinates']]
    elif g['type'] == 'Point':
        g['coordinates'] = [round(g['coordinates'][0], 3), round(g['coordinates'][1], 3)]

kept = [f for f in kept if f['geometry']['type'] != 'LineString' or len(f['geometry']['coordinates']) >= 2]

out = {"type": "FeatureCollection", "features": kept}
with open(dst, 'w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False, separators=(',', ':'))

size = os.path.getsize(dst) / 1024
types = {}
total_coords = 0
for feat in kept:
    t = feat['properties'].get('type', '?')
    types[t] = types.get(t, 0) + 1
    g = feat['geometry']
    if g['type'] == 'LineString':
        total_coords += len(g['coordinates'])
    elif g['type'] == 'Polygon':
        total_coords += sum(len(r) for r in g['coordinates'])
    else:
        total_coords += 1

print(f"Saved: {dst}")
print(f"Features: {len(kept)} (from {len(gj['features'])})")
print(f"Size: {size:.0f} KB")
print(f"Total coords: {total_coords}")
print(f"Types: {types}")
