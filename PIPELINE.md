# Pipeline de securitate — SAST, DAST, SCA, detectarea secretelor

Pipeline-ul rulează pe **GitHub Actions** (`.github/workflows/security.yml`) la push pe `main` și `fixed`, la pull request către `main`, săptămânal și manual.

## Etape

| Etapă | Unealtă | Ce verifică | Eșuează când |
|---|---|---|---|
| Detectarea secretelor | TruffleHog | fișierele curente (barieră) și istoricul Git (raport informativ) | există un secret în codul curent |
| SCA — dependențe | npm audit + Trivy (fs) | `package-lock.json` | există vulnerabilități cu severitate high sau critică |
| SCA — imagine | Trivy (image) | imaginea Docker construită din `Dockerfile` | există vulnerabilități HIGH sau CRITICAL cu remediere disponibilă |
| SAST | SonarQube Cloud | codul sursă | condiția de calitate a platformei nu e îndeplinită sau există probleme de securitate deschise pe tot codul |
| DAST | OWASP ZAP (baseline + full scan) | aplicația pornită pe `localhost:3000`, ruta `/login` | există alerte neexceptate |

Sarcina **Sumar** afișează rezultatul fiecărei etape și eșuează dacă oricare dintre ele a eșuat.

## Ramuri

| Ramură | Conținut | Rezultat pipeline |
|---|---|---|
| `main` | aplicația vulnerabilă | eșec |
| `fixed` | aplicația corectată | succes |

Fișierele care definesc pipeline-ul sunt identice pe ambele ramuri: `.github/workflows/security.yml`, `sonar-project.properties`, `.trufflehog-exclude.txt`.

## Configurare

GitHub → Settings → Secrets and variables → Actions:

- `SONAR_TOKEN` — tokenul generat în SonarQube Cloud
- `SONAR_HOST_URL` — ex. `https://sonarcloud.io`

## Alerte ZAP exceptate

Fișierul de reguli ZAP este generat în timpul rulării. Sunt exceptate alertele cu ID-urile `10049`, `10055`, `10094`, `10111`, `10112`, `10031`, `90004`, `90005` și `90027`.
