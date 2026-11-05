# API ugovor — osoba 1 / osoba 2

Predloženi ugovor implementiran je u `frontend/api.js`. Backend treba da servira
frontend i `/api/` na istom origin-u. Putanje su relativne kako bi interfejs radio
i ispod prefiksa. Adapter je jedino mesto za naknadno prilagođavanje ruta.

## Implementirani lokalni backend

`python -m onscreen` služi frontend i API na istom origin-u. Pre write zahteva
GET `/api/session` vraća `token` i `project` (null ako nije otvoren).
Token slati kroz `X-OnScreen-Token`. GET `/api/session` omogućava nastavak
frontend-a nakon reload-a; novi servis proces traži ponovno otvaranje workbook-a.

Open dodatno prima `timezone` (podrazumevano Europe/Belgrade), vraća sheet_name,
workbook_path i warnings za nedostajuće/nejasne slike. Ciljni Excel se menja
direktno, ne pravi se automatska radna kopija. Nema Jira endpoint-a.

GET `/api/reports/dashboard` vraća `{batches, source, updated_at, workbook_path}`.
Batch red ima `{name,total,captured,labelled,validated,recaptures}`; poslednja
tri su `null` dok nije definisan izvor tih faza, ne izvedeni iz trustx_image.

## 1. Otvaranje projekta

`POST /api/project/open`

```json
{
  "workbook_path": "C:\\CaptureData\\input.xlsx",
  "image_root": "C:\\CaptureData\\images",
  "sheet_name": null
}
```

Odgovor posle uspešne validacije:

```json
{ "batches": ["batch_10", "batch_11"] }
```

Putanje se odnose na računar na kojem backend radi. Excel čuva backend, ne browser.
Ne menjati već otvoreni projekat ako validacija novog projekta ne uspe.

## 2. Prvi TO DO u batch-u / nastavak

`GET /api/batches/{batch}/current`

```json
{
  "task": {
    "task_id": "opaque-internal-id",
    "revision": "workbook-revision-1",
    "unique_capture_index": "3146",
    "batch": "batch_10",
    "issuing_country": "usa",
    "doc_type": "driver_license",
    "user_id-document_view": "048589ff-fa1d-4935-a89f-286a5ad1bb8d-front",
    "device_os": "Android",
    "operational_device_model": "Google Pixel 8a",
    "replay_device_type": "Monitor",
    "replay_device_model": "DELL P2722H",
    "orientation": "Portrait",
    "status": "TO DO",
    "image_url": "/api/images/opaque-image-id"
  },
  "progress": { "total": 26, "done": 0, "pending": 26 }
}
```

Završen batch vraća `task: null` i stvarni progress. `pending` broji TO DO,
`done` broji DONE; drugi statusi se ne tretiraju automatski kao DONE.
Backend određuje redosled. `unique_capture_index` prenositi kao string.
`image_url` treba da bude dostupan istom browseru i vezan za dozvoljeni projekat.
Servirati slike i odgovore bez zastarelog keša. Ne vraćati proizvoljne file:// putanje.

## 3. NEXT

`POST /api/tasks/{task_id}/complete`

```json
{ "batch": "batch_10", "revision": "workbook-revision-1" }
```

Backend:

1. Proverava identitet zadatka, batch i očekivanu reviziju.
2. Upisuje timestamp završetka i `status = DONE`, čuvajući ostale podatke.
3. Pouzdano čuva workbook; tek nakon uspeha potvrđuje zahtev.
4. Vraća isti format kao GET current: sledeći TO DO i ažuriran progress.

Timestamp određuje backend, ne sat browsera. Ponovljen zahtev za već završen
isti task mora biti idempotentan: ne završava naredni red i ne menja timestamp.
Ovo je važno i ako je server sačuvao Excel, ali je HTTP odgovor izgubljen.

## 4. Greške

Neuspeh vraća ne-2xx i:

```json
{ "detail": "Excel fajl je otvoren u drugoj aplikaciji. Zatvori ga i pokušaj ponovo." }
```

Primeri: 409 za izmenjen/zaključan workbook, 422 za nevalidne podatke, 404 za
nestali fajl. Interfejs zadržava zadatak i nudi retry. Save greška ne sme da se
vrati kao 200 sa tekstom upozorenja.

## 5. Dnevni capture izveštaj

`GET /api/reports/captures`

Vraća sačuvane zadatke iz **celog otvorenog projekta**, ne samo aktivnog batch-a
ili trenutne sesije. Jedan zapis po zadatku, bez duplikata za ponovljeni NEXT:

