import { useMutation, useQuery } from '@apollo/client';
import { useState } from 'react';

import { merkeWahl } from '../lib/angemeldetBleiben';
import { NACHWEIS_KOPF } from '../lib/arbeitsnachweis';
import {
  ANMELDE_ANBIETER,
  ANMELDUNG_STARTEN,
  REGISTRIERUNG_STARTEN,
} from '../lib/queries';
import { sichtbareAnbieter, type SsoAnbieter, ssoName } from '../lib/sso';

const GoogleZeichen = () => (
  <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
    <path
      fill="#EA4335"
      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
    />
    <path
      fill="#4285F4"
      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
    />
    <path
      fill="#FBBC05"
      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
    />
    <path
      fill="#34A853"
      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
    />
  </svg>
);

const MicrosoftZeichen = () => (
  <svg viewBox="0 0 21 21" width="18" height="18" aria-hidden="true">
    <rect x="1" y="1" width="9" height="9" fill="#F25022" />
    <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
    <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
    <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
  </svg>
);

export const SsoZeichen = ({ anbieter }: { anbieter: string }) =>
  anbieter === 'microsoft' ? <MicrosoftZeichen /> : <GoogleZeichen />;

export const SsoKnoepfe = ({
  zweck,
  arbeitsbereich = '',
  nachweis,
  beiFehlendemBereich,
  angemeldetBleiben,
}: {
  zweck: 'anmelden' | 'registrieren';
  angemeldetBleiben?: boolean;
  arbeitsbereich?: string;
  nachweis?: () => Promise<string>;
  beiFehlendemBereich?: () => void;
}) => {
  const { data } = useQuery<{ anmeldeAnbieter: string[] }>(ANMELDE_ANBIETER);
  const [anmelden] = useMutation<{ anmeldungStarten: string }>(
    ANMELDUNG_STARTEN,
  );
  const [registrieren] = useMutation<{ registrierungStarten: string }>(
    REGISTRIERUNG_STARTEN,
  );
  const [laeuft, setLaeuft] = useState<SsoAnbieter | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const anbieter = sichtbareAnbieter(data?.anmeldeAnbieter);

  if (anbieter.length === 0) {
    return null;
  }

  const los = async (welcher: SsoAnbieter) => {
    setFehler(null);

    if (zweck === 'registrieren' && arbeitsbereich.trim() === '') {
      setFehler(
        'Geben Sie zuerst den Namen Ihres Arbeitsbereichs an, dann geht es weiter.',
      );
      beiFehlendemBereich?.();

      return;
    }

    setLaeuft(welcher);

    try {
      let url: string | undefined;

      if (zweck === 'anmelden') {
        const antwort = await anmelden({
          variables: { anbieter: welcher, angemeldetBleiben },
        });

        url = antwort.data?.anmeldungStarten;
      } else {
        const kopf = nachweis === undefined ? null : await nachweis();
        const antwort = await registrieren({
          variables: {
            anbieter: welcher,
            arbeitsbereich: arbeitsbereich.trim(),
          },
          context:
            kopf === null ? undefined : { headers: { [NACHWEIS_KOPF]: kopf } },
        });

        url = antwort.data?.registrierungStarten;
      }

      if (url !== undefined) {
        if (angemeldetBleiben !== undefined) {
          merkeWahl(angemeldetBleiben);
        }

        window.location.assign(url);

        return;
      }
    } catch (problem) {
      setFehler(
        problem instanceof Error
          ? problem.message
          : 'Die Anmeldung ließ sich nicht beginnen.',
      );
    }

    setLaeuft(null);
  };

  const verb = zweck === 'anmelden' ? 'anmelden' : 'registrieren';

  return (
    <div className="sso-knoepfe">
      {fehler !== null && (
        <div className="error-banner" role="alert">
          {fehler}
        </div>
      )}
      {anbieter.map((welcher) => (
        <button
          key={welcher}
          type="button"
          className="button button--ghost sso-knoepfe__knopf"
          disabled={laeuft !== null}
          aria-busy={laeuft === welcher}
          onClick={() => void los(welcher)}
        >
          <SsoZeichen anbieter={welcher} />
          {laeuft === welcher
            ? `Weiter zu ${ssoName(welcher)} …`
            : `Mit ${ssoName(welcher)} ${verb}`}
        </button>
      ))}
      <div className="sso-knoepfe__trenner" role="separator">
        <span>oder mit E-Mail und Passwort</span>
      </div>
    </div>
  );
};
