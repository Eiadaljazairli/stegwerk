# Legal checklist

Written to make a conversation with a lawyer shorter, not to replace one.
Nothing here is legal advice. Where it says *ask a lawyer*, that is the actual
recommendation and not a formality.

Assumed situation: a German company selling a B2B SaaS CRM, hosting customer
data, taking payment through Stripe, with customers in Germany and the EU.

---

## What the code already does

| Requirement | Where |
|---|---|
| Right of access, Art. 15 | `/daten` → export, whole workspace as JSON |
| Data portability, Art. 20 | Same export: structured, machine-readable |
| Right to erasure, Art. 17 | `/daten` → delete, verified to leave no orphans |
| Impressum, §5 TMG | `/impressum`, filled from `LEGAL_*` in `server/.env` |
| Record of processing, Art. 30 | Audit log covers changes to customer records |
| Storage limitation | Refresh tokens expire; invitations expire and purge |

Credentials are excluded from the export on purpose: password hashes and
session tokens are not personal data the subject needs, and a file people email
to themselves should not contain working sessions.

---

## What you must do, in order

### 1. Impressum — §5 TMG

Legally required of a German commercial site, and the cheapest item on this
list. Fill the `LEGAL_*` variables in `server/.env`:

    LEGAL_COMPANY_NAME, LEGAL_FORM, LEGAL_STREET, LEGAL_POSTAL_CODE,
    LEGAL_CITY, LEGAL_EMAIL, LEGAL_PHONE, LEGAL_REPRESENTATIVE,
    LEGAL_REGISTER_ENTRY, LEGAL_VAT_ID

A GmbH must give the Handelsregister court and number and every
Geschäftsführer. A sole trader gives their own name. Until these are set the
page says it is unconfigured rather than showing blanks.

### 2. Privacy policy — Art. 13 DSGVO

**Ask a lawyer.** A template will not fit, because the text has to name what
this system actually does, which is:

- **Data collected:** account name and email, and whatever customer records the
  workspace uploads — names, addresses, emails, phone numbers, deal values.
- **Legal basis:** contract performance for the account, Art. 6(1)(b). For the
  CRM contents, the customer is the controller and you are the processor.
- **Recipients:** Stripe (payment), your hosting provider, your email provider.
- **Transfers outside the EU:** Stripe is US-based. Check the current adequacy
  position rather than assuming.
- **Retention:** how long after cancellation you keep a workspace. Decide this
  deliberately; the code deletes on request but nothing expires on its own yet.
- **Rights:** access, rectification, erasure, portability, objection, and the
  right to complain to a supervisory authority.

### 3. Data processing agreement — Art. 28 DSGVO

**Ask a lawyer.** Your customers are controllers of the data they put in; you
are their processor. Every business customer will ask for an AV-Vertrag, and
many will not sign without one. It has to list your sub-processors — at least
Stripe, your host, your email provider, and **Sentry** if you turn on error
tracking — and cover the security measures.

The email provider is not optional to list. Invitations and password resets go
through it, so it handles names and addresses of your customers' colleagues.
Pick one that will sign an AV-Vertrag and hosts in the EU; a US provider is a
Chapter V transfer for the same reasons as Sentry, and harder to argue for,
since email providers with EU hosting are easy to find.

Sentry needs a decision before you enable it, not after. Error reports are
personal data whenever a stack trace or a URL carries a customer's details, so
sending them abroad is a transfer under Chapter V. Two things make this
manageable, and the code already assumes both:

- **Use an EU-region DSN** (`ingest.de.sentry.io`). Sentry hosts EU projects in
  Frankfurt; a DSN from a US-region project does not, and no configuration flag
  changes that afterwards. The region is fixed when the project is created.
- **The code sends the minimum.** `sendDefaultPii` is off; cookies, headers and
  request bodies are stripped before an event leaves; the user is identified by
  id alone, never by name or email; session replay is deliberately not enabled.
  `scripts/fake-sentry.mjs` shows exactly what would be sent, so you can verify
  this yourself rather than take it on trust.

With no `SENTRY_DSN` set, nothing is sent and nothing needs to be disclosed.

### 3b. Retention — Art. 5(1)(e) DSGVO

Data may not be kept longer than the purpose needs it, and "we never got round
to deleting it" is not a purpose. The product now deletes a workspace once its
access has been over for `RETENTION_DAYS` (90 by default), warning the owner a
month out and a week out, with a link to pay and a reminder to export.

Two things are yours to decide, and both belong in the privacy policy:

- **The number.** Ninety days is long enough to be recoverable after somebody
  forgets to renew, short enough to be a real limit. If your lawyer wants a
  different figure, it is one environment variable.
- **Whether it runs at all.** `RETENTION_SWEEP_ENABLED` is false by default, so
  as shipped this deletes nothing. Publishing a policy that promises deletion
  while the sweep is off would be worse than having no policy, so turn it on
  when the policy says it does — and run `previewRetention` first to see what
  the first sweep would take.

Note that this is deletion of *your customers'* workspaces, not of the records
inside them. What each customer must keep under §257 HGB or §147 AO is their
own obligation as controller, and their own export is how they meet it.

### 4. Terms of service

**Ask a lawyer.** B2B in Germany, which is easier than B2C but still needs
care around AGB law, liability limits, availability promises, and what happens
to data when a subscription ends.

### 5. Trademark

Search the **DPMA** register (Germany) and **EUIPO** (EU) for "Stegwerk" in
Nice class 42 (software as a service) and class 9. The word is ordinary German
for foresight, which cuts both ways: harder for anyone else to monopolise, and
harder for you to register. A trademark attorney can tell you in one sitting
whether the name is defensible or merely available.

Do this **before** printing anything or buying the domain, not after.

### 6. VAT

Stripe Tax is switched on in the checkout code, which handles most of it. Still
to decide with a tax adviser: OSS registration for B2C sales across the EU,
reverse charge for B2B, and whether your turnover crosses the Kleinunternehmer
threshold.

---

## Not required here

**No cookie banner.** The application stores one session key in
`localStorage`, which is strictly necessary to keep someone signed in and so
falls outside the consent requirement of §25 TTDSG. This stops being true the
moment analytics, advertising or third-party embeds are added — at which point
a consent banner becomes mandatory, not optional.

---

## Open, and worth deciding early

- **Retention after cancellation.** Nothing deletes a lapsed workspace
  automatically. Pick a period, write it in the privacy policy, then implement
  it — in that order.
- **Backup location.** Backups contain customer personal data. Where they are
  stored is a processing question, not only an operations one.
- **Breach process.** Art. 33 gives 72 hours to notify a supervisory authority.
  That is not enough time to invent a procedure, so write one first.
