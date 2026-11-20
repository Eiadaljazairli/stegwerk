import { type ApolloCache, useMutation, useQuery } from '@apollo/client';
import { type FormEvent, useState } from 'react';

import { ConfirmDialog } from '../components/ConfirmDialog';
import { IconData } from '../components/Icons';
import { ObjectHeader } from '../components/ObjectHeader';
import { useToast } from '../components/Toast';
import {
  BEZEICHNUNG_MAX,
  eingabeFehler,
  form,
  type Genus,
  GENUS_TEXT,
  type ObjektArt,
  type ObjektBezeichnung,
  OBJEKT_ARTEN,
  STANDARD_BEZEICHNUNGEN,
} from '../lib/bezeichnung';
import {
  OBJEKT_BEZEICHNUNGEN,
  SETZE_OBJEKT_BEZEICHNUNG,
  SETZE_OBJEKT_BEZEICHNUNG_ZURUECK,
} from '../lib/queries';
import { usePermissions } from '../lib/usePermissions';

type Antwort = { objektBezeichnungen: ObjektBezeichnung[] };

const inDenCache = (
  cache: ApolloCache<unknown>,
  liste: ObjektBezeichnung[] | undefined,
) => {
  if (liste !== undefined) {
    cache.writeQuery<Antwort>({
      query: OBJEKT_BEZEICHNUNGEN,
      data: { objektBezeichnungen: liste },
    });
  }
};

