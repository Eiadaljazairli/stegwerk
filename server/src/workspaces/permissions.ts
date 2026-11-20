import { registerEnumType } from '@nestjs/graphql';

export enum Permission {
  COMPANY_VIEW = 'company:view',
  COMPANY_WRITE = 'company:write',
  COMPANY_DELETE = 'company:delete',

  CONTACT_VIEW = 'contact:view',
  CONTACT_WRITE = 'contact:write',
  CONTACT_DELETE = 'contact:delete',

  DEAL_VIEW = 'deal:view',
  DEAL_WRITE = 'deal:write',
  DEAL_DELETE = 'deal:delete',

  QUOTE_VIEW = 'quote:view',
  QUOTE_WRITE = 'quote:write',
  QUOTE_SEND = 'quote:send',
  QUOTE_DELETE = 'quote:delete',

  INVOICE_VIEW = 'invoice:view',
  INVOICE_WRITE = 'invoice:write',
  INVOICE_ISSUE = 'invoice:issue',

  TASK_VIEW = 'task:view',
  TASK_WRITE = 'task:write',

  APPOINTMENT_VIEW = 'appointment:view',
  APPOINTMENT_WRITE = 'appointment:write',

  MEMBER_MANAGE = 'workspace:members',
  ROLE_MANAGE = 'workspace:roles',
  FIELD_MANAGE = 'workspace:fields',
  LETTERHEAD_MANAGE = 'workspace:letterhead',
  BILLING_MANAGE = 'workspace:billing',

  DATA_EXPORT = 'workspace:export',
  DATA_PRIVACY = 'workspace:privacy',
  CAMPAIGN_SEND = 'workspace:campaigns',
  API_MANAGE = 'workspace:api',
  AUDIT_VIEW = 'workspace:audit',
  KI_APPROVE = 'workspace:ki',
  MAILBOX_SHARED_MANAGE = 'workspace:postfaecher',
}

registerEnumType(Permission, { name: 'Permission' });

export const ALL_PERMISSIONS: readonly Permission[] = Object.values(Permission);

const RECORD_PERMISSIONS: readonly Permission[] = ALL_PERMISSIONS.filter(
  (permission) => !permission.startsWith('workspace:'),
);

const VIEW_ONLY: readonly Permission[] = ALL_PERMISSIONS.filter((permission) =>
  permission.endsWith(':view'),
);

export type RoleTemplate = {
  key: string;
  name: string;
  description: string;
  everything: boolean;
  permissions: readonly Permission[];
};

export const ROLE_TEMPLATES: readonly RoleTemplate[] = [
  {
    key: 'owner',
    name: 'Inhaber',
    description:
      'Darf alles, einschließlich Abrechnung, Rollen und Löschen des Arbeitsbereichs.',
    everything: true,
    permissions: [],
  },
  {
    key: 'admin',
    name: 'Administrator',
    description:
      'Richtet den Arbeitsbereich ein und verwaltet das Team. Keine Abrechnung.',
    everything: false,
    permissions: [
      ...RECORD_PERMISSIONS,
      Permission.MEMBER_MANAGE,
      Permission.FIELD_MANAGE,
      Permission.LETTERHEAD_MANAGE,
      Permission.DATA_EXPORT,
      Permission.CAMPAIGN_SEND,
      Permission.API_MANAGE,
      Permission.AUDIT_VIEW,
      Permission.KI_APPROVE,
      Permission.MAILBOX_SHARED_MANAGE,
    ],
  },
  {
    key: 'member',
    name: 'Mitglied',
    description: 'Arbeitet mit Firmen, Kontakten, Geschäften und Angeboten.',
    everything: false,
    permissions: [...RECORD_PERMISSIONS],
  },
  {
    key: 'readonly',
    name: 'Nur Lesen',
    description:
      'Sieht alles, ändert nichts. Für Buchhaltung oder Aushilfen gedacht.',
    everything: false,
    permissions: [...VIEW_ONLY],
  },
];

export const roleAllows = (
  role: { everything: boolean; permissions: string[] },
  permission: Permission,
): boolean => role.everything || role.permissions.includes(permission);

export const cleanPermissions = (input: readonly string[]): Permission[] => {
  const known = new Set<string>(ALL_PERMISSIONS);

  return [...new Set(input)].filter((entry): entry is Permission =>
    known.has(entry),
  );
};

export const withImpliedViews = (
  permissions: readonly Permission[],
): Permission[] => {
  const result = new Set(permissions);

  for (const permission of permissions) {
    const [subject, action] = permission.split(':');

    if (action !== 'view' && subject !== 'workspace') {
      result.add(`${subject}:view` as Permission);
    }
  }

  return [...result];
};
