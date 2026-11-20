import { WorkspaceName } from '../components/WorkspaceName';
import { useMutation, useQuery } from '@apollo/client';
import { useState } from 'react';

import { ApiKeysSection } from '../components/ApiKeysSection';
import { WebhooksSection } from '../components/WebhooksSection';
import {
  CreateButton,
  CreatePanel,
  useCreate,
} from '../components/CreatePanel';
import { IconTeam } from '../components/Icons';
import { ObjectHeader } from '../components/ObjectHeader';
import { ReminderSettings } from '../components/ReminderSettings';
import { TwoFactorSection } from '../components/TwoFactorSection';
import {
  EmailAendernSection,
  KontoLoeschenSection,
  AnmeldemethodenSection,
  KontoSection,
  EinladungsDomainsSection,
  LeerlaufSection,
  ZweiFaktorPflichtSection,
} from '../components/KontoSection';
import { SitzungenSection } from '../components/SitzungenSection';
import { SicherheitSection } from '../components/SicherheitSection';
import { RolesSection } from '../components/RolesSection';
import { AvvSection } from '../components/AvvSection';
import { EinstiegSection } from '../components/EinstiegSection';
import { EinladungsVorschlaege } from '../components/EinladungsVorschlaege';
import { usePermissions } from '../lib/usePermissions';
import { useAuth } from '../lib/auth';
import { useToast } from '../components/Toast';
import {
  ASSIGN_ROLE,
  INVITE_MEMBER,
  REMOVE_MEMBER,
  REVOKE_INVITATION,
  ROLES,
  WORKSPACE_MEMBERS,
  ZWEI_FAKTOR_ZURUECKSETZEN,
} from '../lib/queries';
import {
  type Invitation,
  MEMBERSHIP_ROLE_LABELS,
  type Membership,
  type MembershipRole,
  type Role,
} from '../lib/types';
import { TableWrap } from '../components/TableWrap';
import { Anker } from '../components/Anker';
import { AbhilfeLink } from '../components/AbhilfeLink';
import { Dialogfenster } from '../components/Dialogfenster';

const formatDate = (isoDate: string): string =>
  new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' }).format(
    new Date(isoDate),
  );

