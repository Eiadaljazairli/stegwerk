import { gql } from '@apollo/client';
import { describe, expect, it } from 'vitest';

import {
  aenderungenMelden,
  aufAenderungenHoeren,
  betrifft,
  fremdeAenderungAn,
  hinweisText,
  kuerzlicheAenderungAn,
  type LiveAenderung,
  liesAenderungen,
  TAB_KENNUNG,
  typenIn,
  wartezeit,
  wurzelFelder,
} from './live';

const aenderung = (teil: Partial<LiveAenderung> = {}): LiveAenderung => ({
  objekt: 'contact',
  id: 'k1',
  aktion: 'updated',
  von: { id: 'u2', name: 'Anna Muster' },
  tab: null,
  ...teil,
});

describe('liesAenderungen', () => {
  it('nimmt, was der Server schickt', () => {
    expect(
      liesAenderungen(
        JSON.stringify([
          {
            objekt: 'deal',
            id: 'd1',
            aktion: 'deleted',
            von: { id: 'u1', name: 'Ben' },
            tab: 'fenster',
          },
        ]),
      ),
    ).toEqual([
      {
        objekt: 'deal',
        id: 'd1',
        aktion: 'deleted',
        von: { id: 'u1', name: 'Ben' },
        tab: 'fenster',
      },
    ]);
  });

  it('lässt Unbekanntes und Kaputtes fallen', () => {
    expect(liesAenderungen('kein json')).toEqual([]);
    expect(liesAenderungen('{"objekt":"deal"}')).toEqual([]);
    expect(
      liesAenderungen(
        JSON.stringify([
          { objekt: 'konto', id: 'x', aktion: 'updated' },
          { objekt: 'deal', id: 'x', aktion: 'gelesen' },
          { objekt: 'task', id: null, aktion: 'updated', von: {} },
        ]),
      ),
    ).toEqual([
      { objekt: 'task', id: null, aktion: 'updated', von: null, tab: null },
    ]);
  });
});

describe('wartezeit', () => {
  it('verdoppelt bis zu einer halben Minute, mit Zufall nach unten', () => {
    expect(wartezeit(0, () => 1)).toBe(1_000);
    expect(wartezeit(0, () => 0)).toBe(500);
    expect(wartezeit(3, () => 1)).toBe(8_000);
    expect(wartezeit(20, () => 1)).toBe(30_000);
    expect(wartezeit(20, () => 0)).toBe(15_000);
  });
});

describe('betrifft', () => {
  const LISTE = gql`
    query Contacts($search: String) {
      contacts(search: $search) {
        items {
          id
        }
      }
    }
  `;
  const AKTE = gql`
    query CompanyDetail($id: ID!) {
      company(id: $id) {
        id
        tasks {
          id
        }
      }
    }
  `;

  it('liest die Wurzelfelder einer Abfrage', () => {
    expect(wurzelFelder(LISTE)).toEqual(['contacts']);
  });

  it('erkennt eine leere Liste über ihr Wurzelfeld', () => {
    expect(
      betrifft(new Set(['contact']), LISTE, {
        contacts: { __typename: 'ContactPage', items: [] },
      }),
    ).toBe(true);
    expect(betrifft(new Set(['deal']), LISTE, { contacts: {} })).toBe(false);
  });

  it('erkennt eine Akte über die Typen darin', () => {
    const daten = {
      company: {
        __typename: 'Company',
        tasks: [{ __typename: 'Task', id: 't1' }],
      },
    };

    expect(typenIn(daten)).toEqual(new Set(['Company', 'Task']));
    expect(betrifft(new Set(['task']), AKTE, daten)).toBe(true);
    expect(betrifft(new Set(['invoice']), AKTE, daten)).toBe(false);
    expect(betrifft(new Set(), AKTE, daten)).toBe(false);
  });

  it('erkennt eine Akte auch über eine leere Liste darin', () => {
    const leer = {
      company: { __typename: 'Company', id: 'f1', tasks: [], notes: [] },
    };

    expect(betrifft(new Set(['task']), AKTE, leer)).toBe(true);
    expect(betrifft(new Set(['note']), AKTE, leer)).toBe(true);
    expect(betrifft(new Set(['appointment']), AKTE, leer)).toBe(false);
    expect(
      betrifft(new Set(['deal']), AKTE, {
        company: { __typename: 'Company', deals: [] },
      }),
    ).toBe(true);
  });
});

describe('hinweisText', () => {
  it('nennt, wer es war', () => {
    expect(hinweisText(aenderung(), 'u1')).toBe(
      'Anna Muster hat diesen Kontakt gerade geändert. Angezeigt wird der neue Stand.',
    );
  });

  it('sagt es anders, wenn es die Person selbst in einem anderen Fenster war', () => {
    expect(hinweisText(aenderung({ objekt: 'deal' }), 'u2')).toBe(
      'Sie haben dieses Geschäft gerade in einem anderen Fenster geändert. Angezeigt wird der neue Stand.',
    );
  });

  it('kommt ohne Namen aus und verspricht beim Löschen keinen neuen Stand', () => {
    expect(
      hinweisText(
        aenderung({ objekt: 'company', aktion: 'deleted', von: null }),
        'u1',
      ),
    ).toBe('Diese Firma wurde gerade an anderer Stelle gelöscht.');
  });
});

describe('fremde Änderungen an einem Datensatz', () => {
  it('übergeht das eigene Fenster und Sammeleinträge ohne Kennung', () => {
    const liste = [
      aenderung({ tab: TAB_KENNUNG }),
      aenderung({ id: null }),
      aenderung({ id: 'k2' }),
    ];

    expect(fremdeAenderungAn(liste, 'contact', 'k1')).toBeNull();
    expect(fremdeAenderungAn(liste, 'contact', 'k2')).toEqual(
      aenderung({ id: 'k2' }),
    );
    expect(fremdeAenderungAn(liste, 'deal', 'k2')).toBeNull();
  });

  it('meldet an Zuhörer und merkt sich die letzten Sekunden', () => {
    const gehoert: LiveAenderung[][] = [];
    const aus = aufAenderungenHoeren((liste) => gehoert.push(liste));

    aenderungenMelden([aenderung({ id: 'k9' })], 1_000);
    aus();
    aenderungenMelden([aenderung({ id: 'k8' })], 1_000);

    expect(gehoert).toEqual([[aenderung({ id: 'k9' })]]);
    expect(kuerzlicheAenderungAn('contact', 'k9', 5_000)).toEqual(
      aenderung({ id: 'k9' }),
    );
    expect(kuerzlicheAenderungAn('contact', 'k9', 60_000)).toBeNull();
  });
});
