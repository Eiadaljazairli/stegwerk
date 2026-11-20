import { useMutation, useQuery } from '@apollo/client';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { OAUTH_ANBIETER, OAUTH_STARTEN } from '../lib/queries';

const NAME: Record<string, string> = {
  google: 'Google',
  microsoft: 'Microsoft',
};

export const anbieterName = (anbieter: string | null | undefined): string =>
  anbieter == null ? '' : (NAME[anbieter] ?? anbieter);

export const OAuthKnoepfe = ({
  zweck,
  text = 'verbinden',
  postfachArt,
}: {
  zweck: 'postfach' | 'kalender';
  text?: string;
  postfachArt?: 'weiteres' | 'gemeinsam';
}) => {
  const { data } = useQuery<{ oauthAnbieter: string[] }>(OAUTH_ANBIETER);
  const [starten, { loading }] = useMutation<{ oauthStarten: string }>(
    OAUTH_STARTEN,
  );
  const [fehler, setFehler] = useState<string | null>(null);
  const anbieter = data?.oauthAnbieter ?? [];

  if (anbieter.length === 0) {
    return null;
  }

  return (
    <div className="oauth-knoepfe">
      {anbieter.map((name) => (
        <button
          key={name}
          type="button"
          className="button button--ghost"
          disabled={loading}
          onClick={() => {
            setFehler(null);
            void starten({
              variables: {
                anbieter: name,
                zweck,
                ...(postfachArt === undefined ? {} : { postfachArt }),
              },
            })
              .then((antwort) => {
                const ziel = antwort.data?.oauthStarten;

                if (ziel !== undefined) {
                  window.location.assign(ziel);
                }
              })
              .catch((problem: unknown) =>
                setFehler(
                  problem instanceof Error ? problem.message : 'Fehler.',
                ),
              );
          }}
        >
          Mit {anbieterName(name)} {text}
        </button>
      ))}
      {fehler !== null && <div className="error-banner">{fehler}</div>}
    </div>
  );
};

export const useOAuthAngeboten = (): boolean => {
  const { data } = useQuery<{ oauthAnbieter: string[] }>(OAUTH_ANBIETER);

  return (data?.oauthAnbieter ?? []).length > 0;
};

export const useOAuthRueckmeldung = (): {
  ok: boolean;
  text: string;
} | null => {
  const { search, pathname } = useLocation();
  const navigate = useNavigate();
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  useEffect(() => {
    const parameter = new URLSearchParams(search);
    const stand = parameter.get('oauth');

    if (stand === null) {
      return;
    }

    setMeldung(
      stand === 'ok'
        ? { ok: true, text: 'Verbunden.' }
        : {
            ok: false,
            text: parameter.get('grund') ?? 'Das Verbinden ist fehlgeschlagen.',
          },
    );
    parameter.delete('oauth');
    parameter.delete('grund');

    const rest = parameter.toString();

    void navigate(`${pathname}${rest === '' ? '' : `?${rest}`}`, {
      replace: true,
    });
  }, [search, pathname, navigate]);

  return meldung;
};
