"""Erzeugt plz-de.json aus den Postleitzahlen von GeoNames (CC BY 4.0).

    curl -o DE.zip https://download.geonames.org/export/zip/DE.zip
    unzip DE.zip DE.txt
    python3 plz-erzeugen.py DE.txt plz-de.json [verworfen.txt]

Verworfen werden Großempfänger (sie tragen statt eines Orts den Namen einer
Behörde, Firma oder Person) und Ortsteile neben ihrem Ort. Die Bundesländer stehen deutsch da.
"""
import csv, json, re, sys, collections

# GeoNames führt Großempfänger (Behörden, Kliniken, Banken, Firmen, auch
# Kanzleien und Einzelpersonen) in einem eigenen Block: dort steht das
# Bundesland mit einer Ziffernkennung („13“, „Saxony“), bei echten Orten mit
# dem Buchstabenkürzel („SN“, „Sachsen“). Ein Namensfilter ließ Hunderte
# davon durch („Amtsgericht“, „Landratsamt Bautzen“); die Kennung trennt
# sauber. Eine Großempfänger-Postleitzahl hat damit keinen Ort.
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

# Ortsteile („Dresden Friedrichstadt“) fallen weg, wenn der Ort selbst dasteht.
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
