import {
  gql,
  useApolloClient,
  useLazyQuery,
  useMutation,
  useQuery,
} from '@apollo/client';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { useToast } from './Toast';

export type Dublette = { id: string; name: string; detail: string | null };

const FIRMEN_DUBLETTEN = gql`
  query MoeglicheFirmenDubletten($name: String!, $domain: String, $ausser: ID) {
    moeglicheFirmenDubletten(name: $name, domain: $domain, ausser: $ausser) {
      id
      name
      detail
    }
  }
`;

const KONTAKT_DUBLETTEN = gql`
  query MoeglicheKontaktDubletten(
    $vorname: String!
    $nachname: String!
    $email: String
    $ausser: ID
  ) {
    moeglicheKontaktDubletten(
      vorname: $vorname
      nachname: $nachname
      email: $email
      ausser: $ausser
    ) {
      id
      name
      detail
    }
  }
`;

type Eingabe =
  | { art: 'FIRMA'; name: string; domain?: string; ausser?: string }
  | {
      art: 'KONTAKT';
      vorname: string;
      nachname: string;
      email?: string;
      ausser?: string;
    };

const pfad = (art: Eingabe['art'], id: string) =>
  art === 'FIRMA' ? `/firmen/${id}` : `/kontakte/${id}`;

const useDubletten = (eingabe: Eingabe): Dublette[] => {
  const [firmen, { data: f }] = useLazyQuery<{
    moeglicheFirmenDubletten: Dublette[];
  }>(FIRMEN_DUBLETTEN, { fetchPolicy: 'network-only' });
  const [kontakte, { data: k }] = useLazyQuery<{
    moeglicheKontaktDubletten: Dublette[];
  }>(KONTAKT_DUBLETTEN, { fetchPolicy: 'network-only' });
  const schluessel = JSON.stringify(eingabe);
  const [leer, setLeer] = useState(true);

  useEffect(() => {
    const e = JSON.parse(schluessel) as Eingabe;
    const genug =
      e.art === 'FIRMA'
        ? e.name.trim().length >= 3 || (e.domain ?? '').trim().length >= 4
        : (e.email ?? '').includes('@') ||
          (e.vorname.trim() !== '' && e.nachname.trim() !== '');

    setLeer(!genug);

    if (!genug) {
      return undefined;
    }

    const uhr = window.setTimeout(() => {
      if (e.art === 'FIRMA') {
        void firmen({
          variables: {
            name: e.name,
            domain: e.domain || null,
            ausser: e.ausser ?? null,
          },
        });
      } else {
        void kontakte({
          variables: {
            vorname: e.vorname,
            nachname: e.nachname,
            email: e.email || null,
            ausser: e.ausser ?? null,
          },
        });
      }
    }, 400);

    return () => window.clearTimeout(uhr);
  }, [schluessel, firmen, kontakte]);

  if (leer) {
    return [];
  }

  return eingabe.art === 'FIRMA'
    ? (f?.moeglicheFirmenDubletten ?? [])
    : (k?.moeglicheKontaktDubletten ?? []);
};

