import { type ConfigService } from '@nestjs/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { type DataSource } from 'typeorm';

import { AppointmentAttendeeEntity } from '../calendar/appointment-attendee.entity';
import { AppointmentEntity } from '../calendar/appointment.entity';
import {
  berlinDate,
  berlinTime,
  instantFromBerlin,
} from '../calendar/berlin-time';
import { buildIcs, type IcsEvent } from '../calendar/ics';
import { liesIcs } from '../calendar/ics-lesen';
import { ContactEntity } from '../crm/entities/contact.entity';
import { type MailboxesService } from '../mailboxes/mailboxes.service';
import { type OAuthService } from '../oauth/oauth.service';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { type HttpAnfrage, type HttpAntwort } from './caldav-client';
import {
  ETAG_ZUSATZ,
  GRAPH,
  GraphKalenderClient,
  type GraphTermin,
  serienTagVon,
} from './graph-kalender';
import { KalenderEintragEntity } from './kalender-eintrag.entity';
import { KalenderSyncService } from './kalender-sync.service';
import { KalenderVerbindungEntity } from './kalender-verbindung.entity';

const SUITE = 'graph_serien';
const KAL = `${GRAPH}/me/calendars/AAA`;
const TAG_MS = 24 * 60 * 60 * 1000;

jest.setTimeout(60_000);

type Ev = GraphTermin & { id: string; '@odata.etag': string };

const WOCHENTAGE = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

const json = (status: number, inhalt: unknown): HttpAntwort => ({
  status,
  kopf: { 'content-type': 'application/json' },
  rumpf: JSON.stringify(inhalt),
});

const utc = (zeit: Date): GraphZeit => ({
  dateTime: `${zeit.toISOString().slice(0, 19)}.0000000`,
  timeZone: 'UTC',
});

type GraphZeit = { dateTime: string; timeZone: string };

const tagesZeit = (tag: string): GraphZeit => ({
  dateTime: `${tag}T00:00:00.0000000`,
  timeZone: 'UTC',
});

const eingang = (zeit: unknown): Date => {
  const { dateTime } = zeit as { dateTime: string };

  return instantFromBerlin(dateTime.slice(0, 10), dateTime.slice(11, 16));
};

const tagPlus = (tag: string, tage: number): string =>
  new Date(Date.parse(`${tag}T00:00:00Z`) + tage * TAG_MS)
    .toISOString()
    .slice(0, 10);

class FakeGraph {
  ereignisse = new Map<string, Ev>();
  ausnahmen = new Map<string, Map<string, Ev>>();
  abgesagt = new Map<string, Set<string>>();
  anfragen: HttpAnfrage[] = [];
  private zaehler = 0;

  private stempel(): { etag: string; zeit: string } {
    this.zaehler += 1;

    return {
      etag: `W/"m${String(this.zaehler)}"`,
      zeit: new Date(
        Date.parse('2026-10-20T09:00:00Z') + this.zaehler * 1000,
      ).toISOString(),
    };
  }

  tage(serie: Ev): string[] {
    const muster = serie.recurrence?.pattern;
    const bereich = serie.recurrence?.range;
    const erster = bereich?.startDate ?? '';
    const ergebnis: string[] = [];

    for (let i = 0; i < 366; i += 1) {
      const tag = tagPlus(erster, i);

      if (bereich?.type === 'endDate' && tag > (bereich.endDate ?? '')) {
        break;
      }

      if (
        bereich?.type === 'numbered' &&
        ergebnis.length >= (bereich.numberOfOccurrences ?? 0)
      ) {
        break;
      }

      const wochentag =
        WOCHENTAGE[new Date(`${tag}T12:00:00Z`).getUTCDay()] ?? '';
      const passt =
        muster?.type === 'daily'
          ? i % (muster.interval ?? 1) === 0
          : (muster?.daysOfWeek ?? []).includes(wochentag);

      if (passt) {
        ergebnis.push(tag);
      }
    }

    return ergebnis;
  }