const Zeile = ({
  eintrag,
  darf,
}: {
  eintrag: ObjektBezeichnung;
  darf: boolean;
}) => {
  const toast = useToast();
  const [einzahl, setEinzahl] = useState(eintrag.einzahl);
  const [mehrzahl, setMehrzahl] = useState(eintrag.mehrzahl);
  const [genus, setGenus] = useState<Genus>(eintrag.genus);
  const [setzen, setzung] = useMutation<{
    setzeObjektBezeichnung: ObjektBezeichnung[];
  }>(SETZE_OBJEKT_BEZEICHNUNG, {
    update: (cache, { data }) =>
      inDenCache(cache, data?.setzeObjektBezeichnung),
  });
  const [zurueck, zuruecksetzung] = useMutation<{
    setzeObjektBezeichnungZurueck: ObjektBezeichnung[];
  }>(SETZE_OBJEKT_BEZEICHNUNG_ZURUECK, {
    update: (cache, { data }) =>
      inDenCache(cache, data?.setzeObjektBezeichnungZurueck),
  });

  const id = `objekt-${eintrag.art.toLowerCase()}`;
  const fehler = eingabeFehler(einzahl, mehrzahl);
  const geaendert =
    einzahl.trim() !== eintrag.einzahl ||
    mehrzahl.trim() !== eintrag.mehrzahl ||
    genus !== eintrag.genus;
  const vorschau = {
    einzahl: einzahl.trim(),
    mehrzahl: mehrzahl.trim(),
    genus,
  };
  const standard = STANDARD_BEZEICHNUNGEN[eintrag.art];
  const serverFehler = setzung.error ?? zuruecksetzung.error;

  const speichern = (event: FormEvent) => {
    event.preventDefault();

    if (fehler !== null) {
      return;
    }

    void setzen({
      variables: {
        input: {
          art: eintrag.art,
          einzahl: einzahl.trim(),
          mehrzahl: mehrzahl.trim(),
          genus,
        },
      },
    })
      .then(() => {
        toast.zeige({ text: `${eintrag.standardMehrzahl}: gespeichert.` });
      })
      .catch(() => null);
  };

  const aufStandard = () => {
    void zurueck({ variables: { art: eintrag.art } })
      .then(() => {
        toast.zeige({
          text: `${eintrag.standardMehrzahl} heißen wieder ${standard.mehrzahl}.`,
        });
      })
      .catch(() => null);
  };

  return (
    <li className="objekte__zeile">
      <form onSubmit={speichern} aria-labelledby={`${id}-titel`}>
        <h3 id={`${id}-titel`} className="objekte__titel">
          {eintrag.standardMehrzahl}
          {!eintrag.istStandard && (
            <span className="objekte__eigen">
              {' '}
              – heißt hier {eintrag.mehrzahl}
            </span>
          )}
        </h3>

        {serverFehler !== undefined && (
          <div className="error-banner" role="alert">
            {serverFehler.message}
          </div>
        )}

        <div className="objekte__felder">
          <div className="field">
            <label htmlFor={`${id}-einzahl`}>Einzahl</label>
            <input
              id={`${id}-einzahl`}
              type="text"
              autoComplete="off"
              maxLength={BEZEICHNUNG_MAX}
              placeholder={standard.einzahl}
              value={einzahl}
              disabled={!darf}
              onChange={(event) => setEinzahl(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor={`${id}-mehrzahl`}>Mehrzahl</label>
            <input
              id={`${id}-mehrzahl`}
              type="text"
              autoComplete="off"
              maxLength={BEZEICHNUNG_MAX}
              placeholder={standard.mehrzahl}
              value={mehrzahl}
              disabled={!darf}
              onChange={(event) => setMehrzahl(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor={`${id}-genus`}>Geschlecht</label>
            <select
              id={`${id}-genus`}
              value={genus}
              disabled={!darf}
              aria-describedby={`${id}-vorschau`}
              onChange={(event) => setGenus(event.target.value as Genus)}
            >
              {(Object.keys(GENUS_TEXT) as Genus[]).map((g) => (
                <option key={g} value={g}>
                  {GENUS_TEXT[g]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <p id={`${id}-vorschau`} className="field__hint" aria-live="polite">
          {fehler === null
            ? `So erscheint es: „${form(vorschau, 'neu')}“, „${form(vorschau, 'ersten')} anlegen“, „${form(vorschau, 'keine')}“.`
            : fehler}
        </p>

        {darf && (
          <div className="row-actions">
            <button
              type="submit"
              className="button"
              disabled={!geaendert || fehler !== null || setzung.loading}
            >
              {setzung.loading ? 'Speichern…' : 'Speichern'}
            </button>
            {!eintrag.istStandard && (
              <button
                type="button"
                className="button button--ghost"
                disabled={zuruecksetzung.loading}
                onClick={aufStandard}
              >
                Auf „{standard.mehrzahl}“ zurücksetzen
              </button>
            )}
          </div>
        )}
      </form>
    </li>
  );
};

export const ObjektePage = () => {
  const rechte = usePermissions();
  const darf = rechte.can('workspace:fields');
  const toast = useToast();
  const abfrage = useQuery<Antwort>(OBJEKT_BEZEICHNUNGEN);
  const [fragen, setFragen] = useState(false);
  const [alleZurueck, alle] = useMutation<{
    setzeObjektBezeichnungZurueck: ObjektBezeichnung[];
  }>(SETZE_OBJEKT_BEZEICHNUNG_ZURUECK, {
    update: (cache, { data }) =>
      inDenCache(cache, data?.setzeObjektBezeichnungZurueck),
  });
  const liste = abfrage.data?.objektBezeichnungen;
  const eigene = (liste ?? []).filter((b) => !b.istStandard).length;

  const nachArt = new Map<ObjektArt, ObjektBezeichnung>(
    (liste ?? []).map((b) => [b.art, b]),
  );

  return (
    <>
      <ObjectHeader
        hilfe="objekte"
        kind="data"
        icon={IconData}
        label="Daten"
        title="Objekte umbenennen"
        note="Wie Firmen, Kontakte, Geschäfte, Aufgaben und Angebote in der Oberfläche heißen, etwa Patienten statt Kontakte. Angebote, Rechnungen und Mails an Kunden behalten die Fachbegriffe."
      />

      {abfrage.error !== undefined && (
        <div className="error-banner" role="alert">
          Die Bezeichnungen ließen sich nicht laden: {abfrage.error.message}
        </div>
      )}
      {alle.error !== undefined && (
        <div className="error-banner" role="alert">
          {alle.error.message}
        </div>
      )}

      <section className="card objekte" aria-labelledby="objekte-titel">
        <h2 id="objekte-titel">Bezeichnungen</h2>
        {!darf && !rechte.loading && (
          <p className="field__hint">
            Ändern darf, wer Felder und Objekte einrichtet. Sie sehen hier, wie
            die Objekte in diesem Bereich heißen.
          </p>
        )}
        {liste === undefined ? (
          abfrage.loading && (
            <p className="field__hint" role="status">
              Bezeichnungen werden geladen…
            </p>
          )
        ) : (
          <ul className="objekte__liste">
            {OBJEKT_ARTEN.map((art) => {
              const eintrag = nachArt.get(art);

              return eintrag === undefined ? null : (
                <Zeile
                  key={`${art}-${eintrag.einzahl}-${eintrag.mehrzahl}-${eintrag.genus}`}
                  eintrag={eintrag}
                  darf={darf}
                />
              );
            })}
          </ul>
        )}
        {darf && eigene > 0 && (
          <div className="row-actions">
            <button
              type="button"
              className="button button--ghost"
              disabled={alle.loading}
              onClick={() => setFragen(true)}
            >
              Alle auf Standard zurücksetzen
            </button>
          </div>
        )}
      </section>

      {fragen && (
        <ConfirmDialog
          title="Alle Bezeichnungen zurücksetzen?"
          consequence="Firmen, Kontakte, Geschäfte, Aufgaben und Angebote heißen danach für alle im Bereich wieder so wie im Programm. Ihre Daten bleiben unverändert."
          confirmLabel="Zurücksetzen"
          onCancel={() => setFragen(false)}
          onConfirm={() => {
            setFragen(false);
            void alleZurueck({ variables: { art: null } })
              .then(() => {
                toast.zeige({ text: 'Alle Bezeichnungen zurückgesetzt.' });
              })
              .catch(() => null);
          }}
        />
      )}
    </>
  );
};
