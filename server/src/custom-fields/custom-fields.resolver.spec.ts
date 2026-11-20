import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { runWithRequestContext } from '../observability/request-context';
import { type Feldrechte } from '../workspaces/feldrechte';
import { setzeSichtfeld } from '../workspaces/sichtbarkeit';
import { type WorkspaceRolesService } from '../workspaces/workspace-roles.service';
import { CustomFieldDefinition } from './custom-field.entity';
import { CustomFieldEntity } from './custom-field.types';
import { type PermissionsService } from '../workspaces/permissions.service';
import { CustomFieldsResolver } from './custom-fields.resolver';
import { type CustomFieldsService } from './custom-fields.service';

const definition = (key: string, standardwert: string | null) =>
  Object.assign(new CustomFieldDefinition(), {
    id: key,
    entity: CustomFieldEntity.DEAL,
    key,
    label: key,
    standardwertWert: standardwert,
  });

const provision = definition('provision', '15');
const quelle = definition('quelle', 'Messe');

const resolver = new CustomFieldsResolver(
  {
    list: () => Promise.resolve([provision, quelle]),
    listAll: () => Promise.resolve([provision, quelle]),
  } as unknown as CustomFieldsService,
  {} as WorkspaceRolesService,
  {} as PermissionsService,
);

const user = { workspaceId: 'w1' } as RequestUser;

const als = <T>(rechte: Feldrechte, tun: () => Promise<T>): Promise<T> =>
  runWithRequestContext({ requestId: 'test' }, () => {
    setzeSichtfeld(() =>
      Promise.resolve({
        ich: null,
        arten: { company: 'alle', contact: 'alle', deal: 'alle' },
        felder: rechte,
      }),
    );

    return tun();
  });

const standardwerte = (felder: CustomFieldDefinition[]) =>
  Object.fromEntries(felder.map((feld) => [feld.key, feld.standardwert]));

describe('customFields und Feldrechte', () => {
  it('gibt den Standardwert eines verborgenen Felds nicht heraus', async () => {
    for (const entity of [CustomFieldEntity.DEAL, undefined]) {
      const felder = await als({ 'custom:deal:provision': 'verborgen' }, () =>
        resolver.customFields(user, entity),
      );

      expect(standardwerte(felder)).toEqual({
        provision: null,
        quelle: 'Messe',
      });
    }

    expect(provision.standardwert).toBe('15');
  });

  it('gibt ihn der Rolle mit „lesen“, mit allen Rechten und ohne Rolle', async () => {
    for (const rechte of [
      { 'custom:deal:provision': 'lesen' } as Feldrechte,
      {},
    ]) {
      const felder = await als(rechte, () => resolver.customFields(user));

      expect(standardwerte(felder)).toEqual({
        provision: '15',
        quelle: 'Messe',
      });
    }

    const ohne = await resolver.customFields(user, CustomFieldEntity.DEAL);

    expect(standardwerte(ohne).provision).toBe('15');
  });

  it('meint mit dem Recht an einer Art nicht das gleichnamige Feld einer anderen', async () => {
    const felder = await als({ 'custom:company:provision': 'verborgen' }, () =>
      resolver.customFields(user, CustomFieldEntity.DEAL),
    );

    expect(standardwerte(felder).provision).toBe('15');
  });
});
