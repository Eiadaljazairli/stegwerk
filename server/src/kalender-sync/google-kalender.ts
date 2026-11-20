import {
  CalDavClient,
  type GefundenerKalender,
  KalenderFehler,
  type Transport,
} from './caldav-client';

export const GOOGLE_CALDAV = 'https://apidata.googleusercontent.com/caldav/v2/';
const GOOGLE_LISTE =
  'https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=writer&maxResults=250';

const GOOGLE_HOSTS = new Set([
  'apidata.googleusercontent.com',
  'www.googleapis.com',
]);

type ListenEintrag = {
  id?: unknown;
  summary?: unknown;
  summaryOverride?: unknown;
  primary?: unknown;
};

export class GoogleKalenderClient extends CalDavClient {
  constructor(transport: Transport, bearer: () => Promise<string>) {
    super(transport, '', '', false, { bearer, nurHosts: GOOGLE_HOSTS });
  }

  override async entdecken(): Promise<GefundenerKalender[]> {
    const bearer = this.optionen.bearer;

    if (bearer === undefined) {
      throw new KalenderFehler('Für Google fehlt die Anmeldung.');
    }

    const url = new URL(GOOGLE_LISTE);

    this.pruefeHost(url);

    const antwort = await this.transport({
      methode: 'GET',
      url,
      kopf: {
        authorization: `Bearer ${await bearer()}`,
        accept: 'application/json',
      },
    });

    if (antwort.status === 401 || antwort.status === 403) {
      throw new KalenderFehler(
        'Google hat den Zugriff auf den Kalender abgelehnt. Bitte neu verbinden.',
      );
    }

    if (antwort.status !== 200) {
      throw new KalenderFehler('Die Kalender ließen sich nicht abrufen.');
    }

    let eintraege: ListenEintrag[];

    try {
      const inhalt = JSON.parse(antwort.rumpf) as { items?: unknown };

      eintraege = Array.isArray(inhalt.items)
        ? (inhalt.items as ListenEintrag[])
        : [];
    } catch {
      throw new KalenderFehler('Google hat unverständlich geantwortet.');
    }

    return eintraege
      .filter(
        (eintrag): eintrag is ListenEintrag & { id: string } =>
          typeof eintrag.id === 'string' && eintrag.id !== '',
      )
      .sort((a, b) => Number(b.primary === true) - Number(a.primary === true))
      .map((eintrag) => ({
        url: `${GOOGLE_CALDAV}${encodeURIComponent(eintrag.id)}/events/`,
        name: (typeof eintrag.summaryOverride === 'string'
          ? eintrag.summaryOverride
          : typeof eintrag.summary === 'string'
            ? eintrag.summary
            : eintrag.id
        ).slice(0, 200),
      }));
  }
}
