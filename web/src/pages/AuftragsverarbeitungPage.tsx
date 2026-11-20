import { useQuery } from '@apollo/client';
import { Link } from 'react-router-dom';

import { DATA_PROCESSING_AGREEMENT } from '../lib/queries';
import { type DpaBlock, type DpaDocument, type DpaSection } from '../lib/types';
import { Wordmark } from '../components/Wordmark';
import { useSeitenkopf } from '../lib/seitenkopf';

const Block = ({ block }: { block: DpaBlock }) => {
  if (block.kind === 'list') {
    return (
      <ul className="legal-page__list">
        {(block.items ?? []).map((eintrag) => (
          <li key={eintrag}>{eintrag}</li>
        ))}
      </ul>
    );
  }

  if (block.kind === 'gap') {
    return (
      <p className="legal-page__gap">
        <strong>Noch auszufüllen</strong> (<code>{block.variable}</code>):{' '}
        {block.text}
      </p>
    );
  }

  return <p>{block.text}</p>;
};

const Abschnitt = ({ teil }: { teil: DpaSection }) => (
  <section>
    <h2>
      {teil.label} {teil.title}
    </h2>
    {teil.blocks.map((block, index) => (
      // eslint-disable-next-line react/no-array-index-key
      <Block key={index} block={block} />
    ))}
  </section>
);

export const AuftragsverarbeitungPage = () => {
  useSeitenkopf(
    'Auftragsverarbeitung',
    'Der Vertrag zur Auftragsverarbeitung nach Art. 28 DSGVO.',
  );

  const { data, loading } = useQuery<{
    dataProcessingAgreement: DpaDocument;
  }>(DATA_PROCESSING_AGREEMENT);

  const vertrag = data?.dataProcessingAgreement;

  if (loading || vertrag === undefined) {
    return (
      <div className="auth">
        <div className="auth__card legal-page">
          <div className="auth__title">Auftragsverarbeitung</div>
          <p className="auth__subtitle">Wird geladen…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth">
      <div className="auth__card legal-page">
        <div className="auth__brand">
          <Wordmark size={16} />
        </div>

        <div className="auth__title">{vertrag.title}</div>
        <p className="auth__subtitle">nach Art. 28 DSGVO</p>

        {!vertrag.reviewed && (
          <div className="legal-page__notice" role="note">
            <strong>Entwurf — noch nicht rechtlich geprüft.</strong> Die
            Beschreibung der Verarbeitung und der technischen Maßnahmen gibt den
            Stand der Software wieder und ist insoweit belastbar. Die Klauseln
            ersetzen keine anwaltliche Prüfung. In diesem Zustand nicht
            unterzeichnen; nach der Prüfung <code>LEGAL_DPA_REVIEWED=true</code>{' '}
            setzen.
          </div>
        )}

        <p>
          <a
            className="button button--primary"
            href="/legal/auftragsverarbeitung.pdf"
          >
            Als PDF zum Unterschreiben
          </a>
        </p>

        <p>
          Vertragspartner sind der Auftraggeber — das ist, wer Stegwerk nutzt —
          und{' '}
          {vertrag.processorName === null ? (
            <span className="legal-page__gap">
              der Betreiber dieser Installation, dessen Angaben noch fehlen
            </span>
          ) : (
            vertrag.processorName
          )}{' '}
          als Auftragnehmer.
        </p>

        {vertrag.sections.map((teil) => (
          <Abschnitt key={teil.label} teil={teil} />
        ))}

        <hr className="legal-page__rule" />

        {vertrag.annexes.map((teil) => (
          <Abschnitt key={teil.label} teil={teil} />
        ))}

        <p className="auth__switch">
          <Link to="/datenschutz">Datenschutz</Link> ·{' '}
          <Link to="/sicherheit">Sicherheit</Link> ·{' '}
          <Link to="/impressum">Impressum</Link> ·{' '}
          <Link to="/anmelden">Zurück zur Anmeldung</Link>
        </p>
      </div>
    </div>
  );
};