```json
{
  "records": [
    { "task_id": "opaque-internal-id", "batch": "batch_10", "status": "DONE", "timestamp": "2026-10-29T09:15:00+01:00" }
  ]
}
```

Izvor je uspešno sačuvani Excel. Excel datume normalizovati u ISO 8601 sa
vremenskom zonom (`Z` ili offset); browser ne tumači Excel serijske brojeve.
DONE zapise bez validnog vremena vratiti sa `timestamp: null`: izveštaj ih
izdvaja kao neuračunate. Frontend bira današnji datum po lokalnoj zoni browsera,
broji DONE zadatke i računa razliku između najranijeg i najkasnijeg timestamp-a.
Izveštaj uključuje zonu, broj po batch-u i napomenu da raspon uključuje pauze.
Jedan zadatak = jedan capture za ovaj izveštaj (ne pojedinačne fotografije strana).

## UI pravila

### Filteri opreme

GET current prihvata opcione query parametre `capture_device` i `replay_screen`.
Vrednosti su JSON nizovi od dva stringa (URL encoded), npr.
`["Android","Google Pixel 8a"]` i `["Monitor","DELL P2722H"]`.
Capture par je `device_os` + `operational_device_model`, replay par je
`replay_device_type` + `replay_device_model`; stringovima ukloniti okolne razmake.
Prazan/izostavljen filter znači svu opremu. Oba filtera važe istovremeno (AND).

GET current i POST complete vraćaju `task` i `progress` **za filtrirani skup**,
uz `filter_options` za **ceo batch**, uključujući DONE redove:

```json
{
  "filter_options": {
    "capture_devices": [{ "value": "[\"Android\",\"Google Pixel 8a\"]", "label": "Android · Google Pixel 8a" }],
    "replay_screens": [{ "value": "[\"Monitor\",\"DELL P2722H\"]", "label": "Monitor · DELL P2722H" }]
  }
}
```

POST complete dodatno prihvata `filters: {capture_device, replay_screen}` kada
je filter aktivan. Identitet task-a određuje koji se red završava; filteri samo
određuju sledeći zadatak i zbir. Nema podudaranja: `task: null`, total/done/pending
su nula. Sve je završeno u izboru: `task: null`, ali total ostaje broj tih redova.
Promena batch-a resetuje filtere; NEXT ih zadržava. Dnevni izveštaj i dalje
obuhvata ceo projekat, nezavisno od izbora opreme.

Ako backend ne pošalje `filter_options`, dropdown filteri su onemogućeni.

- Backend ne vodi front/back korake: jedan red daje jednu izvornu sliku.
- SHOW INDEX samo menja prikaz istog dokumenta i ne šalje zahtev za upis.
- Na svakoj novoj slici oznaka je sakrivena, prikaz resetovan.
- NEXT zahteva učitanu sliku i backend potvrdu čuvanja.
- Kolone `notes`, `trustx_image`, `instance_ID` frontend ne menja.
- OCR i automatsko popunjavanje `trustx_image` nisu deo ovog MVP-a.

## Zamena capture uređaja

`POST /api/devices/swap` — `{batch, old_device, device_os, model, filters?}`.
`old_device` je vrednost iz `filter_options.capture_devices`; `device_os` je
`Android` ili `iOS`. Menja `device_os` i `operational_device_model` samo u
preostalim TO DO redovima tog batch-a sa starim uređajem (DONE ostaje). Vraća
isti format kao GET current. 409 ako nema takvih redova, 422 za nevalidan OS/model.

## Skip, Back i Undo

- `POST /api/tasks/{task_id}/skip` — `{batch, filters?}`. Zadatak ostaje `TO DO`
  i ide iza ostalih preostalih (kada su svi preskočeni, prvi se vraća najstariji
  skip). Ništa se ne upisuje u Excel; lista preskočenih živi u memoriji
  backend-a do ponovnog pokretanja. 409 ako zadatak nije `TO DO`.
- `GET /api/batches/{batch}/current?focus={task_id}` — vraća taj zadatak (bilo
  kog statusa) umesto prvog `TO DO`; koristi ga Back. 404 ako zadatak nije u
  filtriranom skupu. Istoriju za Back vodi browser (nestaje pri osvežavanju,
  promeni batch-a ili filtera).
- `POST /api/tasks/{task_id}/undo` — `{batch, revision, filters?}`. `DONE` →
  `TO DO`, timestamp se briše, čuva se u Excel. Odgovor je isti kao GET current
  sa `focus` na tom zadatku. Idempotentno za `TO DO`; 409 za zastareo
  `revision`.
- `task.skipped` (bool) označava preskočen zadatak u odgovoru.
