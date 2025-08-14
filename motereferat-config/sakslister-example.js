// @ts-check

// EKSEMPEL PÅ SAKSLISTE KONFIGURASJON FOR SMART-MØTER, kopier denne filen til motereferat-config/sakslister.js og endrer på den som trengs
/** @type {import('../lib/smart/smart-sakslister').MeetingConfig[]} */
export const SMART_SAKSLISTER_CONFIG = [
  {
    MEETING_ARENA: 'F. eks FLG',
    ENABLED: true, // Sett til false for å deaktivere arkivering fra denne saklisten
    DEMO_MODE: false, // Skriver ingenting til eksterne systemer, kun for testing
    LIST_URL: 'https://{tenantname}.sharepoint.com/sites/{sitename}/Lists/{listname}/{samma driten hva som står bak her}?{og her}.aspx', // Kopier URL til sharepoint sakslisten
    ARCHIVE: {
      RESPONSIBLE_ENTERPRISE_RECNO: 12345, // Recno til ansvarlig enhet i arkivet, må være et gyldig recno
      RESPONSIBLE_PERSON_EMAIL: 'ansatt@fylke.no', // Bruk enten RESPONSIBLE_ENTERPRISE_RECNO eller RESPONSIBLE_PERSON_EMAIL, RESPONSIBLE_PERSON_EMAIL tar prioritet over RESPONSIBLE_ENTERPRISE_RECNO hvis begge er satt
      DOCUMENT_ACCESS_GROUP: 'Seksjon blablabal',
      CASE_ACCESS_CODE: 'U', // Optional, dersom satt - overstyrer den CASE_DEFAULT_VALUES.ACCESS_GROUP fra config
      CASE_ACCESS_GROUP: 'Alle', // Optional, dersom satt - overstyrer den CASE_DEFAULT_VALUES.ACCESS_GROUP fra config
      CASE_PARAGRAPH: '', // Optional, dersom satt - overstyrer den CASE_DEFAULT_VALUES.PARAGRAPH fra config
      DOCUMENT_ACCESS_CODE: 'U', // Optional, dersom satt - overstyrer den DOCUMENT_DEFAULT_VALUES.ACCESS_CODE fra config
      DOCUMENT_PARAGRAPH: '' // Optional, dersom satt - overstyrer den DOCUMENT_DEFAULT_VALUES.PARAGRAPH fra config
    },
    PDF: {
      SECTOR: 'F. eks Fylkesdirektørens ledergruppe' // Denne settes som "avdeling" i den genererte PDF-en
    }
  }
]
