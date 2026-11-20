import { type FormEvent, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { Wordmark } from '../components/Wordmark';
import { API_ROOT } from '../lib/download';
import { formatDate, formatMoney } from '../lib/types';
import { TableWrap } from '../components/TableWrap';

type Angebot = {
  number: string;
  status: 'offen' | 'angenommen' | 'abgelehnt';
  issuedOn: string;
  validUntil: string;
  abgelaufen: boolean;
  absender: {
    name: string | null;
    street: string | null;
    postalCode: string | null;
    city: string | null;
    email: string | null;
    phone: string | null;
  };
  empfaenger: string | null;
  introText: string | null;
  closingText: string | null;
  smallBusiness: boolean;
  steuerHinweise?: string[];
  positionen: {
    name: string;
    description: string | null;
    quantity: number;
    unit: string;
    unitPriceCents: number;
    discountPercent: number;
    taxRatePercent: number;
    netCents: number;
  }[];
  summen: {
    netCents: number;
    taxCents: number;
    grossCents: number;
    taxGroups: { ratePercent: number; netCents: number; taxCents: number }[];
  };
  entschieden: { am: string; name: string | null } | null;
};

const lesen = async (antwort: Response): Promise<Angebot> => {
  const inhalt = (await antwort.json().catch(() => null)) as
    | (Angebot & { message?: string | string[] })
    | null;

  if (!antwort.ok) {
    const meldung = inhalt?.message;

    throw new Error(
      Array.isArray(meldung)
        ? meldung.join(' ')
        : (meldung ?? 'Das hat nicht geklappt.'),
    );
  }

  return inhalt as Angebot;
};

const menge = (wert: number): string =>
  new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 }).format(wert);

