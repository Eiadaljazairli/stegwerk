import { type DocumentNode, useQuery } from '@apollo/client';
import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { datumBeimAblegen, kalenderZeitraum } from '../lib/kalenderZiehen';
import { usePermissions } from '../lib/usePermissions';
import {
  aenderungBeimAblegen,
  type BoardFeld,
  wertDesFelds,
} from '../lib/recordBoard';
import { type DatumFeld } from './Darstellung';
import { RecordBoard } from './RecordBoard';
import { RecordKalender, useKalenderMonat } from './RecordKalender';
import { LoadingAnnouncement } from './Skeleton';

export const KARTEN_GRENZE = 200;

type Seite<T> = { items: T[]; totalCount: number } | undefined;

type Gemeinsam<T extends { id: string }, D> = {
  kennung: string;
  query: DocumentNode;
  variablen: Record<string, unknown>;
  seite: (daten: D) => Seite<T>;
  titel: (karte: T) => string;
  link: (karte: T) => string;
  inhalt?: (karte: T) => ReactNode;
  speichern: (karte: T, aenderung: Record<string, unknown>) => Promise<unknown>;
  darfAendern: boolean;
  mehrzahl: string;
  skip?: boolean;
};

export const ListenBoard = <T extends { id: string }, D>({
  feld,
  sonderweg,
  ...p
}: Gemeinsam<T, D> & {
  feld: BoardFeld;
  sonderweg?: (karte: T, wert: string | null) => Promise<unknown>;
}) => {
  const { data, loading, error } = useQuery<D>(p.query, {
    variables: {
      ...p.variablen,
      gruppierung: null,
      gruppe: null,
      zeitraum: null,
      limit: KARTEN_GRENZE,
      offset: 0,
    },
    skip: p.skip,
  });
  const seite = data === undefined ? undefined : p.seite(data);

  if (error !== undefined) {
    return <div className="error-banner">{error.message}</div>;
  }

  if (loading && seite === undefined) {
    return <LoadingAnnouncement />;
  }

  const karten = seite?.items ?? [];

  return (
    <RecordBoard<T>
      kennung={p.kennung}
      feld={feld}
      karten={karten}
      id={(karte) => karte.id}
      titel={p.titel}
      link={p.link}
      wert={(karte) => wertDesFelds(karte, feld.key)}
      inhalt={p.inhalt}
      darfVerschieben={p.darfAendern}
      verschieben={(karte, wert) => {
        if (sonderweg !== undefined) {
          return sonderweg(karte, wert);
        }

        const aenderung = aenderungBeimAblegen(feld.key, wert);

        return aenderung === null
          ? Promise.reject(
              new Error(`„${feld.label}“ lässt sich so nicht setzen.`),
            )
          : p.speichern(karte, aenderung);
      }}
      weitere={Math.max(0, (seite?.totalCount ?? 0) - karten.length)}
      mehrzahl={p.mehrzahl}
    />
  );
};

export const ListenKalender = <T extends { id: string }, D>({
  feld,
  kartenKlasse,
  ...p
}: Gemeinsam<T, D> & {
  feld: DatumFeld;
  kartenKlasse?: (karte: T) => string | undefined;
}) => {
  const [monat, setMonat] = useKalenderMonat();
  const zeitraum = kalenderZeitraum(monat);
  const { data, loading, error } = useQuery<D>(p.query, {
    variables: {
      ...p.variablen,
      gruppierung: null,
      gruppe: null,
      zeitraum: { feld: feld.key, ...zeitraum },
      limit: KARTEN_GRENZE,
      offset: 0,
    },
    skip: p.skip,
  });
  const seite = data === undefined ? undefined : p.seite(data);
  const karten = seite?.items ?? [];

  return (
    <>
      {error !== undefined && (
        <div className="error-banner">{error.message}</div>
      )}
      <RecordKalender<T>
        kennung={p.kennung}
        monat={monat}
        setMonat={setMonat}
        feldLabel={feld.label}
        karten={karten}
        id={(karte) => karte.id}
        titel={p.titel}
        link={p.link}
        datum={(karte) => wertDesFelds(karte, feld.key)}
        inhalt={p.inhalt}
        kartenKlasse={kartenKlasse}
        darfVerschieben={p.darfAendern}
        verschieben={(karte, tag) => {
          const aenderung = datumBeimAblegen(feld.key, tag);

          return aenderung === null
            ? Promise.reject(
                new Error(`„${feld.label}“ lässt sich nicht verschieben.`),
              )
            : p.speichern(karte, aenderung);
        }}
        laedt={loading}
        weitere={Math.max(0, (seite?.totalCount ?? 0) - karten.length)}
        mehrzahl={p.mehrzahl}
      />
    </>
  );
};

export const OhneFeld = ({ art }: { art: 'board' | 'kalender' }) => {
  const darfFelder = usePermissions().can('workspace:fields');

  return (
    <div className="notice">
      {art === 'board'
        ? 'Für ein Board braucht diese Liste ein Auswahlfeld, das Ihre Rolle sehen darf.'
        : 'Für einen Kalender braucht diese Liste ein Datumsfeld, das Ihre Rolle sehen darf.'}{' '}
      {darfFelder && (
        <Link to="/felder">
          {art === 'board'
            ? 'Auswahlfeld unter „Eigene Felder“ anlegen'
            : 'Datumsfeld unter „Eigene Felder“ anlegen'}
        </Link>
      )}
    </div>
  );
};
