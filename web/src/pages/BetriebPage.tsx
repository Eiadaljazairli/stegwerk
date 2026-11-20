import { useQuery } from '@apollo/client';
import { useState } from 'react';

import { BetriebKontoDetail } from '../components/BetriebKontoDetail';
import { ObjectHeader } from '../components/ObjectHeader';
import { IconData } from '../components/Icons';
import { LoadingAnnouncement } from '../components/Skeleton';
import { BETRIEBS_UEBERSICHT, ENTITLEMENT } from '../lib/queries';
import { formatDate } from '../lib/types';
import { BetriebSystem } from '../components/BetriebSystem';
import { TableWrap } from '../components/TableWrap';

type Zahlen = {
  konten: number;
  bestaetigt: number;
  neuDieseWoche: number;
  aktivDieseWoche: number;
  mitZweiFaktor: number;
  offeneEinladungen: number;
  arbeitsbereiche: number;
  zahlend: number;
  inTestphase: number;
};

type Konto = {
  id: string;
  email: string;
  name: string;
  bestaetigt: boolean;
  zweiFaktor: boolean;
  bereiche: number;
  bereichNamen: string[];
  zuletztAktiv: string | null;
  angelegt: string;
};

type Bereich = {
  id: string;
  name: string;
  mitglieder: number;
  inhaber: string | null;
  firmen: number;
  kontakte: number;
  geschaefte: number;
  angebote: number;
  rechnungen: number;
  speicherBytes: number;
  zuletztAktiv: string | null;
  plan: string | null;
  status: string | null;
  testphaseBis: string | null;
  laeuftBis: string | null;
  angelegt: string;
};

const PLAN: Record<string, string> = {
  TRIAL: 'Testphase',
  STARTER: 'Starter',
  PROFESSIONAL: 'Professional',
};

const STATUS: Record<string, string> = {
  TRIALING: 'Testphase',
  ACTIVE: 'Aktiv',
  PAST_DUE: 'Zahlung offen',
  CANCELED: 'Gekündigt',
};

const ZEIT = new Intl.RelativeTimeFormat('de-DE', { numeric: 'auto' });

const zuletzt = (iso: string | null): string => {
  if (iso === null) {
    return 'nie';
  }

  const minuten = Math.round((new Date(iso).getTime() - Date.now()) / 60_000);

  if (minuten > -60) {
    return ZEIT.format(Math.min(minuten, 0), 'minute');
  }

  if (minuten > -24 * 60) {
    return ZEIT.format(Math.round(minuten / 60), 'hour');
  }

  if (minuten > -14 * 24 * 60) {
    return ZEIT.format(Math.round(minuten / (24 * 60)), 'day');
  }

  return formatDate(iso);
};

const speicher = (bytes: number): string =>
  bytes === 0
    ? '—'
    : bytes < 1024 * 1024
      ? `${Math.max(1, Math.round(bytes / 1024))} KB`
      : `${(bytes / (1024 * 1024)).toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB`;

const passt = (suche: string, ...felder: string[]) =>
  suche === '' ||
  felder.some((feld) => feld.toLowerCase().includes(suche.toLowerCase()));

