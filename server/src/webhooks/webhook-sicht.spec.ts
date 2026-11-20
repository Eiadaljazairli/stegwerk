import { type EntityManager } from 'typeorm';

import { Permission } from '../workspaces/permissions';
import { type Sichtfeld } from '../workspaces/sichtbarkeit';
import { WEBHOOK_EREIGNISSE } from './ereignisse';
import { darfAbonnieren, objektLesbar, zeileSichtbar } from './webhook-sicht';

const BEREICH = '00000000-0000-4000-8000-0000000000aa';
const ICH = '00000000-0000-4000-8000-000000000001';
const KOLLEGIN = '00000000-0000-4000-8000-000000000002';
const FREMDE_FIRMA = '00000000-0000-4000-8000-0000000000f1';
const EIGENE_FIRMA = '00000000-0000-4000-8000-0000000000f2';
const BELEG = '00000000-0000-4000-8000-0000000000b1';
const EIGENER_BELEG = '00000000-0000-4000-8000-0000000000b2';

const zeilen: Record<string, Record<string, unknown>> = {
  [FREMDE_FIRMA]: { ownerId: KOLLEGIN },
  [EIGENE_FIRMA]: { ownerId: ICH },
  [BELEG]: {
    id: BELEG,
    companyId: FREMDE_FIRMA,
    dealId: null,
    bearbeiterId: KOLLEGIN,
  },
  [EIGENER_BELEG]: {
    id: EIGENER_BELEG,
    companyId: EIGENE_FIRMA,
    dealId: null,
    bearbeiterId: KOLLEGIN,
  },
};

const manager = {
  query: (_sql: string, [id]: string[]) =>
    Promise.resolve(zeilen[id] === undefined ? [] : [zeilen[id]]),
} as unknown as EntityManager;

const eigene = (ich: string | null): Sichtfeld => ({
  ich,
  arten: { company: 'eigene', contact: 'eigene', deal: 'eigene' },
  felder: {},
});

const beleg = (event: string, companyId: string) =>
  ({
    event,
    data: {
      id: companyId === EIGENE_FIRMA ? EIGENER_BELEG : BELEG,
      number: 'LS-2026-0001',
      quoteId: null,
      dealId: null,
      companyId,
      issuedOn: '2026-10-25',
    },
  }) as never;

describe('zeileSichtbar', () => {
  it('kennt die Tabelle jedes Ereignisses, das ein Webhook abonnieren kann', async () => {
    for (const event of WEBHOOK_EREIGNISSE) {
      await expect(
        zeileSichtbar(
          manager,
          BEREICH,
          {
            event,
            data: {
              id: EIGENE_FIRMA,
              ownerId: ICH,
              companyId: EIGENE_FIRMA,
            },
          },
          eigene(ICH),
        ),
      ).resolves.toBe(true);
    }
  });

  it.each(['order_confirmation.issued', 'delivery_note.issued'])(
    '%s folgt der Firma, bei „nur eigene“',
    async (event) => {
      await expect(
        zeileSichtbar(
          manager,
          BEREICH,
          beleg(event, FREMDE_FIRMA),
          eigene(ICH),
        ),
      ).resolves.toBe(false);
      await expect(
        zeileSichtbar(
          manager,
          BEREICH,
          beleg(event, EIGENE_FIRMA),
          eigene(ICH),
        ),
      ).resolves.toBe(true);
    },
  );

  it('zeigt den eigenen Beleg auch zu einer fremden Firma', async () => {
    await expect(
      zeileSichtbar(
        manager,
        BEREICH,
        beleg('delivery_note.cancelled', FREMDE_FIRMA),
        eigene(KOLLEGIN),
      ),
    ).resolves.toBe(true);
  });

  it('meldet bei enger Sicht ohne Anleger keinen Beleg zu einer zugeordneten Firma', async () => {
    await expect(
      zeileSichtbar(
        manager,
        BEREICH,
        beleg('order_confirmation.cancelled', FREMDE_FIRMA),
        eigene(null),
      ),
    ).resolves.toBe(false);
  });

  it('lässt ein unbekanntes Objekt mit Kennung nicht durch', async () => {
    await expect(
      zeileSichtbar(
        manager,
        BEREICH,
        { event: 'gibtsnicht.created' as never, data: { id: BELEG } },
        eigene(ICH),
      ),
    ).resolves.toBe(false);
  });
});

describe('Objektrecht', () => {
  const rolle = (...permissions: Permission[]) => ({
    everything: false,
    permissions,
  });

  it('hat für jedes Ereignis ein Leserecht', () => {
    for (const event of WEBHOOK_EREIGNISSE) {
      expect(darfAbonnieren(event, { everything: true, permissions: [] })).toBe(
        true,
      );
      expect(darfAbonnieren(event, rolle())).toBe(false);
    }
  });

  it('verlangt das Recht des Objekts', () => {
    const vertrieb = rolle(Permission.COMPANY_VIEW, Permission.CONTACT_VIEW);

    expect(darfAbonnieren('company.created', vertrieb)).toBe(true);
    expect(darfAbonnieren('invoice.paid', vertrieb)).toBe(false);
    expect(darfAbonnieren('deal.updated', vertrieb)).toBe(false);
    expect(darfAbonnieren('delivery_note.issued', vertrieb)).toBe(false);
    expect(
      darfAbonnieren('delivery_note.issued', rolle(Permission.QUOTE_VIEW)),
    ).toBe(true);
  });

  it('prüft die Notiz am Recht ihrer Akte', () => {
    const firmen = rolle(Permission.COMPANY_VIEW);

    expect(darfAbonnieren('note.created', firmen)).toBe(true);
    expect(
      objektLesbar(
        { event: 'note.created', data: { companyId: FREMDE_FIRMA } },
        firmen,
      ),
    ).toBe(true);
    expect(
      objektLesbar(
        { event: 'note.created', data: { dealId: FREMDE_FIRMA } },
        firmen,
      ),
    ).toBe(false);
    expect(objektLesbar({ event: 'note.deleted', data: {} }, firmen)).toBe(
      false,
    );
  });
});
