import { ForbiddenException, NotFoundException } from '@nestjs/common';

import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { Permission } from '../workspaces/permissions';
import { type PermissionsService } from '../workspaces/permissions.service';
import {
  AusfuehrungStatus,
  type AutomationAusfuehrungEntity,
} from './automation-ausfuehrung.entity';
import {
  AutomationAktion,
  AutomationAusloeser,
  type AutomationEntity,
} from './automation.entity';
import {
  AutomationAusfuehrungResolver,
  AutomationenResolver,
} from './automationen.resolver';
import { type AutomationenService } from './automationen.service';

const user: RequestUser = {
  userId: 'u-1',
  workspaceId: 'w-1',
  email: 'u@example.de',
};

const regel = {
  id: 'r-1',
  name: 'Geändert',
  ausloeser: AutomationAusloeser.GESCHAEFT_GEAENDERT,
  bedingung: { art: null },
} as unknown as AutomationEntity;

describe('automationTesten', () => {
  it('prüft den Datensatz auch bei einer Ereignis-Regel gegen die Zeilenrechte', async () => {
    const sichtbarFuerAnrufer = jest.fn().mockResolvedValue(false);
    const testen = jest.fn();
    const resolver = new AutomationenResolver(
      {
        list: () => Promise.resolve([regel]),
        sichtbarFuerAnrufer,
        testen,
      } as unknown as AutomationenService,
      {
        assert: () => Promise.resolve(),
      } as unknown as PermissionsService,
    );

    await expect(
      resolver.automationTesten(user, regel.id, 'fremdes-geschaeft'),
    ).rejects.toThrow(NotFoundException);
    expect(sichtbarFuerAnrufer).toHaveBeenCalledWith(
      'deal',
      'fremdes-geschaeft',
    );
    expect(testen).not.toHaveBeenCalled();
  });

  it('rechnet den Probelauf mit den Rechten des Aufrufers', async () => {
    const testen = jest.fn().mockResolvedValue({});
    const resolver = new AutomationenResolver(
      {
        list: () => Promise.resolve([regel]),
        sichtbarFuerAnrufer: () => Promise.resolve(true),
        testen,
      } as unknown as AutomationenService,
      {
        assert: () => Promise.resolve(),
      } as unknown as PermissionsService,
    );

    await resolver.automationTesten(user, regel.id, null);

    expect(testen).toHaveBeenCalledWith('w-1', regel.id, null, null, user);
  });
});

describe('Nur zum Lesen freigegeben', () => {
  const knopf = {
    ...regel,
    ausloeser: AutomationAusloeser.MANUELL,
    bedingung: { art: 'deal' },
  } as unknown as AutomationEntity;

  it('weist Knopf und Probelauf ab, wenn der Anrufer nur lesen darf', async () => {
    const schreibbarFuerAnrufer = jest.fn().mockResolvedValue(false);
    const manuellStarten = jest.fn();
    const testen = jest.fn();
    const resolver = new AutomationenResolver(
      {
        list: () => Promise.resolve([knopf]),
        sichtbarFuerAnrufer: () => Promise.resolve(true),
        schreibbarFuerAnrufer,
        manuellStarten,
        testen,
      } as unknown as AutomationenService,
      {
        assert: () => Promise.resolve(),
      } as unknown as PermissionsService,
    );

    await expect(
      resolver.automationStarten(user, knopf.id, 'gelesen'),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      resolver.automationTesten(user, knopf.id, 'gelesen'),
    ).rejects.toThrow(ForbiddenException);
    expect(schreibbarFuerAnrufer).toHaveBeenCalledWith(
      'w-1',
      'deal',
      'gelesen',
    );
    expect(manuellStarten).not.toHaveBeenCalled();
    expect(testen).not.toHaveBeenCalled();
  });
});

describe('Schritte eines Laufs', () => {
  const lauf = {
    schritte: [
      {
        nr: 1,
        aktion: AutomationAktion.DATENSAETZE_SUCHEN,
        status: AusfuehrungStatus.OK,
        grund: null,
        eingabe: { suchWert: 'x' },
        ausgabe: { treffer: [{ amount: 99_000 }] },
      },
    ],
  } as unknown as AutomationAusfuehrungEntity;

  it('zeigt sie nur, wer Automationen verwaltet', async () => {
    const can = jest.fn().mockResolvedValue(false);
    const resolver = new AutomationAusfuehrungResolver({
      can,
    } as unknown as PermissionsService);

    expect(await resolver.schritte(user, lauf)).toEqual([]);
    expect(can).toHaveBeenCalledWith(user, Permission.FIELD_MANAGE);

    can.mockResolvedValue(true);

    expect(await resolver.schritte(user, lauf)).toHaveLength(1);
  });
});