export const BetriebPage = () => {
  const { data, loading, error } = useQuery<{
    betriebsUebersicht: {
      zahlen: Zahlen;
      konten: Konto[];
      bereiche: Bereich[];
    };
  }>(BETRIEBS_UEBERSICHT, { fetchPolicy: 'cache-and-network' });
  const [suche, setSuche] = useState('');
  const [offen, setOffen] = useState<string | null>(null);
  const { data: abrechnung } = useQuery<{
    entitlement: { billingConfigured: boolean };
  }>(ENTITLEMENT);
  const mitAbo = abrechnung?.entitlement.billingConfigured === true;

  if (loading && data === undefined) {
    return <LoadingAnnouncement />;
  }

  if (error !== undefined) {
    return <div className="error-banner">{error.message}</div>;
  }

  if (data === undefined) {
    return null;
  }

  const { zahlen, konten, bereiche } = data.betriebsUebersicht;
  const sichtbareKonten = konten.filter((k) => passt(suche, k.email, k.name));
  const sichtbareBereiche = bereiche.filter((b) =>
    passt(suche, b.name, b.inhaber ?? ''),
  );

  return (
    <>
      <ObjectHeader
        kind="data"
        icon={IconData}
        label="Betreiber"
        title="Betrieb"
        note="Wer sich angemeldet hat, wann er online war und was er benutzt. Eine Adresse anklicken für die Einzelheiten. Nur Arten und Anzahlen — was die Kunden speichern, steht hier nicht."
      />

      <div className="metrics betrieb-zahlen">
        <div className="card metric">
          <div className="metric__label">Konten</div>
          <div className="metric__value">{zahlen.konten}</div>
        </div>
        <div className="card metric">
          <div className="metric__label">Adresse bestätigt</div>
          <div className="metric__value">{zahlen.bestaetigt}</div>
        </div>
        <div className="card metric">
          <div className="metric__label">Mit 2FA</div>
          <div className="metric__value">{zahlen.mitZweiFaktor}</div>
        </div>
        <div className="card metric">
          <div className="metric__label">Neu in 7 Tagen</div>
          <div className="metric__value">{zahlen.neuDieseWoche}</div>
        </div>
        <div className="card metric">
          <div className="metric__label">Aktiv in 7 Tagen</div>
          <div className="metric__value">{zahlen.aktivDieseWoche}</div>
        </div>
        <div className="card metric">
          <div className="metric__label">Arbeitsbereiche</div>
          <div className="metric__value">{zahlen.arbeitsbereiche}</div>
        </div>
        <div className="card metric">
          <div className="metric__label">Offene Einladungen</div>
          <div className="metric__value">{zahlen.offeneEinladungen}</div>
        </div>
        {mitAbo && (
          <>
            <div className="card metric">
              <div className="metric__label">In Testphase</div>
              <div className="metric__value">{zahlen.inTestphase}</div>
            </div>
            <div className="card metric">
              <div className="metric__label">Zahlend</div>
              <div className="metric__value">{zahlen.zahlend}</div>
            </div>
          </>
        )}
      </div>

      <BetriebSystem />

      <div className="field betrieb-suche">
        <label htmlFor="betrieb-suche">Suchen</label>
        <input
          id="betrieb-suche"
          type="search"
          placeholder="Adresse, Name oder Bereich"
          value={suche}
          onChange={(event) => setSuche(event.target.value)}
        />
      </div>

      {offen !== null && (
        <BetriebKontoDetail
          id={offen}
          zuletzt={zuletzt}
          onClose={() => setOffen(null)}
        />
      )}

      <section className="detail-section">
        <div className="section-heading">
          <h2>Konten ({sichtbareKonten.length})</h2>
        </div>
        <TableWrap>
          <table className="list-table">
            <thead>
              <tr>
                <th>Adresse</th>
                <th>Name</th>
                <th>Bestätigt</th>
                <th>2FA</th>
                <th>Bereiche</th>
                <th>Zuletzt aktiv</th>
                <th>Seit</th>
              </tr>
            </thead>
            <tbody>
              {sichtbareKonten.map((konto) => (
                <tr key={konto.id}>
                  <td data-label="Adresse">
                    <button
                      type="button"
                      className="link-button"
                      aria-expanded={offen === konto.id}
                      onClick={() =>
                        setOffen(offen === konto.id ? null : konto.id)
                      }
                    >
                      {konto.email}
                    </button>
                  </td>
                  <td data-label="Name">
                    {konto.name === '' ? '—' : konto.name}
                  </td>
                  <td data-label="Bestätigt">
                    {konto.bestaetigt ? 'Ja' : 'Nein'}
                  </td>
                  <td data-label="2FA">{konto.zweiFaktor ? 'Ja' : 'Nein'}</td>
                  <td data-label="Bereiche">
                    {konto.bereichNamen.length === 0
                      ? '—'
                      : konto.bereichNamen.join(', ')}
                  </td>
                  <td data-label="Zuletzt aktiv">
                    {zuletzt(konto.zuletztAktiv)}
                  </td>
                  <td data-label="Seit">{formatDate(konto.angelegt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </section>

      <section className="detail-section">
        <div className="section-heading">
          <h2>Arbeitsbereiche ({sichtbareBereiche.length})</h2>
        </div>
        <TableWrap>
          <table className="list-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Inhaber</th>
                <th className="numeric">Mitglieder</th>
                <th className="numeric">Firmen</th>
                <th className="numeric">Kontakte</th>
                <th className="numeric">Geschäfte</th>
                <th className="numeric">Angebote</th>
                <th className="numeric">Rechnungen</th>
                <th className="numeric">Anhänge</th>
                <th>Zuletzt aktiv</th>
                {mitAbo && (
                  <>
                    <th>Tarif</th>
                    <th>Stand</th>
                    <th>Testphase bis</th>
                    <th>Bezahlt bis</th>
                  </>
                )}
                <th>Seit</th>
              </tr>
            </thead>
            <tbody>
              {sichtbareBereiche.map((bereich) => (
                <tr key={bereich.id}>
                  <td data-label="Name">{bereich.name}</td>
                  <td data-label="Inhaber">{bereich.inhaber ?? '—'}</td>
                  <td data-label="Mitglieder" className="numeric">
                    {bereich.mitglieder}
                  </td>
                  <td data-label="Firmen" className="numeric">
                    {bereich.firmen}
                  </td>
                  <td data-label="Kontakte" className="numeric">
                    {bereich.kontakte}
                  </td>
                  <td data-label="Geschäfte" className="numeric">
                    {bereich.geschaefte}
                  </td>
                  <td data-label="Angebote" className="numeric">
                    {bereich.angebote}
                  </td>
                  <td data-label="Rechnungen" className="numeric">
                    {bereich.rechnungen}
                  </td>
                  <td data-label="Anhänge" className="numeric">
                    {speicher(bereich.speicherBytes)}
                  </td>
                  <td data-label="Zuletzt aktiv">
                    {zuletzt(bereich.zuletztAktiv)}
                  </td>
                  {mitAbo && (
                    <>
                      <td data-label="Tarif">
                        {bereich.plan === null
                          ? '—'
                          : (PLAN[bereich.plan] ?? bereich.plan)}
                      </td>
                      <td data-label="Stand">
                        {bereich.status === null
                          ? '—'
                          : (STATUS[bereich.status] ?? bereich.status)}
                      </td>
                      <td data-label="Testphase bis">
                        {formatDate(bereich.testphaseBis)}
                      </td>
                      <td data-label="Bezahlt bis">
                        {formatDate(bereich.laeuftBis)}
                      </td>
                    </>
                  )}
                  <td data-label="Seit">{formatDate(bereich.angelegt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </section>
    </>
  );
};
