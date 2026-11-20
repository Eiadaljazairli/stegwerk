import { useMutation, useQuery } from '@apollo/client';
import { useEffect, useRef, useState } from 'react';

import { useAuth } from '../lib/auth';
import { uploadAttachment } from '../lib/download';
import {
  fuelleVorlage,
  type Platzhalter,
  signaturBlock,
  vorlageEinsetzen,
} from '../lib/mail-vorlage';
import {
  ATTACHMENTS,
  MAIL_TEMPLATES,
  POSTFAECHER,
  PROFIL,
  SEND_MAIL,
  UNZUSTELLBARE_ADRESSEN,
} from '../lib/queries';
import {
  absenderEingabe,
  absenderOptionen,
  vorgabeAbsender,
} from '../lib/postfaecher';
import { type Attachment, type Mailbox } from '../lib/types';
import { type AttachmentZiel, lesbareGroesse } from './AttachmentsSection';
import { type MailTemplate } from './MailTemplatesSection';
import { AbhilfeLink } from './AbhilfeLink';
import { KiEntwurfKnopf } from './KiEntwurfKnopf';
import { bezugAusZiel, entwurfEinsetzen, ohneSignatur } from '../lib/ki';

export const MAX_ANHANG_GESAMT = 18 * 1024 * 1024;

const liste = (roh: string): string[] =>
  roh
    .split(/[,;]/u)
    .map((eintrag) => eintrag.trim())
    .filter((eintrag) => eintrag !== '');

