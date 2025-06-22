# motereferat
Nodejs scripts for handling motereferats from SMART and Enable

# Sertifikat
Enten bestill et sertifikat hvis du er av den rike og sikre typen, eller opprett et i f. eks Azure Keyvault hvis du har tilgang på det, eller bare mekk et via openssl:

## Lag selv
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

- Deretter må du ha et .cer av public key av en eller annen grunn - dette skal lastes opp på app registration senere
```bash
openssl x509 -in ./cert/public.pem -outform pem -outform der -out ./cert/public.cer
```

- Hvis du vil ha en pfx av det, siden [noe av dokumentasjonen sier du kan bruke det](https://github.com/Azure/azure-sdk-for-net/blob/main/sdk/identity/Azure.Identity/samples/ClientCertificateCredentialSamples.md), men du MÅ bruke [pem/key kombo inntil videre i nodejs uansett](https://learn.microsoft.com/en-us/javascript/api/@azure/identity/clientcertificatecredential?view=azure-node-latest)
```bash
openssl pkcs12 -export -in ./cert/public.pem -inkey ./cert/private.key -out ./cert/motereferat_client_auth.pfx -password pass:{super-secret}
```

# Skisse
Publiseringsjobben til referat fungerer - trenger kun arkivering, men ha i bakhodet at publisering også kan bli relevant - muligens og til nettsider

- Start script - sjekker at har cachet alle listeid og siteid for konfigelementene. Henter inn de som evt ikke er satt opp og lagrer som json.
- Kan ha en config i sharepoint også? (url til konfig)
  - Trenger da i så fall:
    - Title
    - Enabled
    - sakslisteurl
    - paragraph?
- Drit i SP lista for nå - kan tweakes inn senere

# config
{
  title: "FLG", // Bare for logger og syns skyld
  enabled: true, // av / på
  responsible: <epost> // For arkivet - responsibleEmail, oppsett kan vel også sjekke at det er korrekt? Evt bare ha en fallback til arkiv, og plinge på noen!
  saksliste: {
    siteurl: "https://www.example.com",
    listeId: "12345",
  },
  arkivering: {
    enabled: true,
    enterprise: true,
    person: false, // responsible person?
    paragraph: true,
    tilgangsgruppe: "admin",
    blabla...
  },
  publisere-referat: {
    enabled: true,
    referatliste: true
  }
}

# Arkivering (SMART)
- Henter alle listeelementer som har publisering = true og "ikke arkivert", og møtedato er minst en uke tilbake i tid
- Slår sammen alle listeelementer som hører til samme møtedato (samle et møte med all data som trengs)
- Validerer at møtet er klar for arkivering:
  - Alle sakene har enten status "Avsluttet" eller "Utsatt til neste møte"
  - Hvis ikke validert - send epost til ansvarlig å be de fikse? Prøv igjen etter et gitt tidspunkt, ikke om 5 min liksom
- Henter alle vedlegg for møtet (krever sp-rest)
  - Mellomlagrer vedlegg på filsystem
- Lager en pdf med alle sakene, sorteres (først på sortering, deretter på id), med metadata og faktiske data

- Gjør klart arkiv-kall basert på arkiverings-config
- Arkivstruktur:
  - Sak: FLG-møter {årstall for møtet}, opprett ny sak dersom den ikke finnes (husk entydige søkekriterier)
    - Opprett nytt saksdokument for det gjeldende møtet (FLG-møte 01.03.2024)
    - Legg inn pdf-en
    - Sikkert lurt å legge inn alle vedleggene etterpå, for å ikke knekke archive-api

- Send en e-post til ansvarlig, dersom det er konfigurert opp slik?
- Statistikk-oppføring for moro skyld

OBS! Hva om noen endrer i etterkant - får bare arkivere i samme dokument som vedlegg i etterkant "Etterslenger", når vi arkiverer får vi vel slå opp saken bare...

JA - husk å slå opp både sak og dokument, "etterarkiver" dokumenter? De blir nye "møter" hvis de er arkivert fra før

- Hvis jeg henter ALT og tar alt i en kjøring, kan de bli litt klønete... Eller forsåvidt ikke, bare å gønne egt, å ha kontroll på retries osv.

- Hm, kun de som har "publisere referat" til arkiv? Ja sikkert lurt, var jo sånn det var (y)

