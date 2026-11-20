import { BadRequestException } from '@nestjs/common';

import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { type PermissionsService } from '../workspaces/permissions.service';
import { MAX_KACHELN } from './kacheln';
import { type KachelInput } from './uebersicht.dto';
import { UebersichtResolver } from './uebersicht.resolver';
import { leer, type UebersichtService } from './uebersicht.service';

const user = { userId: 'u1', workspaceId: 'w1' } as RequestUser;

const kachel = (id: string, objekt = 'deal'): KachelInput =>
  ({
    id,
    typ: 'kennzahl',
    titel: null,
    objekt,
    mass: 'anzahl',
    gruppe: null,
    status: objekt === 'company' ? null : 'alle',
    pipelineId: null,
    nurMeine: false,
    zeitraum: 'alle',
    liste: null,
  }) as unknown as KachelInput;

const aufbauen = (darf: (recht: string) => boolean) => {
  const werte = jest.fn((_w: string, _u: string, k: { id: string }) =>
    Promise.resolve(leer({ anzahl: Number(k.id.replace(/\D/gu, '')) })),
  );
  const resolver = new UebersichtResolver(
    {
      can: jest.fn((_u: RequestUser, recht: string) =>
        Promise.resolve(darf(recht)),
      ),
    } as unknown as PermissionsService,
    { werte } as unknown as UebersichtService,
  );

  return { resolver, werte };
};

describe('kachelnWerte', () => {
  it('rechnet alle Kacheln in einer Anfrage, in derselben Reihenfolge', async () => {
    const { resolver, werte } = aufbauen(() => true);

    const ergebnis = await resolver.kachelnWerte(user, [
      kachel('k3'),
      kachel('k1'),
      kachel('k2'),
    ]);

    expect(ergebnis.map((e) => e.anzahl)).toEqual([3, 1, 2]);
    expect(werte).toHaveBeenCalledTimes(3);
  });

  it('prüft das Leserecht je Kachel wie kachelWerte', async () => {
    const { resolver } = aufbauen((recht) => recht !== 'company:view');

    const [geschaefte, firmen] = await resolver.kachelnWerte(user, [
      kachel('k1', 'deal'),
      kachel('k2', 'company'),
    ]);

    expect(geschaefte.gesperrt).toBe(false);
    expect(firmen).toMatchObject({
      gesperrt: true,
      anzahl: null,
      hinweis: 'Ihre Rolle darf das nicht sehen.',
    });
  });

  it('eine ungültige Kachel nimmt die anderen nicht mit', async () => {
    const { resolver } = aufbauen(() => true);

    const [kaputt, gut] = await resolver.kachelnWerte(user, [
      { ...kachel('k1'), typ: 'gibtsnicht' } as unknown as KachelInput,
      kachel('k2'),
    ]);

    expect(kaputt.gesperrt).toBe(true);
    expect(kaputt.hinweis).toEqual(expect.any(String));
    expect(gut.anzahl).toBe(2);
  });

  it('ein unerwarteter Fehler wird nicht nach außen gereicht', async () => {
    const { resolver, werte } = aufbauen(() => true);

    werte.mockRejectedValueOnce(new Error('relation "geheim" does not exist'));

    const [ergebnis] = await resolver.kachelnWerte(user, [kachel('k1')]);

    expect(ergebnis.gesperrt).toBe(true);
    expect(ergebnis.hinweis).not.toContain('geheim');
  });

  it('höchstens so viele Kacheln, wie eine Übersicht haben kann', async () => {
    const { resolver } = aufbauen(() => true);
    const zuViele = Array.from({ length: MAX_KACHELN + 1 }, (_, i) =>
      kachel(`k${String(i)}`),
    );

    await expect(resolver.kachelnWerte(user, zuViele)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
