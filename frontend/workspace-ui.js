const themeButton = document.getElementById('theme-toggle');
function renderThemeButton() {
  const dark = document.documentElement.dataset.theme === 'dark';
  themeButton.textContent = dark ? '☀ Light mode' : '☾ Dark mode';
  themeButton.setAttribute('aria-pressed', String(dark));
}
themeButton.addEventListener('click', () => {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('onscreen.theme', theme); } catch { /* Still apply for this page. */ }
  renderThemeButton();
});
renderThemeButton();
window.addEventListener('storage', event => {
  if (event.key === 'onscreen.theme' && ['light', 'dark'].includes(event.newValue)) {
    document.documentElement.dataset.theme = event.newValue;
    renderThemeButton();
  }
});

const dashboard = Boolean(document.getElementById('batch-rows'));
const help = document.createElement('dialog');
help.className = 'help-dialog';
help.id = 'help-dialog';
help.setAttribute('aria-labelledby', 'help-title');
help.innerHTML = `
  <div class="help-heading"><h2 id="help-title">Kako se koristi ${dashboard ? 'dashboard' : 'capture workspace'}</h2><button class="help-close" type="button" aria-label="Zatvori uputstvo">×</button></div>
  ${dashboard ? `
    <ol>
      <li><strong>Ukupni pokazatelji</strong> prikazuju ceo projekat.</li>
      <li><strong>Pretraga i Capture status</strong> sužavaju tabelu. Zbir na dnu prati izabrane filtere.</li>
      <li><strong>Kopiraj izveštaj</strong> kopira pregled celog projekta za lepljenje pomoću Ctrl+V.</li>
      <li><strong>Otvori capture workspace</strong> vraća na rad sa slikama.</li>
    </ol><p>U demo režimu podaci su statički. U Excel režimu prikazan je otvoreni projekat; osveži stranicu za novo stanje. Nepoznate label/validation vrednosti označene su crticom.</p>` : `
    <ol>
      <li><strong>Otvori projekat</strong> za izbor Excel fajla i foldera sa batchevima ili isprobaj demo.</li>
      <li><strong>Izaberi batch i opremu.</strong> Filteri capture uređaja i replay ekrana važe zajedno. Poništi filtere vraća sve zadatke batch-a.</li>
      <li><strong>Proveri instrukcije ispod slike:</strong> položaj telefona, uređaj, državu, dokument i replay ekran.</li>
      <li><strong>Zumiraj</strong> točkićem ili +/− i prevuci sliku da je pomeriš. Fit to screen ili dvoklik vraća prikaz.</li>
      <li><strong>Show index</strong> dodaje broj preko iste slike kada snimaš stranu koja nije bitna. Prevuci oznaku mišem ili dodirom na željeno mesto unutar slike. Klizač <strong>Veličina indeksa</strong> menja veličinu od 50% do 200%; izbor ostaje tokom rada do osvežavanja stranice. Hide index ga sklanja; original se ne menja. Nova slika vraća oznaku u početni položaj.</li>
      <li><strong>NEXT</strong> potvrđuje završen capture. Sledeći zadatak se otvara nakon uspešnog čuvanja; indeks se sakriva.</li>
      <li><strong>Kopiraj dnevni izveštaj</strong> daje današnji broj zadataka, prvo i poslednje vreme i raspon za sve batcheve projekta. Raspon uključuje pauze.</li>
    </ol>
    <p><strong>Prečice:</strong> +/− zoom · 0 reset · I index · F fullscreen · Esc izlaz iz fullscreen-a.</p>
    <p>Demo čuva napredak samo u ovom browseru. Za stvarni upis u Excel potreban je povezan backend. Pri nastavku se otvara prvi odgovarajući TO DO zadatak.</p>`}
  <p class="help-note">Dark mode menja interfejs. Slika dokumenta i bela podloga indeksa ostaju u originalnim bojama.</p>`;
document.body.append(help);
const helpButton = document.createElement('button');
helpButton.className = 'help-trigger';
helpButton.type = 'button';
helpButton.textContent = '? Help';
helpButton.setAttribute('aria-haspopup', 'dialog');
helpButton.setAttribute('aria-controls', help.id);
helpButton.addEventListener('click', () => help.showModal());
help.querySelector('.help-close').addEventListener('click', () => help.close());
help.addEventListener('close', () => helpButton.focus({ preventScroll: true }));
document.body.append(helpButton);
