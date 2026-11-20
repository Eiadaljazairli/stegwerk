import csv, json, re, sys, collections

def grossempfaenger(r):
    return r[4].strip().isdigit()

DEUTSCH = {
    "Bavaria": "Bayern",
    "Land Berlin": "Berlin",
    "Lower Saxony": "Niedersachsen",
    "Mecklenburg-Western Pomerania": "Mecklenburg-Vorpommern",
    "Saxony": "Sachsen",
    "Saxony-Anhalt": "Sachsen-Anhalt",
    "Thuringia": "Thüringen",
}

src, out = sys.argv[1], sys.argv[2]
plz = collections.OrderedDict()
verworfen = []

for r in csv.reader(open(src, encoding="utf-8"), delimiter="\t"):
    code, ort, land = r[1], r[2].strip(), r[3].strip()
    if not re.fullmatch(r"\d{5}", code):
        continue
    if grossempfaenger(r):
        verworfen.append(ort)
        continue
    land = DEUTSCH.get(land, land)
    l = plz.setdefault(code, [])
    if [ort, land] not in l:
        l.append([ort, land])

for code, l in plz.items():
    namen = {ort for ort, _ in l}
    plz[code] = [
        [ort, land]
        for ort, land in l
        if not any(ort.startswith(n + " ") for n in namen if n != ort)
    ]

laender = sorted({land for l in plz.values() for _, land in l if land})
daten = {
    "quelle": "GeoNames (www.geonames.org), CC BY 4.0",
    "laender": laender,
    "plz": {
        code: [[ort, laender.index(land) if land else -1] for ort, land in sorted(l)]
        for code, l in sorted(plz.items())
    },
}
json.dump(daten, open(out, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("verworfen", len(verworfen), "plz", len(plz), file=sys.stderr)
if len(sys.argv) > 3:
    open(sys.argv[3], "w", encoding="utf-8").write("\n".join(sorted(set(verworfen))))
