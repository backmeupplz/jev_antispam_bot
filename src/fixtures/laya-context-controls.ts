import type { WeekendFixture } from "./laya-weekend-recruitment";
import { recruitmentReply } from "./recruitment-replies";

// Fresh agent-authored synthetic controls, not recovered Telegram updates or human labels.
// Screenshot-inspired German pitch is paraphrased, names/link replaced; no target is visited.
export const medicalPitch = "Wenn Sie mit einer chronischen Erkrankung oder Krebs kämpfen, empfehle ich Ihnen dringend unsere Medizin- und Wellness-Plattform. Sie bietet individuelle Behandlungsprotokolle, Schritt-für-Schritt-Anleitungen und fortlaufende Unterstützung. Auch alternative Wirkstoffe gehören zum Angebot. Patienten aus allen Ländern können teilnehmen. Entdecken Sie neue Möglichkeiten für Ihre Gesundheit und treten Sie unserer Gruppe bei: https://example.invalid/medizin";
const shiftOffer = "Für die Inventur am Samstag suchen wir zwei Aushilfen. 120 Euro pro Schicht, Auszahlung am Abend. Bei Interesse bitte direkt bei mir melden.";
function item(id: string, text: string, source: string | undefined, expectedDelete: boolean, forwarded = false, sourceId = 20): WeekendFixture {
  return { id, synthetic: true, sourceForm: source ? "synthetic-offer" : "absent", raw: recruitmentReply(text, source, forwarded, sourceId), recent: [], expectedDelete, expectedContextLinks: [] };
}
export const contextControls: WeekendFixture[] = [
  item("fresh-shift-unrelated", shiftOffer, "Welche Bücher habt ihr diesen Monat gelesen?", true),
  item("fresh-shift-requested", shiftOffer, "Ich suche einen bezahlten Nebenjob am Samstag. Wer Personal braucht, bitte hier Schicht und Bezahlung nennen.", false),
  item("fresh-shift-self-request", shiftOffer, "Ich suche einen bezahlten Nebenjob am Samstag. Wer Personal braucht, bitte hier Schicht und Bezahlung nennen.", true, false, 12),
  item("fresh-volunteers", "Für die Essensausgabe am Sonntag fehlen uns zwei freiwillige Helfer. Unbezahlt, bitte bei mir melden.", undefined, false),
  item("fresh-job-seeker", "Ich suche eine bezahlte Aushilfsstelle am Wochenende. Kennt jemand offene Stellen?", undefined, false),
  item("fresh-settlement", "Danke für die gestrige Inventur. Die vereinbarten 120 Euro sind überwiesen, bis nächste Woche.", undefined, false),
  item("fresh-wages", "Sind 120 Euro für eine Inventurschicht hier üblich? Ich vergleiche gerade die Löhne.", undefined, false),
  item("medical-promotion", medicalPitch, undefined, true, true),
  item("medical-warning", "Vorsicht: Diese Werbung verspricht unbewiesene Heilungen. Bitte nicht beitreten und keine Behandlung deshalb abbrechen.", medicalPitch, false),
  item("medical-report", "An die Moderation: Hier wird eine Behandlungsgruppe beworben. Bitte den Beitrag prüfen.", medicalPitch, false),
  item("medical-requested-link", "Hier ist der Link, den du für deine Quellenprüfung wolltest: https://example.invalid/medizin. Die Heilversprechen sind damit nicht bestätigt.", "Ich prüfe den Faktencheck zu dieser Werbung. Kann jemand den Original-Link als Quelle nennen, ohne die Behandlung zu empfehlen?", false),
  item("medical-patient-discussion", "Mein Vater hat Krebs. Wie kann ich fragwürdige Heilversprechen erkennen und mit seinem Behandlungsteam besprechen? Ich möchte nichts kaufen oder bewerben.", undefined, false),
];