export const MailFormular = ({
  kennung,
  ziel,
  werte,
  vorgabeAn,
  vorgabeBetreff = '',
  antwortAuf,
  listeId,
  vorgewaehlt = [],
  postfachId,
  gesendet,
  abbrechen,
}: {
  kennung: string;
  ziel?: AttachmentZiel;
  werte: Platzhalter;
  vorgabeAn: string;
  vorgabeBetreff?: string;
  antwortAuf?: string;
  listeId?: string;
  vorgewaehlt?: string[];
  postfachId?: string;
  gesendet: () => Promise<unknown> | void;
  abbrechen?: () => void;
}): JSX.Element => {
  const { session } = useAuth();
  const feld = useRef<HTMLInputElement>(null);
  const { data: vorlagenDaten } = useQuery<{ mailTemplates: MailTemplate[] }>(
    MAIL_TEMPLATES,
  );
  const { data: dateienDaten, refetch: dateienNeu } = useQuery<{
    attachments: Attachment[];
  }>(ATTACHMENTS, { variables: ziel, skip: ziel === undefined });
  const vorlagen = vorlagenDaten?.mailTemplates ?? [];
  const dateien = dateienDaten?.attachments ?? [];

  const [an, setAn] = useState(vorgabeAn);
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [kopienOffen, setKopienOffen] = useState(false);
  const [betreff, setBetreff] = useState(vorgabeBetreff);
  const [rumpf, setRumpf] = useState('');
  const { data: profilDaten } = useQuery<{
    me: { mailSignatur: string | null };
  }>(PROFIL);
  const signatur = profilDaten?.me.mailSignatur ?? null;
  const signaturText = signaturBlock(signatur);
  const signaturGesetzt = useRef(false);

  useEffect(() => {
    if (signaturGesetzt.current || profilDaten === undefined) {
      return;
    }

    signaturGesetzt.current = true;

    if (signaturText !== '') {
      setRumpf((jetzt) => (jetzt === '' ? signaturText : jetzt));
    }
  }, [profilDaten, signaturText]);
  const [gewaehlt, setGewaehlt] = useState<string[]>(vorgewaehlt);
  const [laedtHoch, setLaedtHoch] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const [senden, { loading }] = useMutation(SEND_MAIL);

  const { data: postfachDaten } = useQuery<{ postfaecher: Mailbox[] }>(
    POSTFAECHER,
  );
  const optionen = absenderOptionen(
    postfachDaten?.postfaecher ?? [],
    session?.user.id ?? null,
  );
  const [absenderWahl, setAbsender] = useState<string | null>(null);
  const absender = absenderWahl ?? vorgabeAbsender(optionen, postfachId);

  const empfaenger = [...liste(an), ...liste(cc), ...liste(bcc)];
  const { data: rueckDaten } = useQuery<{ unzustellbareAdressen: string[] }>(
    UNZUSTELLBARE_ADRESSEN,
    {
      variables: { adressen: empfaenger },
      skip: empfaenger.length === 0,
      errorPolicy: 'ignore',
    },
  );
  const unzustellbar =
    empfaenger.length === 0 ? [] : (rueckDaten?.unzustellbareAdressen ?? []);

  const gesamt = dateien
    .filter((datei) => gewaehlt.includes(datei.id))
    .reduce((summe, datei) => summe + datei.sizeBytes, 0);
  const zuGross = gesamt > MAX_ANHANG_GESAMT;

  const umschalten = (id: string): void => {
    setGewaehlt(
      gewaehlt.includes(id)
        ? gewaehlt.filter((eintrag) => eintrag !== id)
        : [...gewaehlt, id],
    );
  };

  const hochladen = async (auswahl: FileList | null): Promise<void> => {
    if (auswahl === null || auswahl.length === 0 || ziel === undefined) {
      return;
    }

    setFehler(null);
    setLaedtHoch(true);

    try {
      const neu: string[] = [];

      for (const datei of Array.from(auswahl)) {
        neu.push((await uploadAttachment(ziel, datei)).id);
      }

      await dateienNeu();
      setGewaehlt((vorher) => [...vorher, ...neu]);
    } catch (problem) {
      setFehler(
        problem instanceof Error ? problem.message : 'Unbekannter Fehler.',
      );
    } finally {
      setLaedtHoch(false);

      if (feld.current !== null) {
        feld.current.value = '';
      }
    }
  };

  const abschicken = async (): Promise<void> => {
    setFehler(null);

    try {
      await senden({
        variables: {
          input: {
            to: liste(an),
            cc: liste(cc),
            bcc: liste(bcc),
            subject: betreff,
            body: rumpf,
            attachmentIds: gewaehlt,
            ...(absenderEingabe(optionen, absender) ?? {}),
            ...(antwortAuf === undefined ? {} : { inReplyToId: antwortAuf }),
          },
        },
      });

      setRumpf(signaturText);
      setGewaehlt([]);
      await gesendet();
    } catch (problem) {
      setFehler(
        problem instanceof Error ? problem.message : 'Senden fehlgeschlagen.',
      );
    }
  };

  return (
    <div className="mail-formular">
      {fehler !== null && (
        <div className="error-banner" role="alert">
          {fehler}
          <AbhilfeLink meldung={fehler} />
        </div>
      )}

      {unzustellbar.length > 0 && (
        <div className="banner banner--warning" role="status">
          Zuletzt kam Post an {unzustellbar.join(', ')} als unzustellbar zurück.
          Prüfen Sie die Adresse, bevor Sie senden.
        </div>
      )}

      {optionen.length > 1 && (
        <div className="field">
          <label htmlFor={`von-${kennung}`}>Von</label>
          <select
            id={`von-${kennung}`}
            value={absender}
            onChange={(event) => setAbsender(event.target.value)}
          >
            {optionen.map((option) => (
              <option key={option.wert} value={option.wert}>
                {option.text}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="field">
        <div className="mail-formular__an">
          <label htmlFor={`an-${kennung}`}>An</label>
          {!kopienOffen && (
            <button
              type="button"
              className="button button--quiet"
              onClick={() => {
                setKopienOffen(true);
              }}
            >
              Cc/Bcc
            </button>
          )}
        </div>
        <input
          id={`an-${kennung}`}
          list={listeId}
          value={an}
          onChange={(ereignis) => {
            setAn(ereignis.target.value);
          }}
        />
      </div>

      {kopienOffen && (
        <div className="field-row">
          <div className="field">
            <label htmlFor={`cc-${kennung}`}>Cc</label>
            <input
              id={`cc-${kennung}`}
              list={listeId}
              value={cc}
              onChange={(ereignis) => {
                setCc(ereignis.target.value);
              }}
            />
          </div>
          <div className="field">
            <label htmlFor={`bcc-${kennung}`}>Bcc</label>
            <input
              id={`bcc-${kennung}`}
              list={listeId}
              value={bcc}
              onChange={(ereignis) => {
                setBcc(ereignis.target.value);
              }}
            />
          </div>
        </div>
      )}

      <div className="field">
        <label htmlFor={`betreff-${kennung}`}>Betreff</label>
        <input
          id={`betreff-${kennung}`}
          value={betreff}
          onChange={(ereignis) => {
            setBetreff(ereignis.target.value);
          }}
        />
      </div>

      {vorlagen.length > 0 && (
        <div className="field">
          <label htmlFor={`vorlage-${kennung}`}>Vorlage</label>
          <select
            id={`vorlage-${kennung}`}
            value=""
            onChange={(ereignis) => {
              const vorlage = vorlagen.find(
                (eintrag) => eintrag.id === ereignis.target.value,
              );

              if (vorlage === undefined) {
                return;
              }

              const alle = {
                ...werte,
                mein_vorname: session?.user.firstName ?? null,
                mein_name:
                  session === null
                    ? null
                    : `${session.user.firstName} ${session.user.lastName}`,
              };
              const text = fuelleVorlage(vorlage.body, alle);

              setRumpf(vorlageEinsetzen(rumpf, text, signaturText));

              if (betreff.trim() === '' && vorlage.subject !== null) {
                setBetreff(fuelleVorlage(vorlage.subject, alle));
              }
            }}
          >
            <option value="">Vorlage einfügen…</option>
            {vorlagen.map((vorlage) => (
              <option key={vorlage.id} value={vorlage.id}>
                {vorlage.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="field">
        <div className="mail-formular__an">
          <label htmlFor={`text-${kennung}`}>Nachricht</label>
          <KiEntwurfKnopf
            art="mail"
            titel="Nachricht"
            bezug={bezugAusZiel(ziel ?? {})}
            bisher={ohneSignatur(rumpf, signaturText)}
            betreff={betreff}
            empfaenger={an}
            onUebernehmen={(text) => {
              setRumpf(entwurfEinsetzen(rumpf, text, signaturText));
            }}
          />
        </div>
        <textarea
          id={`text-${kennung}`}
          rows={6}
          value={rumpf}
          onChange={(ereignis) => {
            setRumpf(ereignis.target.value);
          }}
        />
      </div>

      {ziel !== undefined && (
        <fieldset className="mail-formular__anhaenge">
          <legend>Anhänge</legend>

          {dateien.length === 0 ? (
            <p className="field__hint">
              An dieser Akte hängen noch keine Dateien.
            </p>
          ) : (
            <ul>
              {dateien.map((datei) => (
                <li key={datei.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={gewaehlt.includes(datei.id)}
                      onChange={() => {
                        umschalten(datei.id);
                      }}
                    />
                    <span>{datei.name}</span>
                    <span className="mail-formular__groesse">
                      {lesbareGroesse(datei.sizeBytes)}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}

          <div className="mail-formular__fuss">
            <button
              type="button"
              className="button button--quiet"
              disabled={laedtHoch}
              onClick={() => feld.current?.click()}
            >
              {laedtHoch ? 'Wird hochgeladen…' : 'Datei hochladen'}
            </button>
            {gewaehlt.length > 0 && (
              <span
                className={
                  zuGross
                    ? 'mail-formular__summe mail-formular__summe--zu-gross'
                    : 'mail-formular__summe'
                }
              >
                {lesbareGroesse(gesamt)} von {lesbareGroesse(MAX_ANHANG_GESAMT)}
              </span>
            )}
          </div>
          <input
            ref={feld}
            type="file"
            multiple
            hidden
            onChange={(ereignis) => void hochladen(ereignis.target.files)}
          />
        </fieldset>
      )}

      <div className="mail-formular__aktionen">
        {abbrechen !== undefined && (
          <button
            type="button"
            className="button button--ghost"
            onClick={abbrechen}
          >
            Abbrechen
          </button>
        )}
        <button
          type="button"
          className="button button--primary"
          disabled={
            loading ||
            laedtHoch ||
            zuGross ||
            rumpf.trim() === '' ||
            rumpf === signaturText ||
            an.trim() === ''
          }
          onClick={() => void abschicken()}
        >
          {loading ? 'Wird gesendet…' : 'Senden'}
        </button>
      </div>
    </div>
  );
};
