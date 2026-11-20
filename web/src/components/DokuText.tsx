import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import {
  type DokuBlock,
  type DokuStueck,
  zerlegeDoku,
} from '../lib/doku-markdown';
import { dokuLinkZiel } from '../lib/entwickler';

const Stuecke = ({ stuecke }: { stuecke: DokuStueck[] }): ReactNode =>
  stuecke.map((stueck, nummer) => {
    switch (stueck.art) {
      case 'text':
        return stueck.text;
      case 'code':
        return <code key={nummer}>{stueck.text}</code>;
      case 'fett':
        return (
          <strong key={nummer}>
            <Stuecke stuecke={stueck.kinder} />
          </strong>
        );
      case 'kursiv':
        return (
          <em key={nummer}>
            <Stuecke stuecke={stueck.kinder} />
          </em>
        );
      case 'link': {
        const ziel = dokuLinkZiel(stueck.ziel);
        const kinder = <Stuecke stuecke={stueck.kinder} />;

        if (ziel === null) {
          return <span key={nummer}>{kinder}</span>;
        }

        if (ziel.startsWith('/')) {
          return (
            <Link key={nummer} to={ziel}>
              {kinder}
            </Link>
          );
        }

        return (
          <a
            key={nummer}
            href={ziel}
            {...(ziel.startsWith('#')
              ? {}
              : { rel: 'noopener noreferrer', target: '_blank' })}
          >
            {kinder}
          </a>
        );
      }
    }
  });

const Block = ({ block }: { block: DokuBlock }) => {
  switch (block.art) {
    case 'ueberschrift': {
      const inhalt = <Stuecke stuecke={block.inhalt} />;

      return block.stufe <= 2 ? (
        <h2 id={block.id}>{inhalt}</h2>
      ) : block.stufe === 3 ? (
        <h3 id={block.id}>{inhalt}</h3>
      ) : (
        <h4 id={block.id}>{inhalt}</h4>
      );
    }
    case 'absatz':
      return (
        <p>
          <Stuecke stuecke={block.inhalt} />
        </p>
      );
    case 'liste': {
      const punkte = block.punkte.map((punkt, nummer) => (
        <li key={nummer}>
          <Stuecke stuecke={punkt} />
        </li>
      ));

      return block.geordnet ? (
        <ol className="legal-page__list">{punkte}</ol>
      ) : (
        <ul className="legal-page__list">{punkte}</ul>
      );
    }
    case 'code':
      return (
        <pre
          className="doku__code"
          tabIndex={0}
          aria-label={
            block.sprache === '' ? 'Beispiel' : `Beispiel (${block.sprache})`
          }
        >
          <code>{block.text}</code>
        </pre>
      );
    case 'tabelle':
      return (
        <div
          className="doku__tabelle"
          tabIndex={0}
          role="region"
          aria-label="Tabelle"
        >
          <table>
            <thead>
              <tr>
                {block.kopf.map((zelle, nummer) => (
                  <th key={nummer} scope="col">
                    <Stuecke stuecke={zelle} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.zeilen.map((zeile, reihe) => (
                <tr key={reihe}>
                  {zeile.map((zelle, nummer) => (
                    <td key={nummer}>
                      <Stuecke stuecke={zelle} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
};

export const DokuText = ({ quelle }: { quelle: string }) => {
  const bloecke = zerlegeDoku(quelle);
  const ohneTitel =
    bloecke[0]?.art === 'ueberschrift' && bloecke[0].stufe === 1
      ? bloecke.slice(1)
      : bloecke;

  return (
    <div className="doku">
      {ohneTitel.map((block, nummer) => (
        <Block key={nummer} block={block} />
      ))}
    </div>
  );
};
