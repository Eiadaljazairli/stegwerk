import { useMutation, useQuery } from '@apollo/client';
import { Link, useParams } from 'react-router-dom';

import { verknuepft } from '../components/NichtSichtbar';
import { AbmeldeHinweis } from '../components/AbmeldeHinweis';
import { AttachmentsSection } from '../components/AttachmentsSection';
import { CustomFieldsSection } from '../components/CustomFieldsSection';
import { ActivityRail } from '../components/ActivityRail';
import { Freigaben } from '../components/Freigaben';
import { AutomationKnoepfe } from '../components/AutomationKnoepfe';
import { KiVorschlagHinweis } from '../components/KiVorschlagHinweis';
import { FavoritStern } from '../components/Favoriten';
import { Highlights } from '../components/Highlights';
import {
  IconContacts,
  IconDeals,
  IconPhone,
  IconQuotes,
} from '../components/Icons';
import { MessageList } from '../components/MessageList';
import { NeueMail } from '../components/NeueMail';
import { RelatedList } from '../components/RelatedList';
import { Zusammenfuehren } from '../components/Dubletten';
import { useMerkeBesuch } from '../lib/zuletzt';
import { useQuoteFor } from '../lib/useQuoteFor';
import { VerantwortlichAuswahl } from '../components/Verantwortlich';
import { EditableField } from '../components/EditableField';
import { LinkOeffnen } from '../components/LinkOeffnen';
import { Kontaktwege } from '../components/Kontaktwege';
import { formatTelefon, telLink } from '../lib/telefon';
import { useFeldrechte } from '../lib/useFeldrechte';
import {
  CONTACT_DETAIL,
  CREATE_COMPANY,
  DEAL_KONTAKT_HINZUFUEGEN,
  UPDATE_CONTACT,
} from '../lib/queries';
import { type ContactDetail, formatCurrency, formatDate } from '../lib/types';
import { useStageBadge, useStageName } from '../lib/stages';
import { AkteFehlt } from '../components/AkteFehlt';
import {
  NeuesGeschaeft,
  VerknuepfenKnopf,
} from '../components/AkteVerknuepfen';
import { VerknuepfungFeld } from '../components/VerknuepfungFeld';
import { usePermissions } from '../lib/usePermissions';
import { TableWrap } from '../components/TableWrap';
import { useBezeichnung } from '../lib/useBezeichnung';