  private zeiten(
    serie: Ev,
    tag: string,
  ): { start: GraphZeit; ende: GraphZeit; original: Date } {
    const beginn = serie.start?.dateTime?.slice(0, 19) ?? '';
    const schluss = serie.end?.dateTime?.slice(0, 19) ?? '';

    if (serie.isAllDay === true) {
      const tage = Math.round(
        (Date.parse(`${schluss.slice(0, 10)}T00:00:00Z`) -
          Date.parse(`${beginn.slice(0, 10)}T00:00:00Z`)) /
          TAG_MS,
      );

      return {
        start: tagesZeit(tag),
        ende: tagesZeit(tagPlus(tag, tage)),
        original: instantFromBerlin(tag, '00:00'),
      };
    }

    const von = new Date(`${beginn}Z`);
    const start = instantFromBerlin(tag, berlinTime(von));

    return {
      start: utc(start),
      ende: utc(
        new Date(start.getTime() + Date.parse(`${schluss}Z`) - von.getTime()),
      ),
      original: start,
    };
  }

  private vorkommen(serie: Ev, tag: string): Ev | null {
    if (this.abgesagt.get(serie.id)?.has(tag) === true) {
      return null;
    }

    const geaendert = this.ausnahmen.get(serie.id)?.get(tag);

    if (geaendert !== undefined) {
      return geaendert;
    }

    const { start, ende, original } = this.zeiten(serie, tag);

    return {
      id: `${serie.id}_occ_${tag}`,
      '@odata.etag': serie['@odata.etag'],
      type: 'occurrence',
      subject: serie.subject,
      body: serie.body,
      location: serie.location,
      isAllDay: serie.isAllDay,
      start,
      end: ende,
      originalStart: original.toISOString().replace('.000', ''),
      occurrenceId: `OID.${serie.id}.${tag}`,
    };
  }

  inOutlookAendern(
    serieId: string,
    tag: string,
    aenderung: Partial<GraphTermin>,
  ): void {
    const serie = this.ereignisse.get(serieId);
    const tagEv = serie === undefined ? null : this.vorkommen(serie, tag);

    if (serie === undefined || tagEv === null) {
      throw new Error(`Kein Vorkommen am ${tag}`);
    }

    const { etag, zeit } = this.stempel();
    const ausnahme: Ev = {
      ...tagEv,
      ...aenderung,
      type: 'exception',
      changeKey: etag,
      lastModifiedDateTime: zeit,
    };

    if (!this.ausnahmen.has(serieId)) {
      this.ausnahmen.set(serieId, new Map());
    }

    this.ausnahmen.get(serieId)?.set(tag, ausnahme);
  }

  inOutlookLoeschen(serieId: string, tag: string): void {
    this.ausnahmen.get(serieId)?.delete(tag);

    if (!this.abgesagt.has(serieId)) {
      this.abgesagt.set(serieId, new Set());
    }

    this.abgesagt.get(serieId)?.add(tag);
  }

  private uebernehmen(ziel: Ev, inhalt: Record<string, unknown>): void {
    const ganz = (inhalt.isAllDay ?? ziel.isAllDay) === true;

    for (const [schluessel, wert] of Object.entries(inhalt)) {
      if (schluessel === 'start' || schluessel === 'end') {
        ziel[schluessel] = ganz
          ? tagesZeit((wert as { dateTime: string }).dateTime.slice(0, 10))
          : utc(eingang(wert));
      } else if (schluessel !== 'transactionId') {
        (ziel as Record<string, unknown>)[schluessel] = wert;
      }
    }
  }

  private instanzVon(id: string): { serie: Ev; tag: string } | null {
    const treffer = /^(.+)_occ_(\d{4}-\d{2}-\d{2})$/u.exec(id);
    const serie =
      treffer === null ? undefined : this.ereignisse.get(treffer[1]);

    return treffer === null || serie === undefined
      ? null
      : { serie, tag: treffer[2] };
  }