export const DublettenHinweis = (props: Eingabe) => {
  const treffer = useDubletten(props);

  if (treffer.length === 0) {
    return null;
  }

  return (
    <div className="dubletten-hinweis" role="status">
      <strong>Gibt es vielleicht schon:</strong>
      <ul>
        {treffer.map((d) => (
          <li key={d.id}>
            <Link to={pfad(props.art, d.id)}>{d.name}</Link>
            {d.detail !== null && (
              <span className="field__hint"> · {d.detail}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

export const MAX_ZUSAMMENFUEHREN = 9;

type Ergebnis = {
  felder: { feld: string; vonId: string }[];
  eigeneFelder: number;
  umgehaengt: { was: string; anzahl: number }[];
};

const ERGEBNIS = `
  felder { feld vonId }
  eigeneFelder
  umgehaengt { was anzahl }
`;

const VORSCHAU = gql`
  query ZusammenfuehrenVorschau(
    $art: DublettenArt!
    $behaltenId: ID!
    $wegIds: [ID!]!
  ) {
    zusammenfuehrenVorschau(
      art: $art
      behaltenId: $behaltenId
      wegIds: $wegIds
    ) { ${ERGEBNIS} }
  }
`;

const MEHRERE = gql`
  mutation ZusammenfuehrenMehrere(
    $art: DublettenArt!
    $behaltenId: ID!
    $wegIds: [ID!]!
  ) {
    zusammenfuehrenMehrere(
      art: $art
      behaltenId: $behaltenId
      wegIds: $wegIds
    ) { ${ERGEBNIS} }
  }
`;

const EINZAHL: Record<string, string> = {
  Kontakte: 'Kontakt',
  Geschäfte: 'Geschäft',
  Aufgaben: 'Aufgabe',
  Notizen: 'Notiz',
  Termine: 'Termin',
  'Teilnahmen an Terminen': 'Teilnahme an einem Termin',
  Dateien: 'Datei',
  Angebote: 'Angebot',
  Rechnungen: 'Rechnung',
  Mails: 'Mail',
  Favoriten: 'Favorit',
  Ansichten: 'Ansicht',
  'Serienmail-Empfänge': 'Serienmail-Empfang',
};

const FELD: Record<string, string> = {
  domain: 'Domain',
  zweitdomains: 'Weitere Domains',
  website: 'Website',
  linkedin: 'LinkedIn',
  industry: 'Branche',
  employeeCount: 'Mitarbeiter',
  annualRevenue: 'Jahresumsatz',
  street: 'Straße',
  postalCode: 'PLZ',
  city: 'Stadt',
  country: 'Land',
  invoiceEmail: 'Rechnungs-E-Mail',
  vertretung: 'Vertreten durch',
  registergericht: 'Registergericht',
  registernummer: 'Registernummer',
  ustIdNr: 'USt-IdNr.',
  ownerId: 'Verantwortlich',
  email: 'E-Mail',
  phone: 'Telefon',
  jobTitle: 'Position',
  companyId: 'Firma',
};

const ZusammenfuehrenDialog = ({
  art,
  kandidaten,
  fest,
  onClose,
  onFertig,
}: {
  art: Eingabe['art'];
  kandidaten: Dublette[];
  fest?: Dublette;
  onClose: () => void;
  onFertig: () => void;
}) => {
  const client = useApolloClient();
  const { zeige } = useToast();
  const [behaltenId, setBehaltenId] = useState<string>(
    fest?.id ?? kandidaten[0]?.id ?? '',
  );
  const [hinein, setHinein] = useState<Set<string>>(
    new Set(fest === undefined ? [] : kandidaten.map((k) => k.id)),
  );
  const wegIds =
    fest === undefined
      ? kandidaten.map((k) => k.id).filter((id) => id !== behaltenId)
      : kandidaten.map((k) => k.id).filter((id) => hinein.has(id));
  const zuViele = wegIds.length + 1 > MAX_ZUSAMMENFUEHREN;
  const vorschau = useQuery<{ zusammenfuehrenVorschau: Ergebnis }>(VORSCHAU, {
    variables: { art, behaltenId, wegIds },
    skip: behaltenId === '' || wegIds.length === 0 || zuViele,
    fetchPolicy: 'network-only',
  });
  const [fuehren, { loading }] = useMutation(MEHRERE);
  const alle = fest === undefined ? kandidaten : [fest, ...kandidaten];
  const name = (id: string) => alle.find((k) => k.id === id)?.name ?? '—';
  const ergebnis = vorschau.data?.zusammenfuehrenVorschau;

  return (
    <ZusammenDialog onClose={onClose}>
      <div className="dialog__title" id="zusammen-titel">
        Zusammenführen
      </div>
      <p className="field__hint">
        {fest === undefined
          ? 'Wählen Sie, welcher Datensatz bleibt. Seine Angaben gelten; leere Felder füllen die anderen in der gezeigten Reihenfolge.'
          : `„${fest.name}“ bleibt. Seine Angaben gelten; leere Felder füllen die gewählten in der gezeigten Reihenfolge.`}{' '}
        Alles, was an den anderen hängt, kommt zum behaltenen; die anderen
        landen im Papierkorb.
      </p>

      {kandidaten.length === 0 ? (
        <p>Keine wahrscheinlichen Dubletten gefunden.</p>
      ) : (
        <fieldset className="zusammen-liste">
          <legend className="visually-hidden">
            {fest === undefined ? 'Welcher bleibt?' : 'Welche kommen hinein?'}
          </legend>
          {kandidaten.map((d) => (
            <label key={d.id}>
              {fest === undefined ? (
                <input
                  type="radio"
                  name="zusammen-behalten"
                  checked={behaltenId === d.id}
                  onChange={() => setBehaltenId(d.id)}
                />
              ) : (
                <input
                  type="checkbox"
                  checked={hinein.has(d.id)}
                  onChange={(event) => {
                    const neu = new Set(hinein);

                    if (event.target.checked) {
                      neu.add(d.id);
                    } else {
                      neu.delete(d.id);
                    }

                    setHinein(neu);
                  }}
                />
              )}{' '}
              {d.name}
              {d.detail !== null && (
                <span className="field__hint"> · {d.detail}</span>
              )}
              {fest === undefined && behaltenId === d.id && (
                <span className="zusammen-liste__bleibt">bleibt</span>
              )}
            </label>
          ))}
        </fieldset>
      )}

      {zuViele && (
        <p className="error-banner" role="alert">
          Höchstens {MAX_ZUSAMMENFUEHREN} Datensätze auf einmal.
        </p>
      )}

      {vorschau.error !== undefined && (
        <p className="error-banner" role="alert">
          {vorschau.error.message}
        </p>
      )}

      {ergebnis !== undefined && wegIds.length > 0 && (
        <div className="zusammen-vorschau" aria-live="polite">
          <strong>Danach</strong>
          <ul>
            {ergebnis.felder.map((f) => (
              <li key={f.feld}>
                {FELD[f.feld] ?? f.feld} aus „{name(f.vonId)}“
              </li>
            ))}
            {ergebnis.eigeneFelder > 0 && (
              <li>
                {ergebnis.eigeneFelder}{' '}
                {ergebnis.eigeneFelder === 1
                  ? 'eigenes Feld ergänzt'
                  : 'eigene Felder ergänzt'}
              </li>
            )}
            {ergebnis.umgehaengt.map((u) => (
              <li key={u.was}>
                {u.anzahl} {u.anzahl === 1 ? (EINZAHL[u.was] ?? u.was) : u.was}{' '}
                umgehängt
              </li>
            ))}
            {ergebnis.felder.length === 0 &&
              ergebnis.eigeneFelder === 0 &&
              ergebnis.umgehaengt.length === 0 && (
                <li>Nichts zu ergänzen oder umzuhängen.</li>
              )}
            <li>
              {wegIds.length}{' '}
              {wegIds.length === 1 ? 'Datensatz kommt' : 'Datensätze kommen'} in
              den Papierkorb
            </li>
          </ul>
        </div>
      )}

      <div className="dialog__actions">
        <button
          type="button"
          className="button button--ghost"
          onClick={onClose}
        >
          Abbrechen
        </button>
        <button
          type="button"
          className="button"
          disabled={
            wegIds.length === 0 ||
            zuViele ||
            loading ||
            ergebnis === undefined ||
            vorschau.loading
          }
          onClick={() => {
            void fuehren({ variables: { art, behaltenId, wegIds } })
              .then(async () => {
                await client.refetchQueries({ include: 'active' });
                zeige({
                  text: `${wegIds.length + 1} Datensätze sind jetzt „${name(behaltenId)}“.`,
                });
                onFertig();
              })
              .catch((fehler: Error) => zeige({ text: fehler.message }));
          }}
        >
          Zusammenführen
        </button>
      </div>
    </ZusammenDialog>
  );
};

export const Zusammenfuehren = (
  props: Eingabe & { ausser: string; name: string },
) => {
  const [offen, setOffen] = useState(false);
  const treffer = useDubletten(props);

  if (treffer.length === 0 && !offen) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        className="button button--ghost"
        onClick={() => setOffen(true)}
      >
        Dubletten ({treffer.length})
      </button>

      {offen && (
        <ZusammenfuehrenDialog
          art={props.art}
          kandidaten={treffer}
          fest={{ id: props.ausser, name: props.name, detail: null }}
          onClose={() => setOffen(false)}
          onFertig={() => setOffen(false)}
        />
      )}
    </>
  );
};

export const ZusammenfuehrenAuswahl = ({
  art,
  zeilen,
  onFertig,
}: {
  art: Eingabe['art'];
  zeilen: Dublette[];
  onFertig: () => void;
}) => {
  const [offen, setOffen] = useState(false);

  if (zeilen.length < 2) {
    return null;
  }

  const zuViele = zeilen.length > MAX_ZUSAMMENFUEHREN;

  return (
    <>
      <button
        type="button"
        className="button button--ghost"
        disabled={zuViele}
        title={
          zuViele
            ? `Höchstens ${MAX_ZUSAMMENFUEHREN} auf einmal zusammenführen`
            : undefined
        }
        onClick={() => setOffen(true)}
      >
        Zusammenführen
      </button>
      {offen && (
        <ZusammenfuehrenDialog
          art={art}
          kandidaten={zeilen}
          onClose={() => setOffen(false)}
          onFertig={() => {
            setOffen(false);
            onFertig();
          }}
        />
      )}
    </>
  );
};

const ZusammenDialog = ({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) => {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;

    if (dialog !== null && !dialog.open) {
      dialog.showModal();
    }
  }, []);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="zusammen-titel"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) {
          onClose();
        }
      }}
    >
      <div className="dialog__body">{children}</div>
    </dialog>
  );
};
