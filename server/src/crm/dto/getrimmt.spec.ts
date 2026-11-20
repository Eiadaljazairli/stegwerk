import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateDealInput } from './deal.dto';
import { CreateTaskInput } from './task.dto';

const meldungen = async (klasse: new () => object, werte: object) =>
  (await validate(plainToInstance(klasse, werte))).flatMap((fehler) =>
    Object.values(fehler.constraints ?? {}),
  );

describe('Getrimmt', () => {
  it('lehnt Geschäft und Aufgabe ohne sichtbaren Namen ab', async () => {
    expect(await meldungen(CreateDealInput, { name: '   ' })).toEqual([
      'Der Name darf nicht leer sein.',
    ]);
    expect(await meldungen(CreateTaskInput, { title: '\t ' })).toEqual([
      'Eine Aufgabe braucht einen Titel.',
    ]);
  });

  it('nimmt den Rand weg und lässt den Rest stehen', async () => {
    const deal = plainToInstance(CreateDealInput, { name: '  Neubau Halle ' });

    expect(deal.name).toBe('Neubau Halle');
    expect(await validate(deal)).toEqual([]);
  });
});