  transport = (anfrage: HttpAnfrage): Promise<HttpAntwort> => {
    this.anfragen.push(anfrage);

    return Promise.resolve(this.antwort(anfrage));
  };

  private antwort(anfrage: HttpAnfrage): HttpAntwort {
    const pfad = anfrage.url.pathname;
    const inhalt = JSON.parse(anfrage.rumpf ?? '{}') as Record<string, unknown>;

    if (pfad === '/v1.0/me/calendars/AAA/events') {
      if (anfrage.methode === 'POST') {
        const { etag, zeit } = this.stempel();
        const id = `ev${String(this.zaehler)}`;
        const neu: Ev = {
          id,
          '@odata.etag': etag,
          iCalUId: `ical-${id}`,
          lastModifiedDateTime: zeit,
          type:
            inhalt.recurrence === null || inhalt.recurrence === undefined
              ? 'singleInstance'
              : 'seriesMaster',
        };

        this.uebernehmen(neu, inhalt);
        this.ereignisse.set(id, neu);

        return json(201, neu);
      }

      const filter = anfrage.url.searchParams.get('$filter') ?? '';
      const typ = filter.includes('seriesMaster')
        ? 'seriesMaster'
        : 'singleInstance';

      return json(200, {
        value: [...this.ereignisse.values()].filter((ev) => ev.type === typ),
      });
    }

    const instanzen = /^\/v1\.0\/me\/events\/([^/]+)\/instances$/u.exec(pfad);

    if (instanzen !== null) {
      const serie = this.ereignisse.get(decodeURIComponent(instanzen[1]));

      if (serie === undefined) {
        return json(404, {});
      }

      const von = Date.parse(
        anfrage.url.searchParams.get('startDateTime') ?? '',
      );
      const bis = Date.parse(anfrage.url.searchParams.get('endDateTime') ?? '');

      return json(200, {
        value: this.tage(serie)
          .map((tag) => this.vorkommen(serie, tag))
          .filter((ev): ev is Ev => {
            const beginn = Date.parse(
              `${ev?.start?.dateTime?.slice(0, 19) ?? ''}Z`,
            );

            return ev !== null && beginn >= von && beginn < bis;
          }),
      });
    }

    const einzeln = /^\/v1\.0\/me\/events\/([^/]+)$/u.exec(pfad);

    if (einzeln === null) {
      return json(404, {});
    }

    const id = decodeURIComponent(einzeln[1]);
    const instanz = this.instanzVon(id);

    if (instanz !== null) {
      const { serie, tag } = instanz;

      if (anfrage.methode === 'DELETE') {
        this.inOutlookLoeschen(serie.id, tag);

        return { status: 204, kopf: {}, rumpf: '' };
      }

      if (anfrage.methode === 'PATCH') {
        const vorher = this.vorkommen(serie, tag);

        if (vorher === null) {
          return json(404, {});
        }

        const { etag, zeit } = this.stempel();
        const ausnahme: Ev = {
          ...vorher,
          type: 'exception',
          changeKey: etag,
          lastModifiedDateTime: zeit,
        };

        this.uebernehmen(ausnahme, inhalt);

        if (!this.ausnahmen.has(serie.id)) {
          this.ausnahmen.set(serie.id, new Map());
        }

        this.ausnahmen.get(serie.id)?.set(tag, ausnahme);

        return json(200, ausnahme);
      }

      return json(405, {});
    }

    const ev = this.ereignisse.get(id);

    if (ev === undefined) {
      return json(404, {});
    }

    if (anfrage.methode === 'GET') {
      if (
        ev.type !== 'seriesMaster' ||
        !(anfrage.url.searchParams.get('$expand') ?? '').includes(
          'exceptionOccurrences',
        )
      ) {
        return json(200, ev);
      }

      return json(200, {
        ...ev,
        cancelledOccurrences: [...(this.abgesagt.get(id) ?? [])].map(
          (tag) => `OID.${id}.${tag}`,
        ),
        exceptionOccurrences: [...(this.ausnahmen.get(id)?.values() ?? [])],
      });
    }

    if (anfrage.methode === 'DELETE') {
      this.ereignisse.delete(id);

      return { status: 204, kopf: {}, rumpf: '' };
    }

    if (anfrage.methode === 'PATCH') {
      const bedingung = anfrage.kopf['if-match'];

      if (bedingung !== undefined && bedingung !== ev['@odata.etag']) {
        return json(412, {});
      }

      if ('recurrence' in inhalt) {
        this.ausnahmen.delete(id);
        this.abgesagt.delete(id);
      }

      const { etag, zeit } = this.stempel();

      this.uebernehmen(ev, inhalt);
      ev['@odata.etag'] = etag;
      ev.lastModifiedDateTime = zeit;

      return json(200, ev);
    }

    return json(405, {});
  }
}

