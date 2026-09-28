// Telegram topic 4041081 #21228: the reported bare pitch, not the reporter's wrapper.
export const germanRecoveryPitch =
  "Hallo zusammen, falls ihr Opfer eines Kryptobetrugs geworden seid und eure Gelder verloren habt, gibt es jemanden, der euch helfen kann, eure Verluste wiederzuerlangen.";

export const cryptoRecoveryPitches = [
  { id: "exact-german", text: germanRecoveryPitch },
  { id: "english-unnamed", text: "If you lost crypto to a scam, I know someone who can help recover your losses." },
  { id: "russian-unnamed", text: "Если вы потеряли деньги из-за криптомошенников, есть человек, который поможет вернуть ваши средства." },
  { id: "first-person", text: "I lost crypto to a fake investment platform. A recovery specialist got my money back, and they can help other victims here too." },
] as const;

export const cryptoRecoveryControls = [
  { id: "victim", text: "Ich bin Opfer eines Kryptobetrugs geworden. Weiß jemand, wie ich den Fall offiziell melden kann?" },
  { id: "official", text: "Falls ihr Opfer von Kryptobetrug seid, meldet euch bei der Polizei und informiert eure Börse; zahlt keinen angeblichen Rückholhelfern." },
  { id: "warning-quote", text: "Warnung vor Spam: „" + germanRecoveryPitch + "“ Bitte nicht darauf antworten." },
  { id: "report-wrapper", text: "this one wasn't recognized:" + String.fromCharCode(10, 10) + germanRecoveryPitch },
  { id: "requested-support", text: "Du hast nach seriöser Hilfe bei Kryptobetrug gefragt: Melde es zuerst der Polizei und kontaktiere den offiziellen Support deiner Börse." },
  { id: "requested-referral", text: "You asked me for a fraud-response recommendation; use the official police report portal and your exchange's verified support channel." },
  { id: "requested-recovery-specialist", text: "You asked for a lawyer who handles crypto-fraud recovery claims. The lawyer who helped me document my loss and pursue a civil claim was a licensed asset-recovery specialist; I recommend consulting one through your local bar association. They cannot guarantee recovery, and you should never share wallet keys." },
  { id: "russian-warning", text: "Предупреждение: мошенники обещают вернуть потерянную криптовалюту через помощника. Не отправляйте им деньги." },
] as const;

export const cryptoRecoverySplit = {
  recent: "Hier wurden Leute beim Krypto-Investieren betrogen und haben ihr Geld verloren.",
  current: "Ich kenne jemanden, der diese Verluste für euch zurückholen kann.",
} as const;
