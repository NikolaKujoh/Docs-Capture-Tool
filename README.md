# OnScreen Capture Tool

Lokalna aplikacija za prikaz dokumenata i praćenje capture zadataka iz Excel fajla.
Operator bira batch, prikazuje dokument i potvrđuje završen capture. Aplikacija
upisuje status `DONE` i vreme završetka direktno u izabrani `.xlsx` fajl.

Backend je napisan u Pythonu uz FastAPI i openpyxl. Interfejs koristi HTML, CSS
i JavaScript module, bez npm zavisnosti, CDN-a ili build koraka.

## Sadržaj

- [Mogućnosti](#mogućnosti)
- [Pokretanje aplikacije](#pokretanje-aplikacije)
- [Priprema podataka](#priprema-podataka)
- [Rad sa zadacima](#rad-sa-zadacima)
- [Dashboard i izveštaji](#dashboard-i-izveštaji)
- [Demo režim](#demo-režim)
- [Čuvanje podataka](#čuvanje-podataka)
- [Razvoj i provere](#razvoj-i-provere)
- [Struktura projekta](#struktura-projekta)

## Mogućnosti

- Izbor batch-a i nastavak od prvog zadatka sa statusom `TO DO`.
- Filteri po capture uređaju (OS i model) i replay ekranu (tip i model).
- Zamena capture uređaja u preostalim `TO DO` zadacima aktivnog batch-a.
- Prikaz slike sa zumiranjem, pomeranjem i fullscreen režimom.
- Prikaz capture indeksa preko slike, uz podešavanje veličine oznake.
- Instrukcije za orijentaciju telefona, uređaj, državu i tip dokumenta.
- Dashboard sa pregledom napretka i kopiranje dnevnog capture izveštaja.
- Svetla i tamna tema, pomoć u interfejsu i raspored prilagođen manjim ekranima.

## Pokretanje aplikacije

Potreban je **Python 3.10+** i browser sa podrškom za JavaScript module.
Za prvu instalaciju potreban je pristup Python package index-u.

### Windows

1. Pokreni [`Setup Backend.cmd`](Setup%20Backend.cmd). Skripta kreira lokalni
   `.venv` i instalira pakete. Ovaj korak je potreban pri prvom pokretanju.
2. Pokreni [`Launch OnScreen.cmd`](Launch%20OnScreen.cmd). Browser se otvara
   na slobodnom lokalnom portu.
3. U dijalogu **Otvori projekat** izaberi `.xlsx` fajl i folder sa slikama.
   Koristi **Browse** ili unesi putanje ručno. Izbor se odnosi na računar
   na kojem radi backend; Browse zahteva dostupan Tkinter i grafičko okruženje.
4. Po potrebi unesi naziv sheet-a i klikni **Validiraj i otvori**.
   Ako naziv nije unet, učitava se prvi sheet.

**Aplikacija menja izabrani Excel fajl.** Ako želiš zaseban radni fajl,
napravi kopiju pre otvaranja projekta.

Za zaustavljanje servisa pritisni `Ctrl+C` u terminalu.

### Ručno pokretanje

Iz korena projekta, u aktivnom Python virtuelnom okruženju:

```sh
python -m pip install -e .
python -m onscreen
```

Za fiksan port i pokretanje bez automatskog otvaranja browsera:

```sh
python -m onscreen --port 8080 --no-browser
```

Zatim otvori <http://127.0.0.1:8080/?mode=api>.
Servis sluša samo na lokalnoj adresi `127.0.0.1`.

## Priprema podataka

Primer organizacije fajlova:

```text
CaptureData/
├── input.xlsx
└── images/
    ├── batch_10/
    │   ├── document_001.png
    │   └── document_002.jpg
    └── batch_11/
        └── document_003.png
```

Za ovaj primer izaberi `input.xlsx` i folder `images`. Kao folder sa slikama
možeš izabrati i pojedinačni batch folder, na primer `batch_10`.

### Excel kolone

Prvi red izabranog sheet-a mora da sadrži sledeća zaglavlja.
Kolone se prepoznaju po nazivu, nezavisno od redosleda.

| Grupa | Obavezna zaglavlja |
| --- | --- |
| Identitet zadatka | `unique_capture_index`, `batch`, `user_id-document_view` |
| Dokument | `issuing_country`, `doc_type`, `orientation` |
| Capture uređaj | `device_os`, `operational_device_model` |
| Replay ekran | `replay_device_type`, `replay_device_model` |
| Napredak | `status`, `timestamp` |
| Ostali podaci | `notes`, `trustx_image`, `instance_ID` |

`unique_capture_index` mora biti jedinstven u okviru batch-a. Polja
`unique_capture_index`, `batch` i `user_id-document_view` ne smeju biti prazna
niti sadržati formule.

### Povezivanje slika

Vrednost `user_id-document_view` povezuje red sa nazivom slike u odgovarajućem
batch-u. Na primer, `document_001` odgovara fajlu `batch_10/document_001.png`.
Naziv može da sadrži i ekstenziju.

Podržane ekstenzije su `.jpg`, `.jpeg`, `.png`, `.webp`, `.bmp` i `.gif`.
Podržana je i organizacija u kojoj je vrednost `user_id-document_view` naziv
podfoldera sa jednom slikom. Nedostajuće ili višestruko poklapanje sprečava
završavanje tog zadatka.

## Rad sa zadacima

1. Izaberi batch. Aplikacija prikazuje prvi preostali `TO DO` zadatak.
2. Po potrebi izaberi filtere capture uređaja i replay ekrana.
3. Proveri instrukcije i prikaži dokument u odgovarajućoj veličini.
4. Dugmetom **Show index** prikaži capture indeks preko iste slike.
5. Nakon fotografisanja klikni **NEXT**. Sledeći zadatak se otvara tek kada
   backend potvrdi da su status i timestamp sačuvani.

NEXT je dostupan tek kada je slika učitana i blokira ponovljene klikove tokom
čuvanja. Kod greške zadatak ostaje otvoren i dostupan je ponovni pokušaj.
Nova slika resetuje zoom i sakriva indeks.

Filteri važe istovremeno, a prikazani napredak prati izabranu opremu.
NEXT zadržava filtere; promena batch-a ili **Poništi filtere** ih resetuje.
**Zameni uređaj** menja OS i model samo u preostalim `TO DO` zadacima aktivnog
batch-a koji koriste izabrani stari uređaj. Završeni zadaci ostaju nepromenjeni.

Osvežavanje stranice i povratak sa dashboard-a koriste trenutno otvoreni
projekat. Posle ponovnog pokretanja servisa otvori isti radni Excel fajl
da nastaviš rad.

### Kontrole prikaza

| Kontrola | Radnja |
| --- | --- |
| Točkić miša ili `+` / `-` | Uvećavanje i umanjivanje |
| Prevlačenje slike | Pomeranje prikaza |
| `0`, dvoklik ili **Fit to screen** | Reset prikaza |
| `I` | Prikaz ili skrivanje indeksa |
| `F` | Fullscreen prikaz |

NEXT nema prečicu na tastaturi kako bi se izbeglo slučajno završavanje zadatka.
Na touch ekranima dostupni su pomeranje i zoom preko dugmadi; pinch gest nije
implementiran.

## Dashboard i izveštaji

**Dashboard** otvara pregled batch-eva sa ukupnim pokazateljima, pretragom,
capture status filterom i zbirom filtriranih redova.

U Excel režimu izvor je trenutno otvoreni workbook. Label, validation i
recapture vrednosti prikazane su kao nedostupne jer za te faze nije definisan
izvor podataka. Osveži dashboard za novo stanje. Pregled obuhvata otvoreni
projekat, bez agregacije podataka sa drugih računara.

**Kopiraj dnevni izveštaj** obuhvata današnje sačuvane `DONE` zadatke iz svih
batch-eva projekta, nezavisno od aktivnih filtera. Izveštaj sadrži broj capture-a,
broj po batch-u, prvi i poslednji timestamp i vremenski raspon između njih.
Taj raspon uključuje pauze i ne predstavlja aktivno radno vreme.

Dan se određuje prema lokalnoj vremenskoj zoni browsera. Kopiranje zahteva
localhost ili HTTPS i dozvoljen pristup clipboard-u.

## Demo režim

Demo radi bez backend-a i Excel fajla. Sadrži sintetičke SVG slike i osam
primer-zadataka u dva batch-a, uz stalno vidljivu oznaku **DEMO**.

Na Windows-u pokreni [`Launch Frontend Demo.cmd`](Launch%20Frontend%20Demo.cmd),
ili iz korena projekta pokreni:

```sh
python -m http.server 8080 --bind 127.0.0.1 --directory frontend
```

- Radni ekran: <http://127.0.0.1:8080>
- Dashboard: <http://127.0.0.1:8080/dashboard.html>

Ne otvaraj `index.html` direktno preko `file://`, jer interfejs koristi ES module.
Ako je port zauzet, izaberi drugi. `Ctrl+C` zaustavlja demo server.

Demo NEXT čuva status i timestamp samo u `localStorage` browsera. Za reset
napretka obriši ključ `onscreen.demo.progress.v1`. Demo dashboard koristi
zaseban statički pregled 20 batch-eva iz
[`frontend/dashboard-data.js`](frontend/dashboard-data.js).

**Otvori projekat** zahteva pravi backend. Ako backend nije dostupan,
interfejs prikazuje grešku; nema automatskog prelaska u demo režim.

## Čuvanje podataka

Excel je jedini izvor capture statusa. Nema Jire ili centralne baze.

- Upisi se serijalizuju, a projekat se zaključava pomoćnim `.onscreen.lock`
  fajlom. Čuvanje prvo pravi privremeni XLSX, pa zamenjuje ciljni fajl.
- Nemoj paralelno menjati otvoreni workbook u drugoj aplikaciji. Ako je fajl
  izmenjen spolja, ponovo otvori projekat. Excel `~$` lock fajl i nedostatak
  dozvole za upis blokiraju čuvanje.
- Ponovljena potvrda istog `DONE` zadatka ne menja timestamp.
- Izvorne slike se šalju bez rekompresije i promene formata. Zoom i indeks
  menjaju samo prikaz u browseru, ne originalnu sliku.
- Timestamp se čuva kao ISO tekst sa vremenskim offset-om. Podrazumevana zona
  backend-a je `Europe/Belgrade`; API pri otvaranju prihvata polje `timezone`.
  Excel datumi bez vremenske zone tumače se u toj zoni.

Podržan je `.xlsx`, ne `.xls` ili `.xlsm`. openpyxl čuva standardne formule
i stilove, ali ne računa formule niti garantuje očuvanje svih naprednih Excel
objekata. Pre redovnog rada proveri ponašanje na kopiji stvarnog workbook-a.

Windows log se nalazi na `%LOCALAPPDATA%\OnScreenCaptureTool\onscreen.log`.
Na sistemima bez `LOCALAPPDATA` koristi se
`~/.local/state/OnScreenCaptureTool/onscreen.log`.

Trenutno se aplikacija pokreće iz izvornog koda pomoću Pythona ili Windows
`.cmd` skripti. Samostalni launcher bez Python instalacije i sinhronizovani
tablet prikaz nisu implementirani.

## Razvoj i provere

### Backend

Iz korena projekta, u aktivnom virtuelnom okruženju:

```sh
python -m pip install -e ".[dev]"
python -m pytest -q
```

API dokumentacija dostupna je na `/docs` pokrenutog backend-a. Zahtevi za upis
koriste token iz `/api/session` u zaglavlju `X-OnScreen-Token`; frontend ga
dobija automatski. Detalji ruta i formata podataka su u
[`API_CONTRACT.md`](API_CONTRACT.md).

### Frontend

Potreban je Node.js 18+. Iz `frontend` direktorijuma pokreni sve Node testove:

```sh
npm test
```

Instalacija npm paketa nije potrebna. Za proveru sintakse glavnih modula:

```sh
node --check app.js
node --check viewer.js
node --check api.js
```

### Browser provere

Opcione browser provere zahtevaju Playwright i Chromium. Instalacija i
pokretanje iz korena projekta:

```sh
python -m pip install playwright
python -m playwright install chromium
python frontend/tests/browser_smoke.py
python tests/browser_integration.py
```

Smoke provera pokreće privremeni demo server i proverava interfejs uz mock API.
Integraciona provera koristi stvarni backend i privremeni XLSX fajl.
Playwright nije potreban za korišćenje aplikacije.

## Struktura projekta

```text
onscreen/
  __main__.py            lokalni server, browser i logovanje
  web.py                 FastAPI rute i izbor fajlova
  project.py             Excel projekat, slike i čuvanje
frontend/
  index.html             radni ekran i projektni dijalog
  app.js                 UI stanje i tok rada sa zadacima
  api.js                 API i demo adapteri
  viewer.js              slika, zoom, pomeranje i indeks
  core.js                statusi, napredak i transformacije
  equipment-filters.js   filteri capture i replay opreme
  daily-report.js        dnevni capture izveštaj
  dashboard.html         pregled batch-eva
  dashboard*.js          podaci, prikaz i izveštaji dashboard-a
  theme.js               izbor teme
  workspace-ui.*         pomoć i dodatne UI kontrole
  *.css                  stilovi i responsive raspored
  tests/                 Node testovi i browser smoke provera
tests/                   backend i integracione provere
API_CONTRACT.md          API rute i formati podataka
pyproject.toml           Python paketi i konfiguracija testova
```
