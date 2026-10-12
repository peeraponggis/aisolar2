"""Create ultra-lite GeoJSON with major Thai rivers (merged segments) + key water bodies.
Target: <500 features, continuous river lines."""
import json, os, sys, math
from collections import defaultdict
sys.stdout.reconfigure(encoding='utf-8')

MAJOR_RIVERS = {
    'แม่น้ำโขง', 'แม่น้ำเจ้าพระยา', 'แม่น้ำปิง', 'แม่น้ำวัง', 'แม่น้ำยม', 'แม่น้ำน่าน',
    'แม่น้ำป่าสัก', 'แม่น้ำท่าจีน', 'แม่น้ำแม่กลอง', 'แม่น้ำชี', 'แม่น้ำมูล',
    'แม่น้ำตาปี', 'แม่น้ำบางปะกง', 'แม่น้ำสาละวิน', 'แม่น้ำกก',
    'แม่น้ำสงคราม', 'แม่น้ำเมย', 'แม่น้ำแควน้อย', 'แม่น้ำแควใหญ่',
    'แม่น้ำอิง', 'แม่น้ำเลย', 'แม่น้ำเพชรบุรี', 'แม่น้ำปาย',
    'แม่น้ำปัตตานี', 'แม่น้ำสายบุรี', 'แม่น้ำปราณบุรี',
    'แม่น้ำลี้', 'แม่น้ำปาด', 'แม่น้ำน้อย', 'แม่น้ำลพบุรี',
    'ลำน้ำพอง', 'ลำน้ำเสียว', 'ลำน้ำเชิญ', 'ลำน้ำเหือง',
    'ลำโดมใหญ่', 'น้ำแม่ตื่น', 'น้ำแม่ลาว', 'แม่ยวม',
    'ลำน้ำแม่แจ่ม', 'น้ำพรม', 'แม่น้ำลำภาชี', 'ลำตะคอง',
    'แม่น้ำแควน้อย', 'แม่น้ำกวง', 'แม่น้ำลาว',
}

src = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "thailand_waterways_lite.geojson")
dst = os.path.join(os.path.dirname(src), "thailand_rivers_major.geojson")

with open(src, encoding='utf-8') as f:
    gj = json.load(f)

def dist(a, b):
    return math.sqrt((a[0]-b[0])**2 + (a[1]-b[1])**2)

def simplify_line(coords, tol=0.005):
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

def merge_segments(segments):
    """Merge LineString segments into fewer continuous lines by connecting endpoints."""
    if not segments:
        return []
    lines = [list(s) for s in segments]

    changed = True
    while changed:
        changed = False
        i = 0
        while i < len(lines):
            j = i + 1
            while j < len(lines):
                # Try to connect line[i] end to line[j] start
                d1 = dist(lines[i][-1], lines[j][0])
                d2 = dist(lines[i][-1], lines[j][-1])
                d3 = dist(lines[i][0], lines[j][0])
                d4 = dist(lines[i][0], lines[j][-1])
                min_d = min(d1, d2, d3, d4)

                if min_d < 0.02:  # ~2km threshold for connecting
                    if min_d == d1:
                        lines[i] = lines[i] + lines[j][1:]
                    elif min_d == d2:
                        lines[i] = lines[i] + list(reversed(lines[j]))[1:]
                    elif min_d == d3:
                        lines[i] = list(reversed(lines[j])) + lines[i][1:]
                    elif min_d == d4:
                        lines[i] = lines[j] + lines[i][1:]
                    lines.pop(j)
                    changed = True
                else:
                    j += 1
            i += 1

    return lines

# Collect river segments by name
river_segments = defaultdict(list)
non_river_features = []

for feat in gj['features']:
    p = feat['properties']
    tp = p.get('type', '')
    nm = p.get('name', '').strip()
    g = feat['geometry']

    if tp == 'river' and nm in MAJOR_RIVERS and g['type'] == 'LineString' and len(g['coordinates']) >= 2:
        river_segments[nm].append(g['coordinates'])
    elif tp in ('dam', 'weir') and nm:
        non_river_features.append(feat)
    elif tp == 'reservoir' and nm:
        non_river_features.append(feat)

# Also add major water bodies from full dataset if available
full_src = os.path.join(os.path.dirname(src), "thailand_waterways.geojson")
if os.path.exists(full_src):
    print("Loading full dataset for water bodies...")
    with open(full_src, encoding='utf-8') as f:
        full_gj = json.load(f)
    water_seen = set()
    for feat in full_gj['features']:
        p = feat['properties']
        tp = p.get('type', '')
        nm = p.get('name', '').strip()
        g = feat['geometry']
        if tp in ('water', 'reservoir') and nm and g['type'] == 'Polygon':
            # Keep only large water bodies (polygon with enough points = bigger area)
            ring = g['coordinates'][0] if g['coordinates'] else []
            if len(ring) >= 8 and nm not in water_seen:
                water_seen.add(nm)
                non_river_features.append(feat)
    print(f"Added {len(water_seen)} named water bodies from full dataset")

# Merge river segments
kept = []
for name, segments in river_segments.items():
    merged = merge_segments(segments)
    for line in merged:
        simplified = simplify_line(line, 0.004)
        if len(simplified) >= 2:
            kept.append({
                "type": "Feature",
                "geometry": {"type": "LineString", "coordinates": [[round(c[0], 4), round(c[1], 4)] for c in simplified]},
                "properties": {"name": name, "type": "river"}
            })

# Simplify non-river features
for feat in non_river_features:
    g = feat['geometry']
    if g['type'] == 'LineString':
        g['coordinates'] = [[round(c[0], 4), round(c[1], 4)] for c in simplify_line(g['coordinates'], 0.005)]
        if len(g['coordinates']) < 2:
            continue
    elif g['type'] == 'Polygon':
        g['coordinates'] = [[[round(c[0], 4), round(c[1], 4)] for c in simplify_line(ring, 0.006)] for ring in g['coordinates']]
    elif g['type'] == 'Point':
        g['coordinates'] = [round(g['coordinates'][0], 4), round(g['coordinates'][1], 4)]
    kept.append(feat)

out = {"type": "FeatureCollection", "features": kept}
with open(dst, 'w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False, separators=(',', ':'))

size = os.path.getsize(dst) / 1024
types = defaultdict(int)
total_coords = 0
for feat in kept:
    t = feat['properties'].get('type', '?')
    types[t] += 1
    g = feat['geometry']
    if g['type'] == 'LineString':
        total_coords += len(g['coordinates'])
    elif g['type'] == 'Polygon':
        total_coords += sum(len(r) for r in g['coordinates'])
    else:
        total_coords += 1

# Count merged rivers
river_feats = [f for f in kept if f['properties'].get('type') == 'river']
river_names = set(f['properties']['name'] for f in river_feats)
print(f"\nSaved: {dst}")
print(f"Features: {len(kept)}")
print(f"Size: {size:.0f} KB")
print(f"Total coords: {total_coords}")
print(f"Types: {dict(types)}")
print(f"Rivers: {len(river_feats)} lines for {len(river_names)} named rivers (was {sum(len(s) for s in river_segments.values())} segments)")
