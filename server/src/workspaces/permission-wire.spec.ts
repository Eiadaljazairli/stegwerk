import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const schema = readFileSync(join(process.cwd(), 'schema.gql'), 'utf8');

const typeBlock = (name: string): string => {
  const match = new RegExp(`(?:type|input) ${name} \\{([^}]*)\\}`, 'u').exec(
    schema,
  );

  if (match === null) {
    throw new Error(`${name} is not in schema.gql`);
  }

  return match[1];
};

describe('permissions on the wire', () => {
  it('leave a role as keys, the way myPermissions already does', () => {
    expect(typeBlock('Role')).toMatch(/permissions: \[String!\]!/u);
    expect(typeBlock('MyPermissions')).toMatch(/permissions: \[String!\]!/u);
  });

  it('are accepted as keys when a role is created or changed', () => {
    expect(typeBlock('CreateRoleInput')).toMatch(/permissions: \[String!\]!/u);
    expect(typeBlock('UpdateRoleInput')).toMatch(/permissions: \[String!\]/u);
  });

  it('speak one dialect, so the enum does not appear on the wire at all', () => {
    expect(schema).not.toMatch(/enum Permission \{/u);
  });
});