const UID = 'serie-1@app.stegwerk.test';

const serienDatei = ({
  regel = 'FREQ=WEEKLY;BYDAY=MO',
  ausfaelle = ['2026-11-09'],
  ausnahmen = ['verschoben', 'abgesagt'],
}: {
  regel?: string;
  ausfaelle?: string[];
  ausnahmen?: ('verschoben' | 'abgesagt')[];
} = {}): string => {
  const kopf = instantFromBerlin('2026-10-19', '10:00');
  const events: IcsEvent[] = [
    {
      uid: UID,
      startsAt: kopf,
      endsAt: new Date(kopf.getTime() + 60 * 60 * 1000),
      summary: 'Jour fixe',
      location: 'Büro',
      recurrence: regel,
      skippedDates: ausfaelle,
    },
  ];

  if (ausnahmen.includes('verschoben')) {
    const start = instantFromBerlin('2026-10-26', '14:00');

    events.push({
      uid: UID,
      startsAt: start,
      endsAt: new Date(start.getTime() + 60 * 60 * 1000),
      summary: 'Jour fixe (verschoben)',
      location: 'Büro',
      ausnahmeVon: { tag: '2026-10-26', ganztaegig: false, uhrzeit: '10:00' },
    });
  }

  if (ausnahmen.includes('abgesagt')) {
    const start = instantFromBerlin('2026-11-02', '10:00');

    events.push({
      uid: UID,
      startsAt: start,
      endsAt: new Date(start.getTime() + 60 * 60 * 1000),
      summary: 'Jour fixe',
      location: 'Büro',
      cancelled: true,
      ausnahmeVon: { tag: '2026-11-02', ganztaegig: false, uhrzeit: '10:00' },
    });
  }

  return buildIcs(events, { ohneMethode: true });
};

const VON = new Date('2026-09-20T00:00:00Z');
const BIS = new Date('2027-04-20T00:00:00Z');

let graph: FakeGraph;
let client: GraphKalenderClient;

const anlegen = async (ics = serienDatei()) => {
  const ergebnis = await client.ablegen(client.neueAdresse(KAL, 'x'), ics);
  const href = ergebnis.href ?? '';
  const serieId = decodeURIComponent(href.split('/').pop() ?? '');

  return { ...ergebnis, href, serieId };
};

const geschrieben = (methode: string) =>
  graph.anfragen.filter(
    (anfrage) =>
      anfrage.methode === methode && anfrage.url.pathname.includes('_occ_'),
  );

