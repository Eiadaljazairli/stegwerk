import { registerEnumType } from '@nestjs/graphql';

export enum AttendeeStatus {
  NEEDS_ACTION = 'NEEDS_ACTION',
  ACCEPTED = 'ACCEPTED',
  DECLINED = 'DECLINED',
  TENTATIVE = 'TENTATIVE',
}

registerEnumType(AttendeeStatus, { name: 'AttendeeStatus' });

export const ATTENDEE_STATUS_LABELS: Record<AttendeeStatus, string> = {
  [AttendeeStatus.NEEDS_ACTION]: 'Offen',
  [AttendeeStatus.ACCEPTED]: 'Zugesagt',
  [AttendeeStatus.DECLINED]: 'Abgesagt',
  [AttendeeStatus.TENTATIVE]: 'Unter Vorbehalt',
};

export const ICS_PARTSTAT: Record<AttendeeStatus, string> = {
  [AttendeeStatus.NEEDS_ACTION]: 'NEEDS-ACTION',
  [AttendeeStatus.ACCEPTED]: 'ACCEPTED',
  [AttendeeStatus.DECLINED]: 'DECLINED',
  [AttendeeStatus.TENTATIVE]: 'TENTATIVE',
};

export type AttendeeLink = {
  contactId?: string | null;
  userId?: string | null;
  email?: string | null;
  name?: string | null;
};

export const attendeeIdentity = (
  attendee: AttendeeLink,
  linked: {
    contact?: {
      firstName: string;
      lastName: string;
      email: string | null;
    } | null;
    user?: { firstName: string; lastName: string; email: string } | null;
  } = {},
): { name: string; email: string | null } => {
  if (attendee.contactId !== null && attendee.contactId !== undefined) {
    const contact = linked.contact;

    return {
      name:
        contact === null || contact === undefined
          ? (attendee.name ?? 'Gelöschter Kontakt')
          : `${contact.firstName} ${contact.lastName}`.trim(),
      email: contact?.email ?? attendee.email ?? null,
    };
  }

  if (attendee.userId !== null && attendee.userId !== undefined) {
    const user = linked.user;

    return {
      name:
        user === null || user === undefined
          ? (attendee.name ?? 'Ehemaliges Teammitglied')
          : `${user.firstName} ${user.lastName}`.trim(),
      email: user?.email ?? attendee.email ?? null,
    };
  }

  const name = attendee.name?.trim() ?? '';

  return {
    name: name === '' ? (attendee.email ?? 'Unbekannt') : name,
    email: attendee.email ?? null,
  };
};

export const attendeeProblem = (attendee: AttendeeLink): string | null => {
  const links = [attendee.contactId, attendee.userId].filter(
    (value) => value !== undefined && value !== null,
  );

  if (links.length > 1) {
    return 'Ein Teilnehmer ist entweder ein Kontakt oder jemand aus dem Team, nicht beides.';
  }

  const hasEmail =
    attendee.email !== undefined &&
    attendee.email !== null &&
    attendee.email.trim() !== '';

  if (links.length === 0 && !hasEmail) {
    return 'Ein Teilnehmer braucht einen Kontakt, ein Teammitglied oder eine E-Mail-Adresse.';
  }

  if (hasEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(attendee.email!.trim())) {
    return `Das sieht nicht nach einer E-Mail-Adresse aus: ${attendee.email!.trim()}`;
  }

  return null;
};

export const isSameAttendee = (
  left: AttendeeLink & { resolvedEmail?: string | null },
  right: AttendeeLink & { resolvedEmail?: string | null },
): boolean => {
  if (
    left.contactId !== null &&
    left.contactId !== undefined &&
    left.contactId === right.contactId
  ) {
    return true;
  }

  if (
    left.userId !== null &&
    left.userId !== undefined &&
    left.userId === right.userId
  ) {
    return true;
  }

  const leftMail = (left.resolvedEmail ?? left.email ?? '')
    .trim()
    .toLowerCase();
  const rightMail = (right.resolvedEmail ?? right.email ?? '')
    .trim()
    .toLowerCase();

  return leftMail !== '' && leftMail === rightMail;
};

export const attendeeSummary = (
  statuses: readonly AttendeeStatus[],
): string => {
  if (statuses.length === 0) {
    return 'Keine Teilnehmer';
  }

  const zugesagt = statuses.filter(
    (status) => status === AttendeeStatus.ACCEPTED,
  ).length;
  const abgesagt = statuses.filter(
    (status) => status === AttendeeStatus.DECLINED,
  ).length;

  const kopf =
    statuses.length === 1
      ? '1 Teilnehmer'
      : `${String(statuses.length)} Teilnehmer`;

  const teile: string[] = [];

  if (zugesagt > 0) {
    teile.push(`${String(zugesagt)} zugesagt`);
  }

  if (abgesagt > 0) {
    teile.push(`${String(abgesagt)} abgesagt`);
  }

  return teile.length === 0 ? kopf : `${kopf}, ${teile.join(', ')}`;
};
