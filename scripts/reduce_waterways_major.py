"""Create GeoJSON with ALL named Thai rivers (merged segments) + water bodies.
Uses coordinate count threshold instead of whitelist to include all significant rivers."""
import json, os, sys, math
from collections import defaultdict
sys.stdout.reconfigure(encoding='utf-8')

MIN_COORDS = 15  # minimum total coords for a named river to be included

src = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "thailand_waterways_lite.geojson")
dst = os.path.join(os.path.dirname(src), "thailand_rivers_major.geojson")

with open(src, encoding='utf-8') as f:
    gj = json.load(f)

def dist(a, b):
    return math.sqrt((a[0]-b[0])**2 + (a[1]-b[1])**2)

def simplify_line(coords, tol=0.004):
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
                d1 = dist(lines[i][-1], lines[j][0])
                d2 = dist(lines[i][-1], lines[j][-1])
                d3 = dist(lines[i][0], lines[j][0])
                d4 = dist(lines[i][0], lines[j][-1])
                min_d = min(d1, d2, d3, d4)
                if min_d < 0.025:
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

# Collect ALL named river segments
river_segments = defaultdict(list)
river_total_coords = defaultdict(int)
non_river_features = []

for feat in gj['features']:
    p = feat['properties']
    tp = p.get('type', '')
    nm = p.get('name', '').strip()
    g = feat['geometry']

    if tp == 'river' and nm and g['type'] == 'LineString' and len(g['coordinates']) >= 2:
        river_segments[nm].append(g['coordinates'])
        river_total_coords[nm] += len(g['coordinates'])
    elif tp in ('dam', 'weir') and nm:
        non_river_features.append(feat)
    elif tp == 'reservoir' and nm:
        non_river_features.append(feat)

# Filter rivers by total coordinate count
included_rivers = {nm for nm, tc in river_total_coords.items() if tc >= MIN_COORDS}
print(f"Rivers with >= {MIN_COORDS} coords: {len(included_rivers)} / {len(river_segments)}")

# Add major water bodies from full dataset
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
            ring = g['coordinates'][0] if g['coordinates'] else []
            if len(ring) >= 8 and nm not in water_seen:
                water_seen.add(nm)
                non_river_features.append(feat)
    print(f"Added {len(water_seen)} named water bodies")

# Merge and simplify included rivers
kept = []
for name in included_rivers:
    segments = river_segments[name]
    merged = merge_segments(segments)
    for line in merged:
        simplified = simplify_line(line, 0.003)
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
        g['coordinates'] = [[[round(c[0], 4), round(c[1], 4)] for c in simplify_line(ring, 0.005)] for ring in g['coordinates']]
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

river_feats = [f for f in kept if f['properties'].get('type') == 'river']
river_names = set(f['properties']['name'] for f in river_feats)
orig_segs = sum(len(river_segments[nm]) for nm in included_rivers)
print(f"\nSaved: {dst}")
print(f"Features: {len(kept)}")
print(f"Size: {size:.0f} KB")
print(f"Total coords: {total_coords}")
print(f"Types: {dict(types)}")
print(f"Rivers: {len(river_feats)} lines for {len(river_names)} named rivers (merged from {orig_segs} segments)")