export const TeamPage = () => {
  const { session } = useAuth();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<MembershipRole>('MEMBER');
  const create = useCreate();
  const { data: roleData } = useQuery<{ roles: Role[] }>(ROLES);
  const permissions = usePermissions();
  const mayManageMembers = permissions.can('workspace:members');
  const [assignRole, { error: assignError }] = useMutation(ASSIGN_ROLE, {
    refetchQueries: [WORKSPACE_MEMBERS, ROLES],
  });
  const [invite, setInvite] = useState<{
    url: string;
    delivered: boolean;
  } | null>(null);
  const [reassignedNotice, setReassignedNotice] = useState<number | null>(null);

  const { data, loading, error } = useQuery<{
    workspaceMembers: Membership[];
    pendingInvitations: Invitation[];
  }>(WORKSPACE_MEMBERS);

  const refetchQueries = [WORKSPACE_MEMBERS];
  const [inviteMember, { loading: inviting, error: inviteError }] = useMutation(
    INVITE_MEMBER,
    { refetchQueries },
  );
  const [revokeInvitation] = useMutation(REVOKE_INVITATION, { refetchQueries });
  const toast = useToast();
  const [zweiFaktorZuruecksetzen] = useMutation(ZWEI_FAKTOR_ZURUECKSETZEN);
  const [removeMember, { error: removeError }] = useMutation<{
    removeMember: { removed: boolean; reassignedTasks: number };
  }>(REMOVE_MEMBER, { refetchQueries });

  const [entfernen, setEntfernen] = useState<{
    userId: string;
    name: string;
  } | null>(null);
  const [nachfolger, setNachfolger] = useState('');

  const handleRemove = async (userId: string, nachfolgerId: string) => {
    const result = await removeMember({
      variables: { input: { userId, nachfolgerId } },
    }).catch(() => null);

    if (result?.data == null) {
      return;
    }

    setEntfernen(null);

    const moved = result.data.removeMember.reassignedTasks;

    if (moved > 0 && nachfolgerId === session?.user.id) {
      setReassignedNotice(moved);
    } else {
      toast.zeige({ text: 'Entfernt. Die offene Arbeit ist übergeben.' });
    }
  };

  const handleInvite = async (): Promise<boolean> => {
    const result = await inviteMember({
      variables: { input: { email: email.trim(), role } },
    }).catch(() => null);

    const created = result?.data?.inviteMember;

    if (typeof created?.inviteUrl !== 'string') {
      return false;
    }

    setInvite({
      url: created.inviteUrl,
      delivered: created.delivered === true,
    });
    setEmail('');

    return true;
  };

  return (
    <>
      <ObjectHeader
        hilfe="team"
        kind="team"
        icon={IconTeam}
        label="Team"
        anzahl={data?.workspaceMembers.length ?? 0}
        note={<WorkspaceName />}
        actions={
          mayManageMembers ? (
            <CreateButton create={create} label="Mitglied einladen" />
          ) : undefined
        }
      />

      {(inviteError ?? removeError) !== undefined && (
        <div className="error-banner">
          {(inviteError ?? removeError)?.message}
        </div>
      )}

      <CreatePanel
        create={create}
        submitLabel="Einladung erstellen"
        submitting={inviting}
        onSubmit={handleInvite}
      >
        <div className="field">
          <label htmlFor="invite-email">E-Mail</label>
          <input
            id="invite-email"
            type="email"
            required
            placeholder="name@firma.de"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="invite-role">Rolle</label>
          <select
            id="invite-role"
            value={role}
            onChange={(event) => setRole(event.target.value as MembershipRole)}
          >
            <option value="MEMBER">Mitglied</option>
            <option value="ADMIN">Administrator</option>
          </select>
        </div>
        {mayManageMembers && (
          <EinladungsVorschlaege gewaehlt={email} onWaehlen={setEmail} />
        )}
      </CreatePanel>

      {entfernen !== null && (
        <Dialogfenster
          titel={`${entfernen.name} entfernen`}
          breit
          onClose={() => setEntfernen(null)}
        >
          <p>
            Offene Aufgaben, Firmen, Kontakte und Geschäfte, künftige Termine
            und offene Angebote übernimmt:
          </p>
          <select
            aria-label="Wer übernimmt"
            value={nachfolger}
            onChange={(event) => setNachfolger(event.target.value)}
          >
            {data?.workspaceMembers
              .filter((m) => m.user.id !== entfernen.userId)
              .map((m) => (
                <option key={m.user.id} value={m.user.id}>
                  {m.user.firstName} {m.user.lastName}
                  {m.user.id === session?.user.id ? ' (ich)' : ''}
                </option>
              ))}
          </select>
          <p className="field__hint">
            Postfach und Kalender dieser Person werden getrennt; gelesene Post
            bleibt an den Akten. Erledigtes und Vergangenes bleibt, wie es war.
          </p>
          <div className="row-actions">
            <button
              type="button"
              className="button button--danger"
              disabled={nachfolger === ''}
              onClick={() => void handleRemove(entfernen.userId, nachfolger)}
            >
              Entfernen
            </button>
            <button
              type="button"
              className="button button--ghost"
              onClick={() => setEntfernen(null)}
            >
              Abbrechen
            </button>
          </div>
        </Dialogfenster>
      )}

      {reassignedNotice !== null && (
        <div className="banner banner--warning">
          <span>
            {reassignedNotice === 1
              ? '1 offene Aufgabe wurde Ihnen zugewiesen.'
              : `${reassignedNotice} offene Aufgaben wurden Ihnen zugewiesen.`}
          </span>
          <button
            type="button"
            className="button button--ghost"
            onClick={() => setReassignedNotice(null)}
          >
            Verstanden
          </button>
        </div>
      )}

      {invite !== null && (
        <div className="invite-link">
          <div className="invite-link__label">
            {invite.delivered
              ? 'Einladung verschickt. Der Link steht hier noch einmal, falls die E-Mail nicht ankommt — danach nicht mehr.'
              : 'Die E-Mail konnte nicht verschickt werden. Kopieren Sie den Link und geben Sie ihn selbst weiter — er wird nur einmal angezeigt.'}
            <AbhilfeLink id="einladung" />
          </div>
          <div className="invite-link__row">
            <input
              readOnly
              value={invite.url}
              onFocus={(event) => event.target.select()}
            />
            <button
              type="button"
              className="button button--ghost"
              onClick={() => setInvite(null)}
            >
              Schließen
            </button>
          </div>
        </div>
      )}

      {error !== undefined && (
        <div className="error-banner">{error.message}</div>
      )}

      {loading ? (
        <div className="state">Wird geladen…</div>
      ) : (
        <>
          {assignError !== undefined && (
            <div className="error-banner">{assignError.message}</div>
          )}

          <section className="detail-section">
            <h2>Mitglieder ({data?.workspaceMembers.length ?? 0})</h2>
            <TableWrap>
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>E-Mail</th>
                    <th>Rolle</th>
                    <th>
                      <span className="visually-hidden">Aktionen</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data?.workspaceMembers.map((member) => (
                    <tr key={member.id}>
                      <td>
                        {member.user.firstName} {member.user.lastName}
                      </td>
                      <td>{member.user.email}</td>
                      <td>
                        {mayManageMembers ? (
                          <select
                            aria-label={`Rolle von ${member.user.firstName} ${member.user.lastName}`}
                            value={member.roleId ?? ''}
                            onChange={(event) =>
                              void assignRole({
                                variables: {
                                  userId: member.user.id,
                                  roleId: event.target.value,
                                },
                              }).catch(() => null)
                            }
                          >
                            {member.roleId === null && (
                              <option value="">
                                {MEMBERSHIP_ROLE_LABELS[member.role]}
                              </option>
                            )}
                            {roleData?.roles.map((role) => (
                              <option key={role.id} value={role.id}>
                                {role.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="badge">
                            {member.roleRef?.name ??
                              MEMBERSHIP_ROLE_LABELS[member.role]}
                          </span>
                        )}
                      </td>
                      <td>
                        {member.user.id === session?.user.id ? (
                          <span className="detail-field__empty">Sie</span>
                        ) : (
                          <span className="row-actions">
                            {mayManageMembers && (
                              <button
                                type="button"
                                className="button button--ghost row-action"
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      'Die Zwei-Faktor-Anmeldung dieser Person zurücksetzen? Sie wird überall abgemeldet und bekommt eine Mail.',
                                    )
                                  ) {
                                    void zweiFaktorZuruecksetzen({
                                      variables: { userId: member.user.id },
                                    })
                                      .then(() =>
                                        toast.zeige({
                                          text: 'Zwei-Faktor-Anmeldung zurückgesetzt.',
                                        }),
                                      )
                                      .catch((fehler: Error) =>
                                        toast.zeige({ text: fehler.message }),
                                      );
                                  }
                                }}
                              >
                                2FA zurücksetzen
                              </button>
                            )}
                            <button
                              type="button"
                              className="button button--danger row-action"
                              onClick={() => {
                                setNachfolger(session?.user.id ?? '');
                                setEntfernen({
                                  userId: member.user.id,
                                  name: `${member.user.firstName} ${member.user.lastName}`,
                                });
                              }}
                            >
                              Entfernen
                            </button>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </section>

          <section className="detail-section">
            <h2>Offene Einladungen ({data?.pendingInvitations.length ?? 0})</h2>
            {data?.pendingInvitations.length === 0 ? (
              <p className="notes__empty">Keine offenen Einladungen.</p>
            ) : (
              <TableWrap>
                <table>
                  <thead>
                    <tr>
                      <th>E-Mail</th>
                      <th>Rolle</th>
                      <th>Gültig bis</th>
                      <th>
                        <span className="visually-hidden">Aktionen</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.pendingInvitations.map((invitation) => (
                      <tr key={invitation.id}>
                        <td>{invitation.email}</td>
                        <td>
                          <span className="badge">
                            {MEMBERSHIP_ROLE_LABELS[invitation.role]}
                          </span>
                        </td>
                        <td>{formatDate(invitation.expiresAt)}</td>
                        <td className="row-actions">
                          <button
                            type="button"
                            className="button button--ghost row-action"
                            disabled={inviting}
                            onClick={() =>
                              void inviteMember({
                                variables: {
                                  input: {
                                    email: invitation.email,
                                    role: invitation.role,
                                  },
                                },
                              })
                                .then((r) => {
                                  const neu = (
                                    r.data as {
                                      inviteMember?: {
                                        inviteUrl: string;
                                        delivered: boolean;
                                      };
                                    }
                                  )?.inviteMember;

                                  if (neu !== undefined) {
                                    setInvite({
                                      url: neu.inviteUrl,
                                      delivered: neu.delivered,
                                    });
                                  }
                                })
                                .catch(() => null)
                            }
                          >
                            Erneut senden
                          </button>
                          <button
                            type="button"
                            className="button button--danger row-action"
                            onClick={() =>
                              void revokeInvitation({
                                variables: { id: invitation.id },
                              })
                            }
                          >
                            Zurückziehen
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
          </section>
        </>
      )}
      <Anker id="konto" />
      <KontoSection />
      <Anker id="anmeldemethoden" />
      <AnmeldemethodenSection />
      <Anker id="anmelde-adresse" />
      <EmailAendernSection />
      <Anker id="zwei-faktor" />
      <TwoFactorSection />
      <Anker id="zwei-faktor-pflicht" />
      <ZweiFaktorPflichtSection />
      <Anker id="leerlauf" />
      <LeerlaufSection />
      <Anker id="einladungs-domains" />
      <EinladungsDomainsSection />
      <Anker id="einstieg" />
      <EinstiegSection />
      <Anker id="geraete" />
      <SitzungenSection />
      <Anker id="sicherheitsprotokoll" />
      <SicherheitSection />
      <Anker id="erinnerungen" />
      <ReminderSettings />
      <Anker id="rollen" />
      <RolesSection />
      <Anker id="avv" />
      <AvvSection />
      <Anker id="konto-loeschen" />
      <KontoLoeschenSection />

      {permissions.can('workspace:api') && (
        <>
          <Anker id="api-schluessel" />
          <ApiKeysSection />
          <Anker id="webhooks" />
          <WebhooksSection />
        </>
      )}
    </>
  );
};
