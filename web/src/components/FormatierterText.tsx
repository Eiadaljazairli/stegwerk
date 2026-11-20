import { Fragment, type ReactNode } from 'react';

import { type Block, type Stueck, zerlege } from '../lib/formatierter-text';

const Stuecke = ({ stuecke }: { stuecke: Stueck[] }): ReactNode =>
  stuecke.map((stueck, index) => {
    switch (stueck.art) {
      case 'text':
        return <Fragment key={index}>{stueck.text}</Fragment>;
      case 'umbruch':
        return <br key={index} />;
      case 'fett':
        return (
          <strong key={index}>
            <Stuecke stuecke={stueck.kinder} />
          </strong>
        );
      case 'kursiv':
        return (
          <em key={index}>
            <Stuecke stuecke={stueck.kinder} />
          </em>
        );
      case 'erwaehnung':
        return (
          <span key={index} className="erwaehnung" data-nutzer={stueck.id}>
            @{stueck.name}
          </span>
        );
      case 'link': {
        const aussen = /^https?:/iu.test(stueck.ziel);

        return (
          <a
            key={index}
            href={stueck.ziel}
            {...(aussen
              ? { target: '_blank', rel: 'noopener noreferrer nofollow' }
              : {})}
          >
            <Stuecke stuecke={stueck.kinder} />
          </a>
        );
      }
    }
  });

const Ueberschrift = ({
  stufe,
  children,
}: {
  stufe: 1 | 2 | 3;
  children: ReactNode;
}) =>
  stufe === 1 ? (
    <h3 className="ftext__h">{children}</h3>
  ) : stufe === 2 ? (
    <h4 className="ftext__h">{children}</h4>
  ) : (
    <h5 className="ftext__h">{children}</h5>
  );

const BlockAnzeige = ({
  block,
  onHaken,
}: {
  block: Block;
  onHaken?: (nummer: number) => void;
}) => {
  switch (block.art) {
    case 'absatz':
      return (
        <p>
          <Stuecke stuecke={block.inhalt} />
        </p>
      );
    case 'ueberschrift':
      return (
        <Ueberschrift stufe={block.stufe}>
          <Stuecke stuecke={block.inhalt} />
        </Ueberschrift>
      );
    case 'liste': {
      const punkte = block.punkte.map((punkt, index) => (
        <li key={index}>
          <Stuecke stuecke={punkt} />
        </li>
      ));

      return block.geordnet ? <ol>{punkte}</ol> : <ul>{punkte}</ul>;
    }
    case 'checkliste':
      return (
        <ul className="ftext__checkliste">
          {block.punkte.map((punkt) => (
            <li
              key={punkt.nummer}
              className={punkt.erledigt ? 'is-erledigt' : undefined}
            >
              <label>
                <input
                  type="checkbox"
                  checked={punkt.erledigt}
                  disabled={onHaken === undefined}
                  onChange={() => onHaken?.(punkt.nummer)}
                />{' '}
                <span>
                  <Stuecke stuecke={punkt.inhalt} />
                </span>
              </label>
            </li>
          ))}
        </ul>
      );
  }
};

export const FormatierterText = ({
  text,
  className,
  onHaken,
}: {
  text: string;
  className?: string;
  onHaken?: (nummer: number) => void;
}) => (
  <div className={className === undefined ? 'ftext' : `ftext ${className}`}>
    {zerlege(text).map((block, index) => (
      <BlockAnzeige key={index} block={block} onHaken={onHaken} />
    ))}
  </div>
);
