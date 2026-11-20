import { useMutation, useQuery } from '@apollo/client';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { AttachmentsSection } from '../components/AttachmentsSection';
import { Avatar } from '../components/Avatar';
import { Firmendaten } from '../components/Firmendaten';
import { BegleitbelegeKarte } from '../components/Begleitbelege';
import { CustomFieldsSection } from '../components/CustomFieldsSection';
import { ActivityRail } from '../components/ActivityRail';
import { Freigaben } from '../components/Freigaben';
import { AutomationKnoepfe } from '../components/AutomationKnoepfe';
import { KiVorschlagHinweis } from '../components/KiVorschlagHinweis';
import { FavoritStern } from '../components/Favoriten';
import { Highlights } from '../components/Highlights';
import {
  IconCompanies,
  IconContacts,
  IconDeals,
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
import { Muttergesellschaft } from '../components/Muttergesellschaft';
import { useFeldrechte } from '../lib/useFeldrechte';
import {
  COMPANY_DETAIL,
  CREATE_CONTACT,
  UPDATE_COMPANY,
  UPDATE_CONTACT,
  UPDATE_DEAL,
} from '../lib/queries';
import { type CompanyDetail, formatCurrency } from '../lib/types';
import { useStageBadge, useStageName } from '../lib/stages';
import { AkteFehlt } from '../components/AkteFehlt';
import { TableWrap } from '../components/TableWrap';
import {
  NeuesGeschaeft,
  VerknuepfenKnopf,
} from '../components/AkteVerknuepfen';
import { kontaktAusText } from '../components/BeteiligteSection';
import { kontaktTitel } from '../lib/auswahl';
import { usePermissions } from '../lib/usePermissions';
import { ortErgaenzen, type PlzOrt } from '../lib/plz';
import { usePlzOrte } from '../lib/usePlz';
import { useBezeichnung } from '../lib/useBezeichnung';

export const CompanyDetailPage = () => {
  const bez = useBezeichnung();
  const feldrechte = useFeldrechte();
  const rechte = usePermissions();
  const stageName = useStageName();
  const stageBadge = useStageBadge();
  const { id = '' } = useParams();
  const quoteFor = useQuoteFor();
  const { data, loading, error, refetch } = useQuery<{
    company: CompanyDetail;
  }>(COMPANY_DETAIL, { variables: { id } });
  const besuchtes = data?.company;
  useMerkeBesuch(
    besuchtes === undefined || besuchtes === null
      ? null
      : ((x) => ({ to: `/firmen/${x.id}`, title: x.name, art: bez('FIRMA') }))(
          besuchtes,
        ),
  );

  const [updateCompany, { error: updateError }] = useMutation(UPDATE_COMPANY);
  const [kontaktAendern] = useMutation(UPDATE_CONTACT);
  const [kontaktAnlegen] = useMutation(CREATE_CONTACT);
  const [geschaeftAendern] = useMutation(UPDATE_DEAL);
  const { can } = usePermissions();
  const plzOrte = usePlzOrte();
  const [ortVorschlaege, setOrtVorschlaege] = useState<PlzOrt[]>([]);

  if (loading) {
    return <div className="state">Wird geladen…</div>;
  }

  if (error !== undefined) {
    return (
      <AkteFehlt
        meldung={error.message}
        zurueck={{ to: '/firmen', label: 'Zu den Firmen' }}
        live={{ objekt: 'company', id }}
      />
    );
  }

  const company = data?.company;

  if (company === undefined) {
    return <div className="state">Firma nicht gefunden.</div>;
  }

  const saveField =
    (field: string, isNumeric = false) =>
    (raw: string) => {
      const trimmed = raw.trim();
      let value: string | number | null = trimmed === '' ? null : trimmed;

      if (isNumeric && trimmed !== '') {
        const parsed = Number.parseFloat(trimmed);

        if (!Number.isFinite(parsed)) {
          return;
        }

        value = parsed;
      }

      return updateCompany({
        variables: { input: { id: company.id, [field]: value } },
      });
    };

  const savePlz = async (raw: string) => {
    const ergebnis = await saveField('postalCode')(raw);
    const stadtFrei =
      (company.city ?? '').trim() === '' &&
      feldrechte.standard('company', 'city') === 'alle';

    if (!stadtFrei) {
      setOrtVorschlaege([]);

      return ergebnis;
    }

    const orte = await plzOrte(raw, company.country);
    const ergaenzung = ortErgaenzen({ ort: company.city }, orte);

    if (ergaenzung?.ort !== undefined) {
      setOrtVorschlaege([]);
      await saveField('city')(ergaenzung.ort);
    } else {
      setOrtVorschlaege(orte.length > 1 ? orte : []);
    }

    return ergebnis;
  };

  const saveCustomField = (key: string, value: string) =>
    updateCompany({
      variables: {
        input: {
          id: company.id,
          customFields: { [key]: value.trim() === '' ? null : value },
        },
      },
    });

  return (
    <>
      <Highlights
        live={{ objekt: 'company', id: company.id }}
        kind="company"
        icon={IconCompanies}
        label={bez('FIRMA')}
        title={company.name}
        blaettern={{ art: 'firma', id: company.id, basis: '/firmen' }}
        back={{ to: '/firmen', label: bez('FIRMA', 'mehrzahl') }}
        bild={<Avatar name={company.name} size="lg" bild={company.logo} />}
        fields={[
          { label: 'Branche', value: company.industry ?? '—' },
          {
            label: 'Anschrift',
            value:
              [
                company.street,
                [company.postalCode, company.city]
                  .filter((part) => part != null && part !== '')
                  .join(' '),
                company.country,
              ]
                .filter((part) => part != null && part !== '')
                .join(', ') || '—',
          },
          {
            label: 'Mitarbeiter',
            value: company.employeeCount ?? '—',
            numeric: true,
          },
          {
            label: 'Offene Geschäfte',
            value: company.deals.filter(
              (deal) => deal.stage !== 'WON' && deal.stage !== 'LOST',
            ).length,
            numeric: true,
          },
        ]}
        actions={
          <>
            <FavoritStern art="FIRMA" datensatzId={company.id} />
            <AutomationKnoepfe art="company" zielId={company.id} />
            <Zusammenfuehren
              art="FIRMA"
              name={company.name}
              domain={company.domain ?? ''}
              ausser={company.id}
            />
            <NeueMail
              ziel={{ companyId: company.id }}
              werte={{ firma: company.name }}
              vorschlaege={[
                ...company.contacts.map((contact) => contact.email ?? ''),
                company.email ?? '',
                company.invoiceEmail ?? '',
              ].filter((adresse) => adresse !== '')}
            />
            {can('company:write') && (
              <Firmendaten firma={company} onChanged={() => void refetch()} />
            )}
            <button
              type="button"
              className="button button--ghost"
              onClick={() => void quoteFor({ companyId: company.id })}
            >
              <IconQuotes />
              Angebot erstellen
            </button>
            {company.domain !== null && company.domain !== '' && (
              <a
                className="button button--ghost"
                href={`https://${company.domain}`}
                target="_blank"
                rel="noreferrer"
              >
                {company.domain}
              </a>
            )}
          </>
        }
      />

      {updateError !== undefined && (
        <div className="error-banner">{updateError.message}</div>
      )}

      <KiVorschlagHinweis art="company" id={company.id} />

      <div className="record-layout">
        <div className="record-layout__main">
          <div className="card detail-grid">
            <EditableField
              label="Name"
              value={company.name}
              onSave={saveField('name')}
            />
            <div className="detail-field">
              <label className="detail-field__label" htmlFor="verantwortlich">
                Verantwortlich
              </label>
              <div className="detail-field__value detail-field__value--static">
                <VerantwortlichAuswahl
                  id="verantwortlich"
                  owner={company.owner}
                  onSave={(ownerId) =>
                    void updateCompany({
                      variables: { input: { id: company.id, ownerId } },
                      update: (cache) => {
                        cache.evict({ fieldName: 'companies' });
                        cache.gc();
                      },
                    }).catch(() => null)
                  }
                />
              </div>
            </div>
            <EditableField
              label="Domain"
              value={company.domain}
              onSave={saveField('domain')}
            />
            <EditableField
              label="Weitere Domains"
              value={(company.zweitdomains ?? []).join(', ') || null}
              placeholder="—"
              onSave={(raw) =>
                updateCompany({
                  variables: {
                    input: {
                      id: company.id,
                      zweitdomains: raw
                        .split(/[\s,;]+/u)
                        .map((domain) => domain.trim())
                        .filter((domain) => domain !== ''),
                    },
                  },
                })
              }
            />
            <EditableField
              label="Website"
              value={company.website ?? null}
              aktion={<LinkOeffnen url={company.website} />}
              onSave={saveField('website')}
            />
            <EditableField
              label="LinkedIn"
              value={company.linkedin ?? null}
              aktion={<LinkOeffnen url={company.linkedin} />}
              onSave={saveField('linkedin')}
            />
            <EditableField
              label="Branche"
              value={company.industry}
              onSave={saveField('industry')}
            />
            <EditableField
              label="Mitarbeiter"
              value={company.employeeCount}
              type="number"
              onSave={saveField('employeeCount', true)}
            />
            {feldrechte.standard('company', 'annualRevenue') !==
              'verborgen' && (
              <EditableField
                label="Jahresumsatz"
                value={company.annualRevenue}
                type="number"
                format={(revenue) => formatCurrency(Number(revenue), 'EUR')}
                onSave={saveField('annualRevenue', true)}
                nurLesen={
                  feldrechte.standard('company', 'annualRevenue') === 'lesen'
                }
              />
            )}
            <EditableField
              label="Straße"
              value={company.street ?? null}
              onSave={saveField('street')}
            />
            <EditableField
              label="PLZ"
              value={company.postalCode ?? null}
              onSave={savePlz}
            />
            <EditableField
              label="Stadt"
              value={company.city}
              onSave={(raw) => {
                setOrtVorschlaege([]);

                return saveField('city')(raw);
              }}
            />
            {ortVorschlaege.length > 1 && (company.city ?? '') === '' && (
              <div className="detail-field">
                <div className="detail-field__label" id="ort-vorschlaege">
                  Orte zur PLZ
                </div>
                <div
                  className="ort-vorschlaege"
                  role="group"
                  aria-labelledby="ort-vorschlaege"
                >
                  {ortVorschlaege.map((eintrag) => (
                    <button
                      key={eintrag.ort}
                      type="button"
                      className="button button--ghost button--small"
                      onClick={() => {
                        setOrtVorschlaege([]);
                        void Promise.resolve(
                          saveField('city')(eintrag.ort),
                        ).catch(() => null);
                      }}
                    >
                      {eintrag.ort}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <EditableField
              label="Land"
              value={company.country}
              onSave={saveField('country')}
            />
            <EditableField
              label="Rechnungs-E-Mail"
              value={company.invoiceEmail ?? null}
              onSave={saveField('invoiceEmail')}
            />
            <EditableField
              label="Telefon"
              value={company.phone ?? null}
              aktion={
                company.phone != null && company.phone !== '' ? (
                  <a
                    className="button button--ghost button--small"
                    href={`tel:${company.phone}`}
                    aria-label={`${company.name} anrufen`}
                  >
                    Anrufen
                  </a>
                ) : undefined
              }
              onSave={saveField('phone')}
            />
            <EditableField
              label="E-Mail"
              value={company.email ?? null}
              type="email"
              onSave={saveField('email')}
            />
            <EditableField
              label="Vertreten durch"
              value={company.vertretung ?? null}
              onSave={saveField('vertretung')}
            />
            <EditableField
              label="Registergericht"
              value={company.registergericht ?? null}
              onSave={saveField('registergericht')}
            />
            <EditableField
              label="Registernummer"
              value={company.registernummer ?? null}
              onSave={saveField('registernummer')}
            />
            <EditableField
              label="USt-IdNr."
              value={company.ustIdNr ?? null}
              onSave={saveField('ustIdNr')}
            />
            <Muttergesellschaft
              firmaId={company.id}
              mutterId={company.parentCompanyId}
              mutter={company.parentCompany}
              toechter={company.tochterfirmen}
              nurLesen={!rechte.can('company:write')}
              onSave={(parentCompanyId) =>
                updateCompany({
                  variables: { input: { id: company.id, parentCompanyId } },
                }).then(() => refetch())
              }
            />
          </div>

          <CustomFieldsSection
            entity="COMPANY"
            datensatzId={company.id}
            values={company.customFields}
            onSave={saveCustomField}
          />

          <AttachmentsSection ziel={{ companyId: company.id }} />

          <Freigaben art="company" datensatzId={company.id} />

          <div className="related-grid">
            <RelatedList
              kind="deal"
              icon={IconDeals}
              title="Geschäfte"
              count={company.deals.length}
              empty="Keine Geschäfte mit dieser Firma."
              action={
                can('deal:write') ? (
                  <span className="related__knoepfe">
                    <VerknuepfenKnopf
                      text="Verknüpfen"
                      art="geschaeft"
                      ausser={company.deals.map((deal) => deal.id)}
                      onWaehlen={async (deal) => {
                        await geschaeftAendern({
                          variables: {
                            input: { id: deal.id, companyId: company.id },
                          },
                        });
                        await refetch();
                      }}
                    />
                    <NeuesGeschaeft vorbelegung={{ companyId: company.id }} />
                  </span>
                ) : undefined
              }
            >
              <TableWrap>
                <table>
                  <thead>
                    <tr>
                      <th>Bezeichnung</th>
                      <th className="numeric">Betrag</th>
                      <th>Phase</th>
                    </tr>
                  </thead>
                  <tbody>
                    {company.deals.map((deal) => (
                      <tr key={deal.id}>
                        <td>
                          <Link to={`/geschaefte/${deal.id}`}>{deal.name}</Link>
                        </td>
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            </RelatedList>

            <RelatedList
              kind="contact"
              icon={IconContacts}
              title="Kontakte"
              count={company.contacts.length}
              empty="Keine Kontakte bei dieser Firma."
              action={
                can('contact:write') ? (
                  <VerknuepfenKnopf
                    text="Kontakt hinzufügen"
                    art="kontakt"
                    ausser={company.contacts.map((kontakt) => kontakt.id)}
                    onWaehlen={async (kontakt) => {
                      await kontaktAendern({
                        variables: {
                          input: { id: kontakt.id, companyId: company.id },
                        },
                      });
                      await refetch();
                    }}
                    onNeu={async (text) => {
                      await kontaktAnlegen({
                        variables: {
                          input: {
                            ...kontaktAusText(text),
                            companyId: company.id,
                          },
                        },
                      });
                      await refetch();
                    }}
                  />
                ) : undefined
              }
            >
              <TableWrap>
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Position</th>
                      {can('contact:write') && (
                        <th>
                          <span className="visually-hidden">Aktionen</span>
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {company.contacts.map((contact) => (
                      <tr key={contact.id}>
                        <td>
                          <Link to={`/kontakte/${contact.id}`}>
                            {contact.firstName} {contact.lastName}
                          </Link>
                        </td>
                        <td>{contact.jobTitle ?? '—'}</td>
                        {can('contact:write') && (
                          <td className="numeric">
                            <button
                              type="button"
                              className="feed__link"
                              aria-label={`${kontaktTitel(contact)} von der Firma lösen`}
                              onClick={() =>
                                void kontaktAendern({
                                  variables: {
                                    input: { id: contact.id, companyId: null },
                                  },
                                }).then(() => refetch())
                              }
                            >
                              Lösen
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            </RelatedList>

            {company.tochterfirmen.length > 0 && (
              <RelatedList
                kind="company"
                icon={IconCompanies}
                title="Tochterfirmen"
                count={company.tochterfirmen.length}
                empty="Keine Tochterfirmen."
              >
                <ul className="related__list">
                  {company.tochterfirmen.map((tochter) => (
                    <li key={tochter.id}>
                      <Link to={`/firmen/${tochter.id}`}>{tochter.name}</Link>
                      {tochter.city !== null && (
                        <span className="field__hint"> · {tochter.city}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </RelatedList>
            )}

            <BegleitbelegeKarte filter={{ companyId: company.id }} />

            <MessageList
              ziel={{ kind: 'company', companyId: company.id }}
              werte={{ firma: company.name }}
            />
          </div>
        </div>

        <ActivityRail
          recordId={company.id}
          target={{ companyId: company.id }}
          appointments={company.appointments}
          tasks={company.tasks}
          notes={company.notes}
          onChanged={() => void refetch()}
          ausKontakten={{
            notes: company.kontaktNotizen,
            tasks: company.kontaktAufgaben,
            appointments: company.kontaktTermine,
            namen: Object.fromEntries(
              company.contacts.map((kontakt) => [
                kontakt.id,
                kontaktTitel(kontakt),
              ]),
            ),
          }}
        />
      </div>
    </>
  );
};