export const ContactDetailPage = () => {
  const bez = useBezeichnung();
  const feldrechte = useFeldrechte();
  const stageName = useStageName();
  const stageBadge = useStageBadge();
  const { id = '' } = useParams();
  const quoteFor = useQuoteFor();
  const { data, loading, error, refetch } = useQuery<{
    contact: ContactDetail;
  }>(CONTACT_DETAIL, { variables: { id } });
  const besuchtes = data?.contact;
  useMerkeBesuch(
    besuchtes === undefined || besuchtes === null
      ? null
      : ((x) => ({
          to: `/kontakte/${x.id}`,
          title: `${x.firstName} ${x.lastName}`,
          art: bez('KONTAKT'),
        }))(besuchtes),
  );

  const [updateContact, { error: updateError }] = useMutation(UPDATE_CONTACT);
  const [firmaAnlegen] = useMutation<{ createCompany: { id: string } }>(
    CREATE_COMPANY,
  );
  const [beteiligen] = useMutation(DEAL_KONTAKT_HINZUFUEGEN);
  const { can } = usePermissions();

  if (loading) {
    return <div className="state">Wird geladen…</div>;
  }

  if (error !== undefined) {
    return (
      <AkteFehlt
        meldung={error.message}
        zurueck={{ to: '/kontakte', label: 'Zu den Kontakten' }}
        live={{ objekt: 'contact', id }}
      />
    );
  }

  const contact = data?.contact;

  if (contact === undefined) {
    return <div className="state">Kontakt nicht gefunden.</div>;
  }

  const saveField = (field: string) => (raw: string) => {
    const trimmed = raw.trim();

    return updateContact({
      variables: {
        input: { id: contact.id, [field]: trimmed === '' ? null : trimmed },
      },
    });
  };

  const saveCustomField = (key: string, value: string) =>
    updateContact({
      variables: {
        input: {
          id: contact.id,
          customFields: { [key]: value.trim() === '' ? null : value },
        },
      },
    });

  const zurFirma = async (companyId: string | null) => {
    await updateContact({
      variables: { input: { id: contact.id, companyId } },
    });
    await refetch();
  };

  const rolleAm = (deal: { id: string; primaryContactId: string | null }) =>
    deal.primaryContactId === contact.id
      ? 'Hauptkontakt'
      : (contact.beteiligungen.find((zeile) => zeile.dealId === deal.id)
          ?.rolle ?? 'Beteiligt');

  return (
    <>
      <Highlights
        live={{ objekt: 'contact', id: contact.id }}
        kind="contact"
        icon={IconContacts}
        label={bez('KONTAKT')}
        title={`${contact.firstName} ${contact.lastName}`}
        blaettern={{ art: 'kontakt', id: contact.id, basis: '/kontakte' }}
        back={{ to: '/kontakte', label: bez('KONTAKT', 'mehrzahl') }}
        fields={[
          { label: 'Position', value: contact.jobTitle ?? '—' },
          {
            label: 'Firma',
            value: verknuepft(
              contact.companyId,
              contact.company,
              'Firma',
              () =>
                contact.company === null ? null : (
                  <Link to={`/firmen/${contact.company.id}`}>
                    {contact.company.name}
                  </Link>
                ),
            ),
          },
          ...(feldrechte.standard('contact', 'email') === 'verborgen'
            ? []
            : [{ label: 'E-Mail', value: contact.email ?? '—' }]),
          ...(feldrechte.standard('contact', 'phone') === 'verborgen'
            ? []
            : [{ label: 'Telefon', value: formatTelefon(contact.phone) }]),
        ]}
        actions={
          <>
            <FavoritStern art="KONTAKT" datensatzId={contact.id} />
            <AutomationKnoepfe art="contact" zielId={contact.id} />
            <Zusammenfuehren
              art="KONTAKT"
              name={`${contact.firstName} ${contact.lastName}`.trim()}
              vorname={contact.firstName}
              nachname={contact.lastName}
              email={contact.email ?? ''}
              ausser={contact.id}
            />
            {contact.email !== null && contact.email !== '' && (
              <NeueMail
                ziel={{ contactId: contact.id }}
                an={[contact.email]}
                werte={{
                  vorname: contact.firstName,
                  nachname: contact.lastName,
                  firma: contact.company?.name ?? null,
                }}
              />
            )}
            {contact.phone !== null && contact.phone !== '' && (
              <a className="button button--ghost" href={telLink(contact.phone)}>
                <IconPhone />
                Anrufen
              </a>
            )}
            {contact.company !== null && (
              <button
                type="button"
                className="button button--ghost"
                onClick={() =>
                  void quoteFor({
                    companyId: contact.company?.id,
                    contactId: contact.id,
                  })
                }
              >
                <IconQuotes />
                Angebot erstellen
              </button>
            )}
          </>
        }
      />

      {updateError !== undefined && (
        <div className="error-banner">{updateError.message}</div>
      )}

      {contact.unzustellbarSeit != null && (
        <div className="banner banner--warning" role="status">
          Post an {contact.email} kam am{' '}
          {new Date(contact.unzustellbarSeit).toLocaleDateString('de-DE')} als
          unzustellbar zurück
          {contact.unzustellbarGrund != null &&
            ` (${contact.unzustellbarGrund})`}
          . Prüfen Sie die Adresse.
        </div>
      )}

      <KiVorschlagHinweis art="contact" id={contact.id} />

      <div className="record-layout">
        <div className="record-layout__main">
          <div className="card detail-grid">
            <EditableField
              label="Vorname"
              value={contact.firstName}
              onSave={saveField('firstName')}
            />
            <div className="detail-field">
              <label className="detail-field__label" htmlFor="verantwortlich">
                Verantwortlich
              </label>
              <div className="detail-field__value detail-field__value--static">
                <VerantwortlichAuswahl
                  id="verantwortlich"
                  owner={contact.owner}
                  onSave={(ownerId) =>
                    void updateContact({
                      variables: { input: { id: contact.id, ownerId } },
                      update: (cache) => {
                        cache.evict({ fieldName: 'contacts' });
                        cache.gc();
                      },
                    }).catch(() => null)
                  }
                />
              </div>
            </div>
            <EditableField
              label="Nachname"
              value={contact.lastName}
              onSave={saveField('lastName')}
            />
            {feldrechte.standard('contact', 'email') !== 'verborgen' && (
              <EditableField
                label="E-Mail"
                value={contact.email}
                type="email"
                onSave={saveField('email')}
                nurLesen={feldrechte.standard('contact', 'email') === 'lesen'}
              />
            )}
            {feldrechte.standard('contact', 'phone') !== 'verborgen' && (
              <EditableField
                label="Telefon"
                value={contact.phone}
                format={(nummer) => formatTelefon(String(nummer))}
                onSave={saveField('phone')}
                nurLesen={feldrechte.standard('contact', 'phone') === 'lesen'}
              />
            )}
            <EditableField
              label="Position"
              value={contact.jobTitle}
              onSave={saveField('jobTitle')}
            />
            <EditableField
              label="LinkedIn"
              value={contact.linkedin ?? null}
              placeholder="—"
              aktion={<LinkOeffnen url={contact.linkedin} />}
              onSave={saveField('linkedin')}
            />
            <VerknuepfungFeld
              label={bez('FIRMA')}
              art="firma"
              belegt={contact.companyId != null}
              darfAendern={can('contact:write')}
              anzeige={verknuepft(
                contact.companyId,
                contact.company,
                'Firma',
                () =>
                  contact.company === null ? null : (
                    <Link to={`/firmen/${contact.company.id}`}>
                      {contact.company.name}
                    </Link>
                  ),
                <span className="detail-field__empty">—</span>,
              )}
              onWaehlen={(firma) => zurFirma(firma.id)}
              onNeu={async (name) => {
                const { data: neu } = await firmaAnlegen({
                  variables: { input: { name } },
                });

                if (neu != null) {
                  await zurFirma(neu.createCompany.id);
                }
              }}
              onEntfernen={() => zurFirma(null)}
            />
            {feldrechte.standard('contact', 'street') !== 'verborgen' &&
              (
                [
                  ['street', 'Straße'],
                  ['postalCode', 'PLZ'],
                  ['city', 'Stadt'],
                  ['country', 'Land'],
                ] as const
              ).map(([feld, label]) => (
                <EditableField
                  key={feld}
                  label={label}
                  value={contact[feld] ?? null}
                  onSave={saveField(feld)}
                  nurLesen={
                    feldrechte.standard('contact', 'street') === 'lesen'
                  }
                />
              ))}
          </div>

          <AbmeldeHinweis email={contact.email} />
          {(contact.verteiler ?? []).length > 0 && (
            <p className="field__hint verteiler-akte">
              In Verteilern:{' '}
              {(contact.verteiler ?? []).map((verteiler, index) => (
                <span key={verteiler.id}>
                  {index > 0 && ', '}
                  <Link to={`/verteiler/${verteiler.id}`}>
                    {verteiler.name}
                  </Link>
                </span>
              ))}
            </p>
          )}
          <Kontaktwege
            haupt={{ email: contact.email, phone: contact.phone }}
            weitereEmails={contact.weitereEmails}
            weitereTelefone={contact.weitereTelefone}
            rechtEmail={feldrechte.standard('contact', 'email')}
            rechtTelefon={feldrechte.standard('contact', 'phone')}
            onSave={(felder) =>
              updateContact({
                variables: { input: { id: contact.id, ...felder } },
              })
            }
          />

          <CustomFieldsSection
            entity="CONTACT"
            datensatzId={contact.id}
            values={contact.customFields}
            onSave={saveCustomField}
          />

          <AttachmentsSection ziel={{ contactId: contact.id }} />
          <Freigaben art="contact" datensatzId={contact.id} />
          <RelatedList
            kind="deal"
            icon={IconDeals}
            title="Geschäfte"
            count={contact.deals.length}
            empty="Keine Geschäfte mit diesem Kontakt."
            action={
              can('deal:write') ? (
                <span className="related__knoepfe">
                  <VerknuepfenKnopf
                    text="Beteiligen"
                    art="geschaeft"
                    ausser={contact.deals.map((deal) => deal.id)}
                    onWaehlen={async (deal) => {
                      await beteiligen({
                        variables: { dealId: deal.id, contactId: contact.id },
                      });
                      await refetch();
                    }}
                  />
                  <NeuesGeschaeft
                    vorbelegung={{
                      companyId: contact.companyId,
                      primaryContactId: contact.id,
                    }}
                  />
                </span>
              ) : undefined
            }
          >
            <TableWrap>
              <table>
                <thead>
                  <tr>
                    <th>Bezeichnung</th>
                    <th>Rolle</th>
                    <th className="numeric">Betrag</th>
                    <th>Phase</th>
                    <th>Abschluss</th>
                  </tr>
                </thead>
                <tbody>
                  {contact.deals.map((deal) => (
                    <tr key={deal.id}>
                      <td>
                        <Link to={`/geschaefte/${deal.id}`}>{deal.name}</Link>
                      </td>
                      <td>{rolleAm(deal)}</td>
                      <td className="numeric">
                        {formatCurrency(deal.amount, deal.currency)}
                      </td>
                      <td>
                        <span
                          className={stageBadge(deal.stage, deal.pipelineId)}
                        >
                          {stageName(deal.stage, deal.pipelineId)}
                        </span>
                      </td>
                      <td>{formatDate(deal.closeDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </RelatedList>
          <MessageList
            ziel={{ kind: 'contact', contactId: contact.id }}
            werte={{
              vorname: contact.firstName,
              nachname: contact.lastName,
              firma: contact.company?.name ?? null,
            }}
          />
        </div>

        <ActivityRail
          recordId={contact.id}
          target={{ contactId: contact.id }}
          notizVorschlaege={
            contact.company == null
              ? []
              : [
                  {
                    spalte: 'companyId',
                    id: contact.company.id,
                    label: contact.company.name,
                  },
                ]
          }
          appointments={contact.appointments}
          tasks={contact.tasks}
          notes={contact.notes}
          onChanged={() => void refetch()}
        />
      </div>
    </>
  );
};
