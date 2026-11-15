# TaskFlow — varianta securizata

Ramura `fixed` conține aplicația cu vulnerabilitățile din ghidul de pe ramura `main` corectate. Atacurile descrise acolo nu mai funcționează pe această ramură.

Rulare locală: `npm install && node server.js` → http://localhost:3000

## Conturi

| Email | Parolă | Rol |
|---|---|---|
| `admin@taskflow.local` | `Admin123!` | admin |
| `demo@taskflow.local` | `password123` | user |

## Corecturi

| Nr. | Vulnerabilitate | Corecție |
|---|---|---|
| 1 | SQL Injection | interogări parametrizate |
| 2 | XSS reflectat | escapare la afișare, politică CSP |
| 3 | XSS stocat | escapare în comentarii, politică CSP |
| 4 | IDOR | verificarea proprietarului în interogări |
| 5 | Mass Assignment | rolul este stabilit de server |
| 6 | Path Traversal | listă de șabloane permise |
| 7 | Nume de fișier nesanitizat | extensii permise, nume generat de server, limită de dimensiune |
| 8 | Command Injection | `execFile` și validarea parametrilor |
| 9 | SSRF | validarea protocolului și a adresei, fără redirecționări |
| 10 | Code Injection (`eval`) | parser aritmetic |
| 11 | Prototype Pollution | eliminarea combinării nesigure |
| 12 | MD5 fără salt | `scrypt` cu salt |
| 13 | Cookie nesigur, CORS | `HttpOnly`, `SameSite`, CORS eliminat |
| 14 | CSRF | token sincronizat, verificarea `Origin` și `Referer` |
| 15 | Stack trace expus | handler de erori generic |
| 16 | Dependențe vulnerabile | pachete eliminate sau actualizate |
| 17 | Secrete în cod | variabile de mediu, `.env` exclus din repo |

Pipeline-ul de securitate este descris în `PIPELINE.md`.
