import {
  ausserHausText,
  groesseText,
  probeText,
  type Sicherung,
} from '../lib/sicherungText';

const ZEIT = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const zeit = (iso: string | null) =>
  iso === null ? '—' : ZEIT.format(new Date(iso));

export const BetriebSicherung = ({ sicherung }: { sicherung: Sicherung }) => (
  <section className="detail-section" aria-labelledby="betrieb-sicherung">
    <h2 id="betrieb-sicherung">Sicherung</h2>

    {sicherung.zustand === 'aus' ? (
      <p className="field__hint">
        Auf dieser Anlage liegt kein Stand der Sicherung vor. Auf dem Server
        richtet das Auslieferungsskript die nächtliche Sicherung und den
        wöchentlichen Wiederherstellungstest ein (docs/sicherung.md).
      </p>
    ) : (
      <>
        {sicherung.warnungen.length > 0 && (
          <div className="banner banner--warning" role="status">
            <ul className="betrieb-sicherung__warnungen">
              {sicherung.warnungen.map((warnung) => (
                <li key={warnung}>{warnung}</li>
              ))}
            </ul>
          </div>
        )}
        <dl className="betrieb-sicherung">
          <dt>Letzte Sicherung</dt>
          <dd>
            {zeit(sicherung.letzteSicherung)}
            {sicherung.groesseBytes !== null &&
              `, ${groesseText(sicherung.groesseBytes)}`}
            {sicherung.anzahl !== null &&
              ` · ${String(sicherung.anzahl)} auf dem Server`}
          </dd>
          <dt>Außer Haus</dt>
          <dd>{ausserHausText(sicherung.ausserHaus, sicherung.kopien)}</dd>
          <dt>Letzter Wiederherstellungstest</dt>
          <dd>
            {sicherung.probeAm === null ? '' : `${zeit(sicherung.probeAm)}: `}
            {probeText(sicherung)}
          </dd>
          {sicherung.letzterFehler !== null && (
            <>
              <dt>Letzter Fehler</dt>
              <dd>
                {zeit(sicherung.letzterFehlerAm)}: {sicherung.letzterFehler}
              </dd>
            </>
          )}
        </dl>
        <p className="field__hint">
          Ob der Rechner im Büro die Kopie wirklich abgeholt hat, sieht der
          Server nicht; das steht in protokoll.txt auf dem Büro-Rechner.
        </p>
      </>
    )}
  </section>
);
