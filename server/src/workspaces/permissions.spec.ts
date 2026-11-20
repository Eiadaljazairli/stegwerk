import {
  ALL_PERMISSIONS,
  cleanPermissions,
  Permission,
  roleAllows,
  ROLE_TEMPLATES,
  withImpliedViews,
} from './permissions';

const roleFor = (key: string) => {
  const template = ROLE_TEMPLATES.find((entry) => entry.key === key);

  if (template === undefined) {
    throw new Error(`no template named ${key}`);
  }

  return {
    everything: template.everything,
    permissions: [...template.permissions] as string[],
  };
};

describe('asking a role', () => {
  it('lets the owner do anything', () => {
    const owner = roleFor('owner');

    for (const permission of ALL_PERMISSIONS) {
      expect(roleAllows(owner, permission)).toBe(true);
    }
  });

  it('lets the owner do something invented after the role was stored', () => {
    expect(
      roleAllows(
        { everything: true, permissions: [] },
        'something:new' as Permission,
      ),
    ).toBe(true);
  });

  it('answers from the list for everybody else', () => {
    const member = roleFor('member');

    expect(roleAllows(member, Permission.DEAL_WRITE)).toBe(true);
    expect(roleAllows(member, Permission.BILLING_MANAGE)).toBe(false);
  });

  it('refuses a role with nothing granted', () => {
    expect(
      roleAllows({ everything: false, permissions: [] }, Permission.DEAL_VIEW),
    ).toBe(false);
  });
});

describe('the roles a workspace starts with', () => {
  it('offers an owner, an administrator, a member and a reader', () => {
    expect(ROLE_TEMPLATES.map((role) => role.key)).toEqual([
      'owner',
      'admin',
      'member',
      'readonly',
    ]);
  });

  it('gives exactly one of them everything', () => {
    expect(ROLE_TEMPLATES.filter((role) => role.everything)).toHaveLength(1);
  });

  it('keeps billing to the owner', () => {
    for (const key of ['admin', 'member', 'readonly']) {
      expect(roleAllows(roleFor(key), Permission.BILLING_MANAGE)).toBe(false);
    }
  });

  it('keeps the GDPR tools to the owner', () => {
    for (const key of ['admin', 'member', 'readonly']) {
      expect(roleAllows(roleFor(key), Permission.DATA_PRIVACY)).toBe(false);
    }
  });

  it('lets an administrator run the workspace but not pay for it', () => {
    const admin = roleFor('admin');

    expect(roleAllows(admin, Permission.MEMBER_MANAGE)).toBe(true);
    expect(roleAllows(admin, Permission.FIELD_MANAGE)).toBe(true);
    expect(roleAllows(admin, Permission.BILLING_MANAGE)).toBe(false);
  });

  it('stops a plain member reshaping the workspace for everybody', () => {
    const member = roleFor('member');

    expect(roleAllows(member, Permission.FIELD_MANAGE)).toBe(false);
    expect(roleAllows(member, Permission.MEMBER_MANAGE)).toBe(false);
  });

  it('lets a plain member work with every record', () => {
    const member = roleFor('member');

    expect(roleAllows(member, Permission.COMPANY_WRITE)).toBe(true);
    expect(roleAllows(member, Permission.DEAL_DELETE)).toBe(true);
    expect(roleAllows(member, Permission.QUOTE_SEND)).toBe(true);
  });

  it('gives the reader every view and no write at all', () => {
    const reader = roleFor('readonly');

    expect(roleAllows(reader, Permission.DEAL_VIEW)).toBe(true);
    expect(roleAllows(reader, Permission.COMPANY_VIEW)).toBe(true);

    for (const permission of ALL_PERMISSIONS) {
      if (!permission.endsWith(':view')) {
        expect(roleAllows(reader, permission)).toBe(false);
      }
    }
  });

  it('does not let the reader take the customer list out of the building', () => {
    expect(roleAllows(roleFor('readonly'), Permission.DATA_EXPORT)).toBe(false);
  });
});

describe('cleaning what was stored', () => {
  it('keeps what this product recognises', () => {
    expect(
      cleanPermissions([Permission.DEAL_VIEW, Permission.DEAL_WRITE]),
    ).toEqual([Permission.DEAL_VIEW, Permission.DEAL_WRITE]);
  });

  it('drops a permission this product no longer has', () => {
    expect(cleanPermissions(['deal:view', 'deal:teleport'])).toEqual([
      Permission.DEAL_VIEW,
    ]);
  });

  it('drops a repeat rather than storing it twice', () => {
    expect(cleanPermissions(['deal:view', 'deal:view'])).toEqual([
      Permission.DEAL_VIEW,
    ]);
  });

  it('handles an empty list', () => {
    expect(cleanPermissions([])).toEqual([]);
  });
});

describe('writing implies seeing', () => {
  it('adds the view a write needs', () => {
    expect(withImpliedViews([Permission.DEAL_WRITE])).toEqual(
      expect.arrayContaining([Permission.DEAL_WRITE, Permission.DEAL_VIEW]),
    );
  });

  it('adds the view a delete needs', () => {
    expect(withImpliedViews([Permission.COMPANY_DELETE])).toContain(
      Permission.COMPANY_VIEW,
    );
  });

  it('adds the view sending a quote needs', () => {
    expect(withImpliedViews([Permission.QUOTE_SEND])).toContain(
      Permission.QUOTE_VIEW,
    );
  });

  it('invents nothing for a workspace permission', () => {
    expect(withImpliedViews([Permission.BILLING_MANAGE])).toEqual([
      Permission.BILLING_MANAGE,
    ]);
  });

  it('leaves a view on its own alone', () => {
    expect(withImpliedViews([Permission.DEAL_VIEW])).toEqual([
      Permission.DEAL_VIEW,
    ]);
  });

  it('does not repeat a view that was already granted', () => {
    const result = withImpliedViews([
      Permission.DEAL_VIEW,
      Permission.DEAL_WRITE,
    ]);

    expect(
      result.filter((entry) => entry === Permission.DEAL_VIEW),
    ).toHaveLength(1);
  });
});
