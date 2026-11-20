export const letzteAktivitaetSql = (alias: string): string =>
  `greatest(
    ${alias}."updatedAt",
    coalesce((SELECT max(n."createdAt") FROM "notes" n WHERE n."dealId" = ${alias}."id"), 'epoch'),
    coalesce((SELECT max(t."updatedAt") FROM "tasks" t WHERE t."dealId" = ${alias}."id" AND t."deletedAt" IS NULL), 'epoch'),
    coalesce((SELECT max(ap."updatedAt") FROM "appointments" ap WHERE ap."dealId" = ${alias}."id"), 'epoch'),
    coalesce((SELECT max(q."updatedAt") FROM "quotes" q WHERE q."dealId" = ${alias}."id"), 'epoch')
  )`;

export const RUHEND_AB_TAGEN = 14;

export const VERLUSTGRUENDE = [
  'Preis zu hoch',
  'Wettbewerber gewählt',
  'Kein Bedarf mehr',
  'Kein Budget',
  'Keine Rückmeldung',
  'Zeitpunkt passt nicht',
  'Anforderungen nicht erfüllt',
];
