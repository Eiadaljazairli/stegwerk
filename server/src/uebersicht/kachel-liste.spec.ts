import { randomUUID } from 'node:crypto';

import { type DataSource } from 'typeorm';

import { DealsService } from '../crm/deals.service';
import { DealEntity, DealStage } from '../crm/entities/deal.entity';
import { type CustomFieldFilterInput as CustomFieldFilter } from '../crm/dto/pagination.dto';
import { CustomFieldDefinition } from '../custom-fields/custom-field.entity';
import { CustomFieldFilterOperator as Op } from '../custom-fields/custom-field.types';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { runWithRequestContext } from '../observability/request-context';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { setzeSichtfeld } from '../workspaces/sichtbarkeit';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { pruefeKachel } from './kacheln';
import { UebersichtService } from './uebersicht.service';

const SUITE = 'kachel_liste';

jest.setTimeout(60_000);

let dataSource: DataSource;
let dienst: UebersichtService;
let deals: DealsService;
let workspaceId: string;
const ich = randomUUID();

const als = <T>(tun: () => Promise<T>): Promise<T> =>
  runWithRequestContext({ requestId: 'test' }, () => {
    setzeSichtfeld(() =>
      Promise.resolve({
        ich,
        arten: { company: 'alle', contact: 'alle', deal: 'alle' },
        felder: {},
      }),
    );

    return tun();
  });

const zwei = (zahl: number): string => String(zahl).padStart(2, '0');

const iso = (tag: Date): string =>
  `${String(tag.getFullYear())}-${zwei(tag.getMonth() + 1)}-${zwei(tag.getDate())}`;

const tag = (tage: number): string => {
  const d = new Date();

  d.setDate(d.getDate() + tage);

  return iso(d);
};

const STATUS_PHASE = { gewonnen: DealStage.WON, verloren: DealStage.LOST };

const zeitraumFilter = (
  feld: string,
  zeitraum: string | null,
): CustomFieldFilter[] => {
  switch (zeitraum) {
    case '30':
    case '90':
    case '365':
      return [{ key: feld, operator: Op.IN_LAST_DAYS, value: zeitraum }];
    case 'jahr':
      return [
        {
          key: feld,
          operator: Op.GREATER_THAN,
          value: `${String(new Date().getFullYear() - 1)}-12-31`,
        },
      ];
    default:
      return [];
  }
};

const monatFilter = (feld: string, schluessel: string): CustomFieldFilter[] => {
  const [j, m] = schluessel.split('-').map(Number);
  const davor = new Date(j, m - 1, 0);
  const bis = new Date(j, m, 1);

  return [
    { key: feld, operator: Op.GREATER_THAN, value: iso(davor) },
    { key: feld, operator: Op.LESS_THAN, value: iso(bis) },
  ];
};

const listenAnzahl = (
  status: keyof typeof STATUS_PHASE,
  customFilters: CustomFieldFilter[],
): Promise<number> =>
  als(async () => {
    const seite = await deals.list(
      workspaceId,
      { customFilters, limit: 1 },
      { stage: STATUS_PHASE[status] },
    );

    return seite.totalCount;
  });

const kachel = (teil: Record<string, unknown>) =>
  als(() =>
    dienst.werte(
      workspaceId,
      ich,
      pruefeKachel({ id: 'k', objekt: 'deal', ...teil }),
    ),
  );

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  dienst = new UebersichtService(dataSource);
  deals = new DealsService(
    dataSource.getRepository(DealEntity),
    new CustomFieldsService(dataSource.getRepository(CustomFieldDefinition)),
  );

  const bereiche = dataSource.getRepository(WorkspaceEntity);

  workspaceId = (
    await bereiche.save(
      bereiche.create({ name: 'Klick', slug: 'kachel-liste' }),
    )
  ).id;

  const repo = dataSource.getRepository(DealEntity);
  const geschaeft = (
    name: string,
    stage: DealStage,
    closeDate: string | null,
  ) => repo.create({ workspaceId, name, stage, closeDate, amount: 100 });

  const gespeichert = await repo.save([
    geschaeft('mit Abschluss vor 10 Tagen', DealStage.WON, tag(-10)),
    geschaeft('ohne Abschluss, heute geändert', DealStage.WON, null),
    geschaeft('ohne Abschluss, vor 40 Tagen geändert', DealStage.WON, null),
    geschaeft('ohne Abschluss, vor 200 Tagen geändert', DealStage.WON, null),
    geschaeft('Abschluss in 5 Tagen', DealStage.WON, tag(5)),
    geschaeft('Abschluss genau vor 30 Tagen', DealStage.WON, tag(-30)),
    geschaeft('Abschluss vor 31 Tagen', DealStage.WON, tag(-31)),
    geschaeft('Abschluss vor 100 Tagen', DealStage.WON, tag(-100)),
    geschaeft('verloren ohne Abschluss', DealStage.LOST, null),
    geschaeft('verloren vor 60 Tagen', DealStage.LOST, tag(-60)),
    geschaeft('offen', DealStage.PROPOSAL, tag(-5)),
  ]);

  const alt = (name: string, tage: number) =>
    dataSource.query(
      `UPDATE "deals" SET "updatedAt" = now() - make_interval(days => $1) WHERE "id" = $2`,
      [tage, gespeichert.find((g) => g.name === name)?.id],
    );

  await alt('ohne Abschluss, vor 40 Tagen geändert', 40);
  await alt('ohne Abschluss, vor 200 Tagen geändert', 200);
  await alt('Abschluss vor 100 Tagen', 1);
  await alt('verloren ohne Abschluss', 3);
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

describe('Kachel und Liste zählen gleich', () => {
  const ZEITRAEUME = [null, '30', '90', '365', 'jahr'];

  it.each(['gewonnen', 'verloren'] as const)(
    'Kennzahl „%s“ in jedem Zeitraum',
    async (status) => {
      for (const zeitraum of ZEITRAEUME) {
        const zahl = await kachel({ typ: 'kennzahl', status, zeitraum });
        const liste = await listenAnzahl(
          status,
          zeitraumFilter('std:abgeschlossen', zeitraum),
        );

        expect({ zeitraum, anzahl: liste }).toEqual({
          zeitraum,
          anzahl: zahl.anzahl,
        });
      }
    },
  );

  it.each(['gewonnen', 'verloren'] as const)(
    'jeder Monatsbalken „%s“ in jedem Zeitraum',
    async (status) => {
      for (const zeitraum of ZEITRAEUME) {
        const { balken } = await kachel({
          typ: 'balken',
          status,
          zeitraum,
          gruppe: 'monat',
        });

        for (const eintrag of balken) {
          const liste = await listenAnzahl(status, [
            ...zeitraumFilter('std:abgeschlossen', zeitraum),
            ...monatFilter('std:abgeschlossen', eintrag.schluessel),
          ]);

          expect({
            zeitraum,
            monat: eintrag.schluessel,
            anzahl: liste,
          }).toEqual({
            zeitraum,
            monat: eintrag.schluessel,
            anzahl: eintrag.anzahl,
          });
        }
      }
    },
  );

  it('zählt Gewonnenes ohne Datum mit, in Kachel und Liste', async () => {
    expect(
      (await kachel({ typ: 'kennzahl', status: 'gewonnen', zeitraum: '30' }))
        .anzahl,
    ).toBe(3);
    await expect(
      listenAnzahl('gewonnen', zeitraumFilter('std:closeDate', '30')),
    ).resolves.toBe(2);
  });
});
