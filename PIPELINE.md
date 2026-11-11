# Pipeline de securitate — SAST, DAST, SCA, secret scanning

Două variante echivalente, gata de folosit:
- **GitHub Actions** → `.github/workflows/security.yml`
- **GitLab CI** → `.gitlab-ci.yml`

Ambele rulează aceleași 5 etape pe aplicația TaskFlow:

| Etapă | Unealtă | Ce scanează |
|---|---|---|
| Secret scanning | TruffleHog | tot repo-ul + istoricul git — caută chei API/parole hardcodate |
| SCA — dependențe | npm audit + Trivy (filesystem) | `package.json`/`package-lock.json` — CVE-uri în pachete |
| SCA — imagine | Trivy (image) | imaginea Docker construită din `Dockerfile` — CVE-uri din sistemul de bază |
| SAST | SonarQube | codul sursă — SQL injection, `eval()`, command injection, secrete hardcodate, cod nesigur |
| DAST | OWASP ZAP (baseline) | aplicația pornită efectiv pe `localhost:3000` — headere lipsă, cookie-uri nesigure, CSRF absent |

---

## Configurare necesară înainte de prima rulare

### SonarQube (singura etapă care cere configurare manuală)

Trebuie un server SonarQube (propriu, sau gratuit pe [SonarCloud](https://sonarcloud.io)) și un token de acces.

**GitHub Actions** → Settings → Secrets and variables → Actions → adaugă:
- `SONAR_TOKEN` — tokenul generat din SonarQube/SonarCloud
- `SONAR_HOST_URL` — ex: `https://sonarcloud.io` sau URL-ul serverului propriu

**GitLab CI** → Settings → CI/CD → Variables → adaugă aceleași două, cu „Protect variable" debifat dacă testezi pe branch-uri neprotejate.

Fără aceste două variabile, job-ul `sast` eșuează cu eroare de autentificare — restul pipeline-ului (secret scan, SCA, DAST) rulează normal, independent de Sonar.

### Restul etapelor
Nu cer nimic suplimentar — rulează din prima pe un runner standard (`ubuntu-latest` / Docker executor cu `docker:24.0-dind` pentru GitLab).

---

## Testare locală, înainte de push (recomandat)

Rulează-le pe rând din rădăcina proiectului, ca să vezi rezultatele înainte să le aștepți în CI:

```bash
# 1) Secret scanning
docker run --rm -v "$(pwd):/repo" trufflesecurity/trufflehog:latest filesystem /repo

# 2) SCA — dependențe
npm install
npm audit
docker run --rm -v "$(pwd):/repo" aquasec/trivy:latest fs --scanners vuln,secret,misconfig /repo

# 3) SCA — imagine Docker
docker build -t taskflow:scan .
docker run --rm aquasec/trivy:latest image taskflow:scan

# 4) SAST — necesită un server SonarQube pornit local (sau SonarCloud)
docker run --rm -e SONAR_HOST_URL=http://host.docker.internal:9000 -e SONAR_TOKEN=<tokenul tău> \
  -v "$(pwd):/usr/src" sonarsource/sonar-scanner-cli

# 5) DAST — pornește aplicația într-un terminal, apoi rulează ZAP în altul
node server.js
docker run --network host -t zaproxy/zap-stable zap-baseline.py -t http://localhost:3000/login -a
```

---

## Ce să te aștepți să vezi (pe scurt)

- **TruffleHog** → găsește chei în `.env` și `config.js` (AWS, Stripe, SendGrid, JWT secret).
- **npm audit / Trivy fs** → CVE-uri pe `lodash@4.17.4`, `jsonwebtoken@8.3.0`, `request@2.81.0`, `moment@2.19.3`, `multer@1.3.0`, `xml2js@0.4.19`, `serialize-javascript@1.4.0`.
- **Trivy image** → CVE-uri suplimentare din sistemul de bază al imaginii (`node:14`, deja învechită).
- **SonarQube** → Security Hotspots pe query-urile SQL concatenate, `eval()`, `exec()`, MD5, JWT fără expirare.
- **OWASP ZAP** → alerte pe headere de securitate lipsă (CSP, X-Frame-Options, HSTS), cookie-uri fără `Secure`/`HttpOnly`, CSRF absent. Scanarea baseline e **neautentificată** (nu are cont de login), deci nu ajunge să testeze paginile din spatele lui `/login` — pentru XSS-urile din `/tasks` sau path traversal, ai nevoie de un scan autentificat (context ZAP cu sesiune salvată) sau de testare manuală, conform `README.md`.

Toate cele 17 vulnerabilități și cum le exploatezi manual sunt documentate în `README.md` — pipeline-ul de aici le detectează automat, dar nu "le arată" exploatarea pas cu pas, doar semnalează unde sunt.
