import { contextFixtures } from "../laya-context-matrix";
import { recruitmentReply } from "./recruitment-replies";
import type { WeekendFixture } from "./laya-weekend-recruitment";
import type { DestinationPreview } from "../telegram-preview";

// Manual screenshot transcription, not original payload. Spacing/punctuation reconstructed;
// invite replaced with inert URL. Unverified advertiser claims below are not medical advice.
export const fullMedicalText = `Wenn Sie mit einer chronischen Erkrankung zu kämpfen haben, unter Entgiftungskomplikationen leiden oder mit einer schweren Krankheit wie Krebs konfrontiert sind und das Gefühl haben, keine anderen Möglichkeiten mehr zu haben oder anderswo keine zufriedenstellenden Antworten zu finden, empfehle ich Ihnen dringend, sich mit Dr. Peter McCullough Medicine & Wellness auseinanderzusetzen.

Diese Plattform zeichnet sich durch ihren strukturierten und zielgerichteten Ansatz aus. Sie bietet detaillierte Behandlungsprotokolle, Schritt-für-Schritt-Anleitungen und fortlaufende Unterstützung – alles individuell auf Ihre Bedürfnisse zugeschnitten. Anstatt einer Standardlösung wird hier alles personalisiert.

Die Plattform bietet außerdem Zugang zu einer Reihe von Medikamenten, darunter auch alternative Wirkstoffe wie Ivermectin, Mebendazol, Fenbendazol, Albendazol und andere, die im Rahmen der Behandlungsprotokolle eingesetzt werden.

Dr. McCullough behandelt Patienten sowohl in der Region als auch international, sodass Ihr Wohnort kein Hindernis darstellen sollte. Wenn Sie Ihre Gesundheit aktiv mitgestalten und verschiedene Ansätze erkunden möchten, lohnt sich ein Blick auf diese Plattform.

Einladungslink: https://example.invalid/medical-invite`;
// Separate screenshot-visible card, manually supplied availability scenario. Bot API
// link_preview_options does NOT contain title/description; no runtime receipt is asserted.
// Thumbnail visible text: MCCULLOUGH FOUNDATION. No image inference performed.
export const medicalCard: DestinationPreview = { url: "https://example.invalid/medical-invite", status: "available",
 title: "Wellness with Dr. Peter McCullough; Ivermectin & Mebendazole",
 description: "FIGHTING MEDICAL TYRANNY WITH SCIENCE & TRUTH. 🍋 CANCER CAN BE CURED!!..." };
export type BudgetFixture = WeekendFixture & { suppliedPreviews?: DestinationPreview[]; tail?: string };
function item(id: string, text: string, expectedDelete: boolean, source?: string, forwarded = false): BudgetFixture {
 const raw = recruitmentReply(text, source, forwarded);
 if (source && raw.reply_to_message) raw.reply_to_message.entities = [{ type: "bold", offset: 0, length: 1 }];
 return { id, synthetic: true, sourceForm: source ? "synthetic-request" : "absent", raw, recent: [], expectedDelete, expectedContextLinks: [] };
}
const filler = "Die Gesprächsrunde sammelt unterschiedliche Erfahrungen. Wir notieren offene Fragen, vergleichen Quellen und besprechen die nächsten Termine. ".repeat(14);
const warningTail = "Dies war ein Zitat zur Warnung: Nicht beitreten, keine Behandlung abbrechen; ich empfehle diese Plattform ausdrücklich nicht.";
const requestTail = "Bitte sendet mir hier die Quelle für einen Faktencheck; ich suche keine Behandlung und möchte nichts kaufen.";
const job = "Für unseren Messestand am Sonntag suchen wir bezahlte Unterstützung. 150 Euro für sechs Stunden, Interessierte bitte privat melden.";
export const newBudgetFixtures: BudgetFixture[] = [
 item("full-medical-body", fullMedicalText, true, undefined, true),
 { ...item("full-medical-card", fullMedicalText, true, undefined, true), suppliedPreviews: [medicalCard] },
 { ...item("full-medical-end-warning", fullMedicalText + "\n" + warningTail, false), suppliedPreviews: [medicalCard], tail: warningTail },
 { ...item("full-medical-end-request", fullMedicalText + "\n" + requestTail, false), suppliedPreviews: [medicalCard], tail: requestTail },
 item("full-medical-report-source", "Moderation: Bitte diese unbewiesene Heilwerbung prüfen. Ich warne davor.", false, fullMedicalText),
 { ...item("long-end-warning", filler + fullMedicalText + "\n" + warningTail, false), tail: warningTail },
 { ...item("long-end-request", filler + "\n" + requestTail, false), tail: requestTail },
 { ...item("long-end-advert", filler + "\nBucht jetzt unsere kostenpflichtige Beratung, Anmeldung privat unter https://example.invalid/beratung", true), tail: "https://example.invalid/beratung" },
 item("fresh-fair-unrelated", job, true, "Welche Ausstellungen habt ihr zuletzt besucht?"),
 item("fresh-fair-requested", job, false, "Ich suche bezahlte Arbeit am Sonntag. Wer Hilfe braucht, bitte hier Angebot und Lohn posten."),
 item("fresh-charity-volunteers", "Für die Bücherspende suchen wir am Sonntag freiwillige Helfer, unbezahlt. Wer Zeit hat, bitte melden.", false),
 item("fresh-clinical-discussion", "Welche Fragen sollte ich meinem Onkologen zur laufenden Studie stellen? Ich möchte keine Behandlung ohne ärztliche Absprache ändern.", false),
 item("fresh-invoice", "Die vereinbarte Vergütung für unseren Messestand ist heute angekommen. Danke für die Zusammenarbeit.", false),
 item("fresh-spanish-job-seeker", "Busco trabajo temporal el domingo. ¿Conocéis alguna vacante remunerada?", false),
 item("fresh-spanish-paid-advert", "Buscamos gente para turnos este fin de semana, pagamos al terminar. Escribidme por privado para apuntaros.", true),
];
const visible = contextFixtures.find(f => f.id === "unrelated-visible")!;
const benign = item("prior-benign", "Danke für die Buchbesprechung.", false).raw;
// No engineered near-gate score: adding history can change the observed .8083.
export const budgetFixtures: BudgetFixture[] = [...contextFixtures, ...newBudgetFixtures,
 { ...structuredClone(visible), id: "near-gate-benign-history", recent: [{ ...benign, message_id: 80 }], expectedContextLinks: [false] },
 { ...structuredClone(visible), id: "near-gate-spam-history", recent: [{ ...structuredClone(visible.raw), message_id: 81 }], expectedContextLinks: [true] },
];
export const budgetVariants = ["base", "compact-json", "current-last", "budget1536", "linkage080"] as const;