describe('Outlook-Serien: einzelne Tage über Graph', () => {
  beforeEach(() => {
    graph = new FakeGraph();
    client = new GraphKalenderClient(graph.transport, () =>
      Promise.resolve('token'),
    );
  });

  it('legt eine Serie mit geändertem, abgesagtem und ausgefallenem Tag an', async () => {
    const { serieId, etag } = await anlegen();

    const post = graph.anfragen.find((anfrage) => anfrage.methode === 'POST');

    expect(JSON.parse(post?.rumpf ?? '{}')).toMatchObject({
      subject: 'Jour fixe',
      recurrence: { pattern: { type: 'weekly', daysOfWeek: ['monday'] } },
    });

    const tage = graph.ausnahmen.get(serieId);

    expect(tage?.get('2026-10-26')).toMatchObject({
      subject: 'Jour fixe (verschoben)',
      start: { dateTime: '2026-10-26T13:00:00.0000000' },
      originalStart: '2026-10-26T09:00:00Z',
    });
    expect(tage?.get('2026-11-02')).toMatchObject({
      subject: 'Abgesagt: Jour fixe',
      showAs: 'free',
    });
    expect([...(graph.abgesagt.get(serieId) ?? [])]).toEqual(['2026-11-09']);
    expect(etag).toContain(ETAG_ZUSATZ);

    const [objekt] = await client.abfragen(KAL, VON, BIS);

    expect(objekt.etag).toBe(etag);

    const datei = liesIcs(objekt.ics);

    expect(datei.termine[0].ausfaelle).toEqual(['2026-11-09']);
    expect(
      datei.ausnahmen.map((ausnahme) => [
        ausnahme.serienTag,
        ausnahme.titel,
        ausnahme.startsAt.toISOString(),
        ausnahme.abgesagt,
      ]),
    ).toEqual([
      [
        '2026-10-26',
        'Jour fixe (verschoben)',
        '2026-10-26T13:00:00.000Z',
        false,
      ],
      ['2026-11-02', 'Jour fixe', '2026-11-02T09:00:00.000Z', true],
    ]);
  });

  it('schreibt beim zweiten Mal keinen Tag und keine Wiederholung', async () => {
    const { href, etag } = await anlegen();

    graph.anfragen = [];

    const zweites = await client.ablegen(href, serienDatei(), { etag });
    const patch = graph.anfragen.find(
      (anfrage) =>
        anfrage.methode === 'PATCH' && anfrage.url.toString() === href,
    );

    expect(zweites.konflikt).toBe(false);
    expect(JSON.parse(patch?.rumpf ?? '{}')).not.toHaveProperty('recurrence');
    expect(geschrieben('PATCH')).toHaveLength(0);
    expect(geschrieben('DELETE')).toHaveLength(0);

    const [objekt] = await client.abfragen(KAL, VON, BIS);

    expect(objekt.etag).toBe(zweites.etag);
  });

  it('sieht einen in Outlook geänderten Tag, auch wenn die Serie gleich bleibt', async () => {
    const { serieId, href, etag } = await anlegen();
    const serienEtag = graph.ereignisse.get(serieId)?.['@odata.etag'];

    graph.inOutlookAendern(serieId, '2026-11-16', {
      subject: 'Jour fixe mit Gast',
    });

    expect(graph.ereignisse.get(serieId)?.['@odata.etag']).toBe(serienEtag);

    const [objekt] = await client.abfragen(KAL, VON, BIS);
    const datei = liesIcs(objekt.ics);
    const gast = datei.ausnahmen.find(
      (ausnahme) => ausnahme.serienTag === '2026-11-16',
    );

    expect(objekt.etag).not.toBe(etag);
    expect(gast?.titel).toBe('Jour fixe mit Gast');
    expect(datei.termine[0].geaendertAm?.getTime()).toBe(
      Date.parse(
        graph.ausnahmen.get(serieId)?.get('2026-11-16')?.lastModifiedDateTime ??
          '',
      ),
    );

    expect((await client.ablegen(href, serienDatei(), { etag })).konflikt).toBe(
      true,
    );
  });

  it('übernimmt einen in Outlook gelöschten Tag als ausgefallen', async () => {
    const { serieId } = await anlegen();

    graph.inOutlookLoeschen(serieId, '2026-11-23');

    const [objekt] = await client.abfragen(KAL, VON, BIS);

    expect(liesIcs(objekt.ics).termine[0].ausfaelle).toEqual([
      '2026-11-09',
      '2026-11-23',
    ]);
  });

  it('stellt einen Tag zurück, der hier keine Ausnahme mehr ist', async () => {
    const { href, etag, serieId } = await anlegen();

    graph.anfragen = [];
    await client.ablegen(href, serienDatei({ ausnahmen: ['abgesagt'] }), {
      etag,
    });

    const [zurueck] = geschrieben('PATCH');

    expect(zurueck?.url.pathname).toContain('_occ_2026-10-26');
    expect(graph.ausnahmen.get(serieId)?.get('2026-10-26')).toMatchObject({
      subject: 'Jour fixe',
      start: { dateTime: '2026-10-26T09:00:00.0000000' },
    });
  });

  it('löscht einen Tag, der hier ausfällt, auch wenn er dort geändert war', async () => {
    const { href, etag, serieId } = await anlegen();

    graph.inOutlookAendern(serieId, '2026-11-30', { subject: 'Anders' });

    const [vorher] = await client.abfragen(KAL, VON, BIS);

    await client.ablegen(
      href,
      serienDatei({ ausfaelle: ['2026-11-09', '2026-11-30'] }),
      { etag: vorher.etag ?? etag },
    );

    expect(graph.ausnahmen.get(serieId)?.has('2026-11-30')).toBe(false);
    expect([...(graph.abgesagt.get(serieId) ?? [])].sort()).toEqual([
      '2026-11-09',
      '2026-11-30',
    ]);
  });

  it('teilt die Serie („dieser und alle folgenden“) und behält die Tage davor', async () => {
    const { href, etag, serieId } = await anlegen();

    graph.anfragen = [];

    const geteilt = await client.ablegen(
      href,
      serienDatei({
        regel: 'FREQ=WEEKLY;BYDAY=MO;UNTIL=20261101',
        ausfaelle: [],
        ausnahmen: ['verschoben'],
      }),
      { etag },
    );
    const patch = graph.anfragen.find(
      (anfrage) =>
        anfrage.methode === 'PATCH' && anfrage.url.toString() === href,
    );

    expect(geteilt.konflikt).toBe(false);
    expect(JSON.parse(patch?.rumpf ?? '{}')).toMatchObject({
      recurrence: { range: { type: 'endDate', endDate: '2026-11-01' } },
    });
    expect(graph.ausnahmen.get(serieId)?.get('2026-10-26')).toMatchObject({
      subject: 'Jour fixe (verschoben)',
    });
    expect(graph.ausnahmen.get(serieId)?.size).toBe(1);
  });

  it('ganztägig über die Zeitumstellung: der Tag bleibt der Tag', async () => {
    const kopf = instantFromBerlin('2026-10-24', '00:00');
    const ics = buildIcs(
      [
        {
          uid: 'urlaub@app.stegwerk.test',
          startsAt: kopf,
          endsAt: instantFromBerlin('2026-10-25', '00:00'),
          allDay: true,
          summary: 'Messe',
          recurrence: 'FREQ=DAILY;COUNT=5',
          skippedDates: ['2026-10-27'],
        },
        {
          uid: 'urlaub@app.stegwerk.test',
          startsAt: instantFromBerlin('2026-10-26', '00:00'),
          endsAt: instantFromBerlin('2026-10-27', '00:00'),
          allDay: true,
          summary: 'Messe – Aufbau',
          ausnahmeVon: {
            tag: '2026-10-26',
            ganztaegig: true,
            uhrzeit: '00:00',
          },
        },
      ],
      { ohneMethode: true },
    );
    const { serieId } = await anlegen(ics);

    expect(graph.ausnahmen.get(serieId)?.get('2026-10-26')).toMatchObject({
      subject: 'Messe – Aufbau',
      originalStart: '2026-10-25T23:00:00Z',
    });

    const [objekt] = await client.abfragen(KAL, VON, BIS);
    const datei = liesIcs(objekt.ics);

    expect(datei.termine[0].ausfaelle).toEqual(['2026-10-27']);
    expect(datei.ausnahmen.map((ausnahme) => ausnahme.serienTag)).toEqual([
      '2026-10-26',
    ]);
    expect(datei.ausnahmen[0].ganztaegig).toBe(true);
    expect(berlinDate(datei.ausnahmen[0].startsAt)).toBe('2026-10-26');
  });

  it('ein etag aus der Zeit vor den Tagen vergleicht nur die Serie', async () => {
    const { href, serieId } = await anlegen();
    const alt = graph.ereignisse.get(serieId)?.['@odata.etag'];

    expect(
      (await client.ablegen(href, serienDatei(), { etag: alt })).konflikt,
    ).toBe(false);
  });

  it('liest den Tag aus dem ursprünglichen Beginn, sonst aus der occurrenceId', () => {
    expect(serienTagVon({ originalStart: '2026-03-28T23:30:00Z' })).toBe(
      '2026-03-29',
    );
    expect(serienTagVon({ occurrenceId: 'OID.AAMk=.2026-05-07' })).toBe(
      '2026-05-07',
    );
    expect(serienTagVon({})).toBeNull();
  });
});

