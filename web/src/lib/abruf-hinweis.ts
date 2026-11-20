export type AbrufHinweis = {
  art: 'postfach' | 'kalender';
  text: string;
  meldung: string;
  link: string;
  linkText: string;
};

type Postfach = {
  active: boolean;
  username: string;
  lastError: string | null;
  fehlerZeigen?: boolean;
  fehlerArt?: string | null;
};

type Kalender = {
  benutzer: string;
  kalenderName: string | null;
  letzterFehler: string | null;
  fehlerZeigen?: boolean;
  fehlerArt?: string | null;
};

const zeigen = (
  fehler: string | null,
  fehlerZeigen: boolean | undefined,
): fehler is string =>
  fehler !== null && fehler !== '' && fehlerZeigen !== false;

export const abrufHinweise = (
  postfach: Postfach | null,
  kalender: Kalender | null,
  pfad: string,
): AbrufHinweis[] => {
  const hinweise: AbrufHinweis[] = [];

  if (
    postfach !== null &&
    postfach.active &&
    zeigen(postfach.lastError, postfach.fehlerZeigen) &&
    !pfad.startsWith('/postfach')
  ) {
    hinweise.push({
      art: 'postfach',
      text:
        postfach.fehlerArt === 'voruebergehend'
          ? `Ihr Postfach ${postfach.username} ist seit einer Weile nicht erreichbar: ${postfach.lastError} Stegwerk versucht es weiter.`
          : `Ihr Postfach ${postfach.username} wird nicht mehr abgerufen: ${postfach.lastError}`,
      meldung: postfach.lastError,
      link: '/postfach',
      linkText:
        postfach.fehlerArt === 'voruebergehend'
          ? 'Zum Postfach'
          : 'Postfach neu verbinden',
    });
  }

  if (
    kalender !== null &&
    zeigen(kalender.letzterFehler, kalender.fehlerZeigen) &&
    !pfad.startsWith('/kalender')
  ) {
    const name = kalender.kalenderName ?? kalender.benutzer;

    hinweise.push({
      art: 'kalender',
      text:
        kalender.fehlerArt === 'voruebergehend'
          ? `Ihr Kalender ${name} ist seit einer Weile nicht erreichbar: ${kalender.letzterFehler} Stegwerk versucht es weiter.`
          : `Ihr Kalender ${name} wird nicht mehr abgeglichen: ${kalender.letzterFehler}`,
      meldung: kalender.letzterFehler,
      link: '/kalender',
      linkText: 'Zum Kalender',
    });
  }

  return hinweise;
};