export const PublicQuotePage = () => {
  const { token = '' } = useParams();
  const [angebot, setAngebot] = useState<Angebot | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [bestaetigt, setBestaetigt] = useState(false);
  const [sendet, setSendet] = useState(false);

  useEffect(() => {
    if (angebot === null) {
      return;
    }

    const vorher = document.title;

    document.title = `Angebot ${angebot.number}`;

    return () => {
      document.title = vorher;
    };
  }, [angebot]);

  const basis = `${API_ROOT}/public/quotes/${encodeURIComponent(token)}`;

  useEffect(() => {
    void fetch(basis)
      .then(lesen)
      .then(setAngebot)
      .catch((problem: Error) => setFehler(problem.message));
  }, [basis]);

  const entscheiden = async (annehmen: boolean) => {
    setFehler(null);
    setSendet(true);

    try {
      const antwort = await fetch(`${basis}/decision`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ annehmen, name }),
      });

      setAngebot(await lesen(antwort));
    } catch (problem) {
      setFehler(problem instanceof Error ? problem.message : 'Fehler.');
    } finally {
      setSendet(false);
    }
  };

  if (angebot === null) {
    return (
      <div className="public-quote">
        <div className="public-quote__inner">
          {fehler === null ? (
            <p className="field__hint">Angebot wird geladen…</p>
          ) : (
            <div className="error-banner">{fehler}</div>
          )}
        </div>
      </div>
    );
  }

  const { absender, summen } = angebot;
  const ort = [absender.postalCode, absender.city].filter(Boolean).join(' ');

  const annehmen = (event: FormEvent) => {
    event.preventDefault();
    void entscheiden(true);
  };

  return (
    <div className="public-quote">
      <div className="public-quote__inner">
        <header className="public-quote__sender">
          <div className="public-quote__sender-name">
            {absender.name ?? 'Angebot'}
          </div>
          <div className="public-quote__sender-meta">
            {[absender.street, ort, absender.email, absender.phone]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </header>

        <article className="card public-quote__doc">
          <div className="public-quote__head">
            <div>
              <div className="public-quote__eyebrow">Angebot</div>
              <h1>{angebot.number}</h1>
              <p className="field__hint">
                vom {formatDate(angebot.issuedOn)} · gültig bis{' '}
                {formatDate(angebot.validUntil)}
              </p>
            </div>
            <a className="button button--ghost" href={`${basis}/pdf`}>
              Als PDF laden
            </a>
          </div>

          {angebot.empfaenger !== null && (
            <p className="public-quote__recipient">{angebot.empfaenger}</p>
          )}

          {angebot.introText !== null && (
            <p className="public-quote__text">{angebot.introText}</p>
          )}

          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th>Leistung</th>
                  <th className="numeric public-quote__wide">Menge</th>
                  <th className="numeric public-quote__wide">Einzelpreis</th>
                  <th className="numeric">Betrag</th>
                </tr>
              </thead>
              <tbody>
                {angebot.positionen.map((zeile, index) => (
                  <tr key={index}>
                    <td>
                      <div className="public-quote__item">{zeile.name}</div>
                      <div className="field__hint public-quote__narrow">
                        {menge(zeile.quantity)} {zeile.unit} ×{' '}
                        {formatMoney(zeile.unitPriceCents)}
                      </div>
                      {zeile.description !== null && (
                        <div className="field__hint">{zeile.description}</div>
                      )}
                      {zeile.discountPercent > 0 && (
                        <div className="field__hint">
                          abzüglich {menge(zeile.discountPercent)} % Rabatt
                        </div>
                      )}
                    </td>
                    <td className="numeric public-quote__wide">
                      {menge(zeile.quantity)} {zeile.unit}
                    </td>
                    <td className="numeric public-quote__wide">
                      {formatMoney(zeile.unitPriceCents)}
                    </td>
                    <td className="numeric">{formatMoney(zeile.netCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>

          <dl className="public-quote__totals">
            <div>
              <dt>Nettobetrag</dt>
              <dd>{formatMoney(summen.netCents)}</dd>
            </div>
            {angebot.smallBusiness ? (
              <div>
                <dt>Umsatzsteuer</dt>
                <dd>entfällt nach § 19 UStG</dd>
              </div>
            ) : (
              summen.taxGroups.map((gruppe) => (
                <div key={gruppe.ratePercent}>
                  <dt>Umsatzsteuer {gruppe.ratePercent} %</dt>
                  <dd>{formatMoney(gruppe.taxCents)}</dd>
                </div>
              ))
            )}
            <div className="public-quote__total">
              <dt>Gesamtbetrag</dt>
              <dd>{formatMoney(summen.grossCents)}</dd>
            </div>
          </dl>

          {(angebot.steuerHinweise ?? []).map((hinweis) => (
            <p key={hinweis} className="public-quote__text">
              {hinweis}
            </p>
          ))}

          {angebot.closingText !== null && (
            <p className="public-quote__text">{angebot.closingText}</p>
          )}
        </article>

        {angebot.status !== 'offen' ? (
          <div
            className={
              angebot.status === 'angenommen'
                ? 'public-quote__result public-quote__result--yes'
                : 'public-quote__result'
            }
            role="status"
          >
            {angebot.status === 'angenommen' ? 'Angenommen' : 'Abgelehnt'}
            {angebot.entschieden !== null &&
              ` am ${formatDate(angebot.entschieden.am.slice(0, 10))}`}
            {angebot.entschieden?.name !== null &&
              angebot.entschieden?.name !== undefined &&
              ` von ${angebot.entschieden.name}`}
            .{' '}
            {angebot.status === 'angenommen' &&
              `${absender.name ?? 'Der Absender'} ist benachrichtigt.`}
          </div>
        ) : (
          <form className="card public-quote__decide" onSubmit={annehmen}>
            <h2>Ihre Entscheidung</h2>

            {fehler !== null && <div className="error-banner">{fehler}</div>}

            {angebot.abgelaufen ? (
              <p className="field__hint">
                Dieses Angebot war bis zum {formatDate(angebot.validUntil)}{' '}
                gültig. Für ein neues wenden Sie sich bitte an{' '}
                {absender.name ?? 'den Absender'}
                {absender.email !== null && ` (${absender.email})`}.
              </p>
            ) : (
              <>
                <div className="field">
                  <label htmlFor="angebot-name">Ihr vollständiger Name</label>
                  <input
                    id="angebot-name"
                    value={name}
                    autoComplete="name"
                    maxLength={200}
                    onChange={(event) => setName(event.target.value)}
                    required
                  />
                </div>
                <label className="public-quote__check">
                  <input
                    type="checkbox"
                    checked={bestaetigt}
                    onChange={(event) => setBestaetigt(event.target.checked)}
                  />
                  Ich nehme dieses Angebot über {formatMoney(summen.grossCents)}{' '}
                  verbindlich an.
                </label>
                <div className="public-quote__buttons">
                  <button
                    className="button button--lg"
                    type="submit"
                    disabled={sendet || !bestaetigt || name.trim().length < 2}
                  >
                    Angebot annehmen
                  </button>
                  <button
                    className="button button--ghost"
                    type="button"
                    disabled={sendet || name.trim().length < 2}
                    onClick={() => void entscheiden(false)}
                  >
                    Ablehnen
                  </button>
                </div>
              </>
            )}
          </form>
        )}

        <footer className="public-quote__footer">
          Bereitgestellt mit <Wordmark size={12} />
        </footer>
      </div>
    </div>
  );
};