describe('Outlook-Serien im Abgleich', () => {
  let dataSource: DataSource;
  let service: KalenderSyncService;
  let workspaceId: string;
  let userId: string;

  const termine = () => dataSource.getRepository(AppointmentEntity);
  const JETZT = new Date('2026-10-20T08:00:00Z');

  beforeAll(async () => {
    dataSource = await createTestDatabase(SUITE);
    graph = new FakeGraph();
    client = new GraphKalenderClient(graph.transport, () =>
      Promise.resolve('token'),
    );

    const config = {
      get: (schluessel: string) =>
        ({
          mailEncryptionKey: randomBytes(32).toString('base64'),
          webOrigin: 'https://app.stegwerk.test',
        })[schluessel],
    } as unknown as ConfigService;

    service = new KalenderSyncService(
      dataSource.getRepository(KalenderVerbindungEntity),
      dataSource.getRepository(KalenderEintragEntity),
      termine(),
      dataSource.getRepository(AppointmentAttendeeEntity),
      dataSource.getRepository(ContactEntity),
      dataSource.getRepository(UserEntity),
      {} as MailboxesService,
      config,
      (anfrage) => graph.transport(anfrage),
      {
        zugriffstoken: () => Promise.resolve('token'),
      } as unknown as OAuthService,
    );
  });

  afterAll(async () => {
    await dropTestDatabase(dataSource, SUITE);
  });

  it('führt beim ersten Abgleich beide Seiten zusammen, ohne Hin und Her', async () => {
    const workspaces = dataSource.getRepository(WorkspaceEntity);
    const users = dataSource.getRepository(UserEntity);

    workspaceId = (
      await workspaces.save(workspaces.create({ name: 'Wir', slug: 'wir-g' }))
    ).id;
    userId = (
      await users.save(
        users.create({
          email: 'ich@wir-g.de',
          passwordHash: 'x',
          firstName: 'Ich',
          lastName: 'Selbst',
        }),
      )
    ).id;

    const verbindung = await dataSource
      .getRepository(KalenderVerbindungEntity)
      .save({
        workspaceId,
        userId,
        anbieter: 'microsoft',
        oauthZugangId: randomUUID(),
        serverUrl: GRAPH,
        benutzer: 'ich@wir-g.de',
        passwortVersiegelt: '',
        kalenderUrl: KAL,
        kalenderName: 'Kalender',
      });

    const serie = await termine().save(
      termine().create({
        workspaceId,
        ownerId: userId,
        createdById: userId,
        title: 'Jour fixe',
        description: null,
        location: 'Büro',
        startsAt: instantFromBerlin('2026-10-19', '10:00'),
        endsAt: instantFromBerlin('2026-10-19', '11:00'),
        allDay: false,
        remindMinutesBefore: null,
        remindedAt: null,
        recurrence: 'FREQ=WEEKLY;BYDAY=MO',
        skippedDates: ['2026-10-26', '2026-11-09'],
        companyId: null,
        contactId: null,
        dealId: null,
      }),
    );

    await termine().save(
      termine().create({
        workspaceId,
        ownerId: userId,
        createdById: userId,
        title: 'Jour fixe (verschoben)',
        description: null,
        location: 'Büro',
        startsAt: instantFromBerlin('2026-10-26', '14:00'),
        endsAt: instantFromBerlin('2026-10-26', '15:00'),
        allDay: false,
        remindMinutesBefore: null,
        remindedAt: null,
        recurrence: null,
        skippedDates: [],
        companyId: null,
        contactId: null,
        dealId: null,
        serieId: serie.id,
        serieDatum: '2026-10-26',
      }),
    );

    const dort = await client.ablegen(
      client.neueAdresse(KAL, serie.id),
      buildIcs(
        [
          {
            uid: `${serie.id}@app.stegwerk.test`,
            startsAt: serie.startsAt,
            endsAt: serie.endsAt,
            summary: 'Jour fixe',
            location: 'Büro',
            recurrence: 'FREQ=WEEKLY;BYDAY=MO',
          },
        ],
        { ohneMethode: true },
      ),
    );
    const serieDort = decodeURIComponent(dort.href?.split('/').pop() ?? '');

    graph.inOutlookAendern(serieDort, '2026-11-16', {
      subject: 'Jour fixe mit Gast',
    });

    await dataSource.getRepository(KalenderEintragEntity).save({
      verbindungId: verbindung.id,
      appointmentId: serie.id,
      href: dort.href ?? '',
      uid: `${serie.id}@app.stegwerk.test`,
      etag: graph.ereignisse.get(serieDort)?.['@odata.etag'] ?? null,
      lokalStand: (await termine().findOneByOrFail({ id: serie.id })).updatedAt,
    });

    expect(
      await service.abgleichen(
        await dataSource
          .getRepository(KalenderVerbindungEntity)
          .findOneByOrFail({ id: verbindung.id }),
        JETZT,
      ),
    ).toMatchObject({ hochgeladen: 1, geloescht: 0 });

    const tage = await termine().find({
      where: { serieId: serie.id },
      order: { serieDatum: 'ASC' },
    });

    expect(tage.map((tag) => [tag.serieDatum, tag.title])).toEqual([
      ['2026-10-26', 'Jour fixe (verschoben)'],
      ['2026-11-16', 'Jour fixe mit Gast'],
    ]);
    expect(
      (await termine().findOneByOrFail({ id: serie.id })).skippedDates,
    ).toEqual(['2026-10-26', '2026-11-09', '2026-11-16']);

    expect(graph.ausnahmen.get(serieDort)?.get('2026-10-26')).toMatchObject({
      subject: 'Jour fixe (verschoben)',
    });
    expect(graph.ausnahmen.get(serieDort)?.get('2026-11-16')).toMatchObject({
      subject: 'Jour fixe mit Gast',
    });
    expect([...(graph.abgesagt.get(serieDort) ?? [])]).toEqual(['2026-11-09']);

    expect(
      await service.abgleichen(
        await dataSource
          .getRepository(KalenderVerbindungEntity)
          .findOneByOrFail({ id: verbindung.id }),
        JETZT,
      ),
    ).toEqual({ neu: 0, geaendert: 0, geloescht: 0, hochgeladen: 0 });

    graph.inOutlookAendern(serieDort, '2026-11-23', {
      start: utc(instantFromBerlin('2026-11-23', '16:00')),
      end: utc(instantFromBerlin('2026-11-23', '17:00')),
    });

    expect(
      (
        await service.abgleichen(
          await dataSource
            .getRepository(KalenderVerbindungEntity)
            .findOneByOrFail({ id: verbindung.id }),
          JETZT,
        )
      ).geaendert,
    ).toBe(1);

    const verschoben = await termine().findOneByOrFail({
      serieId: serie.id,
      serieDatum: '2026-11-23',
    });

    expect(verschoben.startsAt.toISOString()).toBe('2026-11-23T15:00:00.000Z');
    expect(await termine().countBy({ serieId: serie.id })).toBe(3);
  });
});
