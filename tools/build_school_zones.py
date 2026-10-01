"""Match every Forsyth home to its assigned elementary, middle and high school.

Input:  ../sources/forsyth_school_zones.geojson  (county attendance zones)
        ../sources/forsyth_schools.geojson       (school names, grades, websites)
        data/forsyth.json.gz                     (home locations, from the model export)
Output: data/forsyth_schools.json.gz

Run from the planner folder:  python tools/build_school_zones.py
Needs: shapely (pip install shapely)
"""
import gzip
import json
from pathlib import Path

from shapely.geometry import Point, shape
from shapely.strtree import STRtree

PLANNER = Path(__file__).resolve().parent.parent
SOURCES = PLANNER.parent / 'sources'

zones = json.load(open(SOURCES / 'forsyth_school_zones.geojson'))['features']
schools = json.load(open(SOURCES / 'forsyth_schools.geojson'))['features']
homes = json.loads(gzip.decompress((PLANNER / 'data/forsyth.json.gz').read_bytes()))['homes']

# school details keyed by name, so the app can show grades and a website
info = {}
for f in schools:
    p = f['properties']
    info[p['SCH_NAME'].strip()] = {
        'grades': (p.get('GRDRANGE') or '').strip(),
        'address': f"{(p.get('ADDRESS') or '').strip()}, {(p.get('CITY') or '').strip().title()} {(p.get('ZIP') or '').strip()}",
        'website': (p.get('WEBSITE') or '').strip(),
    }

out = {
    'source': 'Forsyth County GIS open data: School Districts and Public School layers',
    'as_of': '2026-03-27 (layer last edited); downloaded 2026-10-01',
    'levels': {},
    'schools': info,
    'home': {},
}
for level in ['ES', 'MS', 'HS']:
    level_zones = [f for f in zones if f['properties']['TYPE'] == level]
    names = [f['properties']['SCH_NAME'].strip() for f in level_zones]
    shapes = [shape(f['geometry']) for f in level_zones]
    tree = STRtree(shapes)
    assigned = []
    for lat, lon in zip(homes['lat'], homes['lon']):
        if lat is None or lon is None:
            assigned.append(-1)
            continue
        pt = Point(lon, lat)
        hit = [k for k in tree.query(pt) if shapes[k].covers(pt)]
        # a point on a shared border can touch two zones; take the first one
        assigned.append(int(hit[0]) if hit else -1)
    out['levels'][level] = names
    out['home'][level] = assigned
    missing = sum(1 for a in assigned if a < 0)
    print(f'{level}: {len(names)} zones, {missing} homes outside every zone')

(PLANNER / 'data/forsyth_schools.json.gz').write_bytes(gzip.compress(json.dumps(out, separators=(',', ':')).encode(), 9))
print('wrote data/forsyth_schools.json.gz')
