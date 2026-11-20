import { useState } from 'react';
import { Link } from 'react-router-dom';

import {
  freieArten,
  loesbar,
  type MitAkten,
  verknuepfungen,
  type ZielArt,
  type ZielSpalte,
  ZIEL_SPALTEN,
} from '../lib/verknuepfungen';
import { DatensatzAuswahl } from './DatensatzAuswahl';
import { IconClose } from './Icons';

export const AktenVerknuepfungen = ({
  eintrag,
  hier = {},
  mindestensEine,
  onSetzen,
}: {
  eintrag: MitAkten;
  hier?: Partial<Record<ZielSpalte, string>>;
  mindestensEine: boolean;
  onSetzen: (spalte: ZielSpalte, id: string | null) => Promise<unknown>;
}) => {
  const [waehlen, setWaehlen] = useState<ZielArt | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const liste = verknuepfungen(eintrag, hier);
  const frei = freieArten(eintrag);
  const gewaehlt = ZIEL_SPALTEN.find((ziel) => ziel.art === waehlen);

  const loesen = (spalte: ZielSpalte) => {
    setFehler(null);
    void onSetzen(spalte, null).catch((problem: unknown) =>
      setFehler(
        problem instanceof Error
          ? problem.message
          : 'Die Verknüpfung ließ sich nicht lösen.',
      ),
    );
  };

  return (
    <div className="verknuepft">
      {liste.length > 0 && (
        <>
          <span className="verknuepft__titel">Auch bei</span>
          <ul className="verknuepft__liste" aria-label="Weitere Akten">
            {liste.map((eintragAkte) => {
              const art = ZIEL_SPALTEN.find(
                (ziel) => ziel.spalte === eintragAkte.spalte,
              )?.label;

              return (
                <li key={eintragAkte.spalte} className="verknuepft__chip">
                  <span className="verknuepft__art">{art}</span>
                  {eintragAkte.to === null ? (
                    <span
                      className="verknuepft__verborgen"
                      title="Diese Akte ist einer anderen Person zugeordnet; Ihre Rolle sieht sie nicht."
                    >
                      Nicht sichtbar
                    </span>
                  ) : (
                    <Link to={eintragAkte.to}>{eintragAkte.label}</Link>
                  )}
                  {loesbar(eintrag, eintragAkte, mindestensEine) && (
                    <button
                      type="button"
                      className="verknuepft__loesen"
                      aria-label={`Verknüpfung zu ${eintragAkte.label ?? art ?? ''} lösen`}
                      title="Verknüpfung lösen"
                      onClick={() => loesen(eintragAkte.spalte)}
                    >
                      <IconClose size={12} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {waehlen === null && frei.length > 0 && (
        <div
          className="verknuepft__neu"
          role="group"
          aria-label="Weitere Akte verknüpfen"
        >
          {frei.map((ziel) => (
            <button
              key={ziel.spalte}
              type="button"
              className="feed__link"
              onClick={() => {
                setFehler(null);
                setWaehlen(ziel.art);
              }}
            >
              + {ziel.label}
            </button>
          ))}
        </div>
      )}

      {waehlen !== null && gewaehlt !== undefined && (
        <DatensatzAuswahl
          art={waehlen}
          label={`${gewaehlt.label} verknüpfen`}
          onWaehlen={async (treffer) => {
            await onSetzen(gewaehlt.spalte, treffer.id);
            setWaehlen(null);
          }}
          onAbbrechen={() => setWaehlen(null)}
        />
      )}

      {fehler !== null && (
        <div className="error-banner" role="alert">
          {fehler}
        </div>
      )}
    </div>
  );
};
