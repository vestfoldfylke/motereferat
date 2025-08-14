# motereferat
Nodejs scripts for handling motereferats from SMART and Enable

# SMART

## Oppsett

### Sertifikat
Enten bestill et sertifikat hvis du er av den rike og sikre typen, eller opprett et i f. eks Azure Keyvault hvis du har tilgang på det, eller bare mekk et via openssl:

#### Lag selv
- Om du ikke sitter på unix - bruk wsl på Windows
- Først lager du public cert med private key (det er samma driten hva du setter som passord fordi Microsoft...):
```bash
openssl req -newkey rsa:2048 -nodes -keyout ./cert/private_.key -x509 -days 365 -out ./cert/public.pem -subj '/CN=motereferat\/C={countryCode}/ST={state}/O={organization}' -passout pass:{someSuperSecretPassword}
```
- Fordi Microsoft er smart, må du slå sammen public.pem og private.key til en fil slik:
```
-----BEGIN CERTIFICATE-----
jdklsjfkdlsjfkldsf.....
-----END CERTIFICATE-----

-----BEGIN PRIVATE KEY-----
skjfhpweofwoejfldksf...
-----END PRIVATE KEY-----
```
- Lagre som **client_auth.pem**

- Så laster du opp public.pem til app registreringen

- Dersom du ønsker en .cer av public key av en eller annen grunn:
```bash
openssl x509 -in ./cert/public.pem -outform pem -outform der -out ./cert/public.cer
```

- Hvis du vil ha en pfx av det, siden [noe av dokumentasjonen sier du kan bruke det](https://github.com/Azure/azure-sdk-for-net/blob/main/sdk/identity/Azure.Identity/samples/ClientCertificateCredentialSamples.md), men du MÅ bruke [pem/key kombo inntil videre i nodejs uansett](https://learn.microsoft.com/en-us/javascript/api/@azure/identity/clientcertificatecredential?view=azure-node-latest)
```bash
openssl pkcs12 -export -in ./cert/public.pem -inkey ./cert/private.key -out ./cert/motereferat_client_auth.pfx -password pass:{super-secret}
```

### Config
- Opprett en .env fil med følgende verdier
```bash
# Azure Identity authentication
AZURE_CLIENT_ID="<client id fra app registration>"
AZURE_TENANT_ID="<tenant id fra app registration>"
AZURE_CLIENT_CERTIFICATE_PATH=./cert/client_auth.pem
AZURE_LOG_LEVEL=verbose # Optional. For debugging auth
SHAREPOINT_TENANT_NAME="<navnet på tenant (det før .sharepoint.com)>"

# Archive API
ARCHIVE_API_SCOPE="scope for å arkivere mot arkiv-api"
ARCHIVE_API_URL="api-url til arkiv-api"

# PDF API
PDF_API_URL="api-url til pdf-api"
PDF_API_KEY="api-nøkkel til pdf-api"

# STATISTICS API
STATISTICS_API_URL="api-url til stats-api"
STATISTICS_API_KEY="api-nøkkel til stats-api"

# OPTIONAL VALUES, se default i ./config.js
SMART_READY_FOR_ARCHIVE_STATUSES="<kommaseparert liste med statuser som skal arkiveres>"
SMART_MAX_MEETINGS_PER_ARENA_PER_RUN="1" # Hvor mange møter skal arkiveres per arena av gangen
SMART_RETRY_INTERVAL_MINUTES="1,5,5,10" # Hvor mange ganger skal et møte retries (antall tall), og hvor mange minutter skal ventes mellom hver retry
SHAREPOINT_REST_API_SCOPE="<hvis du trenger annet enn default>"
GRAPH_API_SCOPE="<hvis du trenger annet enn default>"
GRAPH_API_URL="<hvis du trenger annet enn default, f. eks beta>"
SMART_CACHE_QUEUE_DIR_NAME="<hvis du trenger annet lokasjon på cacha drit enn default>"
SMART_CACHE_FINISHED_DIR_NAME="<hvis du trenger annet lokasjon på cacha drit enn default>"
SMART_CACHE_FINISHED_RETENTION_DAYS="<hvor mange dager vil du spare på ferdige møter (for evt feilsøking)"
ARCHIVE_CASE_DEFAULT_ACCESS_CODE="<hvis du trenger annet enn default>"
ARCHIVE_CASE_DEFAULT_ACCESS_GROUP="<hvis du trenger annet enn default>"
ARCHIVE_CASE_DEFAULT_PARAGRAPH="<hvis du trenger annet enn default>"
ARCHIVE_DOCUMENT_DEFAULT_ACCESS_CODE="<hvis du trenger annet enn default>"
ARCHIVE_DOCUMENT_DEFAULT_ACCESS_GROUP="<hvis du trenger annet enn default>"
ARCHIVE_DOCUMENT_DEFAULT_PARAGRAPH="<hvis du trenger annet enn default>"
```

- Opprett filen ./motereferat-config/sakslister.js, kopier eksempel [./motereferat-config/sakslister-example.js](./motereferat-config/sakslister-example.js), og fyll inn verdier for sakslister som skal ha arkivering på seg.

## Løsningsbeskrivelse
- For hver møtearena/saksliste som er satt opp i ./motereferat-config/sakslister.js
  - Henter informasjon om Sharepoint-listen (siteId, listId osv)
  - Henter alle listeelementer som ikke er arkivert, og som har møtedato eldre enn en uke tilbake
  - Filtrerer til listelementer med status som skal arkiveres
  - Slår sammen listeelementer med samme møtedato, slik at vi får en liste med møter som er klare for arkivering
  - For hvert møte som skal arkiveres
    - Hent alle vedlegg som finnes for listeelementer i møte
    - Finn eller opprett arkiv-sak for denne møtearenaen
    - Opprett møtereferat som en pdf basert på listeelementene for møtet
    - Arkiver møtereferatet og vedlegg som et dokument i arkiv-saken
    - Sett de håndterte listeelementene for møtet til status arkivert i Sharepoint-listen
    - Opprett et statistikk-element for møte-arkiveringen
    - Rydd opp cachede filer, vedlegg, og data
- Rydd opp i fullførte møter som er gamle. DONE

## Trigger for at et møtelement blir arkivert
- Status "Avsluttet" eller "Utsatt til neste møte"
- Møtedato mer enn en uke gammel
- Publiser til referat lik "Ja"
- Arkivert lik "Ikke arkivert" eller arkiver på nytt lik "Ja"
- Sakstittel, beskrivelse og beslutning blir med i referatet

