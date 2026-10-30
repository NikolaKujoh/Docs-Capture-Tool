# OnScreen Capture Tool — lokalna aplikacija

## Cela lokalna aplikacija — backend bez Jire

1. Na Windows-u sa Python 3.10+ pokreni **Setup Backend.cmd** (prvi put;
   kreira lokalni `.venv` i instalira pakete).
2. Pokreni **Launch OnScreen.cmd**. Browser se otvara na slobodnom lokalnom portu.
3. Izaberi `.xlsx` fajl unosom putanje, glavni folder sa batchevima i opcioni sheet.
4. NEXT piše `DONE` i timestamp direktno u **izabrani Excel fajl**.
   Ako želiš zaseban radni fajl, prethodno napravi kopiju i otvori nju.
5. Za nastavak nakon zatvaranja servera ponovo izaberi isti radni Excel.
   Refresh browsera i povratak sa dashboard-a koriste trenutno otvoreni projekat.
6. Ctrl+C u terminalu zatvara servis i oslobađa projekat.

Primer organizacije: `CaptureData/input.xlsx`,
`CaptureData/images/batch_10/<naziv-iz-pete-kolone>.png`.
Kao image root možeš izabrati i sam `batch_10` folder. Učitava se prvi sheet
ako drugi nije naveden. Sva zaglavlja iz API ugovora moraju postojati u prvom redu.
Indeks mora biti jedinstven u okviru batch-a. Nejasno/nedostajuće poklapanje slike
je greška i sprečava završavanje tog zadatka.

**Excel ostaje jedini izvor capture statusa.** Nema Jire ili centralne baze.
Dashboard u Excel režimu prikazuje stvarni otvoreni workbook; nepoznate label,
validation i recapture vrednosti prikazane su kao nedostupne. Osveži dashboard
za novo stanje. Pregled nije agregacija više operatorovih računara.

Slike se šalju direktnim `FileResponse` odgovorom: nema rekompresije, promene
formata ili upisa oznake u izvor. Hash originala i HTTP sadržaja proveren je testom.
Browser i dalje skalira prikaz kroz postojeći viewer.

Backend proverava reviziju fajla, serijalizuje upise i zaključava projekat kroz
`.onscreen.lock` pomoćni fajl. NEXT čuva privremeni XLSX i zatim zamenjuje cilj.
Nemoj ručno menjati isti workbook tokom rada. Ako je izmenjen spolja, ponovo
otvori projekat. Excel `~$` lock fajl/OS permission greške blokiraju čuvanje.
Ponovljeni complete istog DONE zadatka ne menja timestamp.

Timestamp je ISO tekst sa offset-om; podrazumevana zona backend-a je
`Europe/Belgrade` (API open prima `timezone`). Excel datumi bez zone se tumače
u toj zoni. Dnevni UI izveštaj bira dan po lokalnoj zoni browsera.

`openpyxl` čuva standardne formule/stilove, ali nije Excel engine i ne računa
formule niti garantuje sve napredne objekte. Podržan je `.xlsx`, ne `.xls/.xlsm`.
Provere nad sintetičkim workbook-om nisu zamena za pilot na vašem stvarnom fajlu.

Logovi: `%LOCALAPPDATA%\OnScreenCaptureTool\onscreen.log` na Windows-u.
Dokumentacija API-ja je na `/docs`. Write pozivi zahtevaju token iz `/api/session`
u `X-OnScreen-Token`; frontend ga dobija automatski. Servis radi samo na loopback-u.

Ručno pokretanje iz korena projekta:

```sh
python -m pip install -e ".[dev]"
python -m onscreen
python -m pytest -q
```

`python -m onscreen --port 8080 --no-browser` bira fiksan port bez otvaranja browsera.
Opcioni integrisani browser test: `python tests/browser_integration.py`
(Playwright + Chromium potrebni samo za razvoj). Trenutna isporuka je source +
Windows `.cmd` launcher; samostalni `.exe` paket se ne generiše na Linux-u.

## Admin dashboard demo

Nakon pokretanja istog demo servera otvori **http://127.0.0.1:8080/dashboard.html**.
U demo režimu prikazuje dostavljeni statički pregled 20 batch-eva. U backend
Excel režimu koristi otvoreni workbook. Oba imaju ukupne pokazatelje,
pretragu, capture status filter i zbir filtriranih redova. Demo podaci su
izdvojeni u `frontend/dashboard-data.js`.

Zaseban frontend za osobu 2, po lokalnom browser modelu AudioLabelingTool-a.
HTML/CSS/JavaScript moduli, bez npm zavisnosti, CDN-a ili build koraka.

## Pokretanje

Na Windows-u pokreni **Launch Frontend Demo.cmd** (potreban je Python launcher),
pa otvori **http://127.0.0.1:8080** u browseru.

Ili iz ovog direktorijuma:

```sh
python -m http.server 8080 --bind 127.0.0.1 --directory frontend
```

Ne otvarati `index.html` direktno kao `file://`: interfejs koristi ES module.
Zatvaranje terminala zaustavlja demo server. Ako je port zauzet, odabrati drugi.

## Implementirano

- Filteri capture uređaja (OS + model) i replay ekrana (tip + model). Opcije se
  izvode iz aktivnog batch-a. NEXT zadržava filtere; promena batch-a ili dugme
  „Poništi filtere” ih resetuje. Napredak prati izabranu opremu. Demo batch_10
  ima Android/iOS i Monitor/Tablet kombinacije radi isprobavanja. Dnevni izveštaj
  ostaje za ceo projekat. Za pravi backend proširen je API ugovor.

- **Kopiraj dnevni izveštaj** na capture stranici: današnji sačuvani DONE zadaci
  u svim batch-evima projekta, prvi/poslednji timestamp, raspon u satima/minutima/
  sekundama i broj po batch-u. Datum se određuje po lokalnoj zoni browsera.
  Raspon uključuje pauze, nije aktivno radno vreme; jedan capture ne daje trajanje.
  U demo režimu koristi sačuvane browser podatke, a za pravi Excel zahteva
  `GET /api/reports/captures` iz API ugovora. Kopiranje zahteva localhost/HTTPS
  i dozvoljen clipboard pristup.

- Izbor batch-a i nastavak od prvog `TO DO` zadatka.
- Velika slika, scroll zoom, zoom dugmad, pointer drag/pan i Fit to screen.
- Fullscreen prikaz dokumenta; kontrole se pojavljuju na hover radi izlaska.
- Informacije: orijentacija telefona, OS/model, država, dokument i replay oprema.
- SHOW/HIDE INDEX preko iste slike. Original se ne menja.
- Novi zadatak resetuje zoom i sakriva indeks.
- NEXT čeka potvrdu adaptera pre promene zadatka; blokira ponovljene klikove.
- Greške učitavanja/čuvanja i retry; slika mora biti učitana pre završetka.
- Batch completion ekran i responsive raspored.
- Projektni dijalog sa Windows putanjama za stvarni backend.

Prečice: `+` / `-` zoom, `0` reset, `I` index, `F` fullscreen.
Dvoklik na viewer takođe resetuje prikaz. Nema NEXT prečice radi slučajnih završetaka.
Touch podržava pomeranje i zoom preko dugmadi; pinch gest nije implementiran.

## Demo i Excel režim

Podrazumevano se prikazuju **sintetičke SVG slike** i osam primer-zadataka u dva
batch-a. DEMO oznaka je stalno vidljiva. Demo NEXT čuva status/timestamp samo u
`localStorage` browsera, nikad u Excelu. Za restart demo podataka ukloniti ključ
`onscreen.demo.progress.v1` iz browser storage-a.

**Otvori projekat** koristi pravi API. Kada backend ne radi, dobija se greška;
nema tihog prelaska u demo niti lažne potvrde upisa u Excel.
Za direktno otvaranje projektnog dijaloga koristiti `/?mode=api`.

Excel učitavanje/čuvanje i lokalni source launcher implementirani su u backend-u.
Native file picker, launcher bez Python instalacije i sinhronizovani tablet
display ostaju naredna faza.
Frontend je responsive, ali sam responsive prikaz nije tablet sinhronizacija.

## Fajlovi

```text
frontend/
  index.html       radni ekran i projektni dijalog
  styles.css       lokalni stilovi i responsive raspored
  app.js           UI stanje, događaji i tok čuvanja
  viewer.js        učitavanje slike, zoom/pan i overlay
  api.js           stvarni API adapter i izdvojeni demo adapter
  core.js          statusi, napredak, transformacije i completion gate
  tests/           Node testovi bez dodatnih paketa
API_CONTRACT.md    dogovor za osobu 1
```

## Provere

Iz `frontend` direktorijuma, Node 18+:

```sh
node --test tests/core.test.js
node --check app.js
node --check viewer.js
node --check api.js
```

Opciona browser provera (razvojno okruženje sa Playwright Python paketom i
Chromium browserom): `python tests/browser_smoke.py`. Pokreće privremeni lokalni
server i proverava viewer, reset oznake, nastavak, završetak batch-a, mobilni
raspored i grešku/retry nad mock API-jem. Screenshot-i se čuvaju u sistemskom
temp folderu. Nije potreban Playwright za korišćenje aplikacije.

Provere izvedene tokom implementacije: 17 Node testova, 5 backend pytest
scenarija, Chromium demo smoke i integrisani browser/backend test sa stvarnim
privremenim XLSX fajlom. Praktičan capture telefonom i ciljni Windows setup
ostaju za pilot na korisničkoj opremi.
#   D o c s - C a p t u r e - T o o l  
 