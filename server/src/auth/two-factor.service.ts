import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { DataSource, IsNull } from 'typeorm';

import {
  open,
  type Schluesselbund,
  schluesselbund,
  seal,
} from '../mailboxes/secret-box';
import { UserEntity } from '../users/user.entity';

import { RecoveryCodeEntity } from './recovery-code.entity';
import { neuerCode, normalisieren, SALT_ROUNDS } from './recovery-codes';
import { neuesGeheimnis, otpauthUrl, pruefeCode } from './totp';
import { meldeSicherheit } from '../sicherheit/melden';

const ANZAHL_CODES = 10;

@Injectable()
export class TwoFactorService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {}

  private schluessel(): Schluesselbund {
    const roh = this.configService.get<string>('totpEncryptionKey');

    if (roh === undefined || roh.trim() === '') {
      throw new BadRequestException(
        'Für diese Installation ist kein TOTP_ENCRYPTION_KEY hinterlegt. ' +
          'Ohne ihn lässt sich die Zwei-Faktor-Anmeldung nicht einschalten.',
      );
    }

    return schluesselbund(
      roh,
      this.configService.get<string>('totpEncryptionKeyAlt'),
    );
  }

  async beginnen(
    userId: string,
    email: string,
  ): Promise<{ secret: string; url: string }> {
    const bisher = await this.dataSource.manager.findOne(UserEntity, {
      where: { id: userId },
      select: ['id', 'totpEnabledAt'],
    });

    if (bisher?.totpEnabledAt !== null && bisher?.totpEnabledAt !== undefined) {
      throw new BadRequestException(
        'Die Zwei-Faktor-Anmeldung ist schon eingeschaltet. Schalten Sie sie zuerst mit einem Code ab, um sie neu einzurichten.',
      );
    }

    const key = this.schluessel();
    const geheimnis = neuesGeheimnis();

    await this.dataSource.manager.update(UserEntity, userId, {
      totpSecret: seal(geheimnis, key),
      totpEnabledAt: null,
      totpLastCounter: null,
    });

    return {
      secret: geheimnis,
      url: otpauthUrl({ geheimnis, konto: email, herausgeber: 'Stegwerk' }),
    };
  }

  async bestaetigen(userId: string, code: string): Promise<string[]> {
    const key = this.schluessel();
    const user = await this.dataSource.manager.findOne(UserEntity, {
      where: { id: userId },
    });

    if (user?.totpSecret === null || user?.totpSecret === undefined) {
      throw new BadRequestException('Es ist keine Einrichtung im Gange.');
    }

    const zaehler = pruefeCode(open(user.totpSecret, key), code, Date.now());

    if (zaehler === null) {
      throw new BadRequestException('Der Code stimmt nicht.');
    }

    const codes = Array.from({ length: ANZAHL_CODES }, () => neuerCode());

    const hashes = await Promise.all(
      codes.map((klartext) => bcrypt.hash(klartext, SALT_ROUNDS)),
    );

    await this.dataSource.transaction(async (manager) => {
      await manager.update(UserEntity, userId, {
        totpEnabledAt: new Date(),
        totpLastCounter: String(zaehler),
      });

      await manager.delete(RecoveryCodeEntity, { userId });
      await manager.insert(
        RecoveryCodeEntity,
        hashes.map((codeHash) => ({ userId, codeHash, usedAt: null })),
      );
    });

    meldeSicherheit({ art: 'zwei_faktor_an', userId, actorId: userId });

    return codes;
  }

  async pruefen(user: UserEntity, eingabe: string): Promise<void> {
    if (user.totpEnabledAt === null || user.totpSecret === null) {
      return;
    }

    const key = this.schluessel();
    const zaehler = pruefeCode(open(user.totpSecret, key), eingabe, Date.now());

    if (zaehler !== null) {
      const zuletzt =
        user.totpLastCounter === null ? null : Number(user.totpLastCounter);

      if (zuletzt !== null && zaehler <= zuletzt) {
        throw new UnauthorizedException(
          'Dieser Code wurde schon benutzt. Bitte den nächsten abwarten.',
        );
      }

      await this.dataSource.manager.update(UserEntity, user.id, {
        totpLastCounter: String(zaehler),
      });

      return;
    }

    if (await this.wiederherstellungscodeEinloesen(user.id, eingabe)) {
      return;
    }

    throw new UnauthorizedException('Der Code stimmt nicht.');
  }

  private async wiederherstellungscodeEinloesen(
    userId: string,
    eingabe: string,
  ): Promise<boolean> {
    const getippt = normalisieren(eingabe);

    if (getippt === null) {
      return false;
    }

    const offene = await this.dataSource.manager.find(RecoveryCodeEntity, {
      where: { userId, usedAt: IsNull() },
    });

    for (const kandidat of offene) {
      if (await bcrypt.compare(getippt, kandidat.codeHash)) {
        await this.dataSource.manager.update(RecoveryCodeEntity, kandidat.id, {
          usedAt: new Date(),
        });

        return true;
      }
    }

    return false;
  }

  async abschalten(userId: string, code: string): Promise<boolean> {
    const user = await this.dataSource.manager.findOne(UserEntity, {
      where: { id: userId },
    });

    if (user === null || user.totpEnabledAt === null) {
      throw new BadRequestException(
        'Die Zwei-Faktor-Anmeldung ist nicht aktiv.',
      );
    }

    await this.pruefen(user, code);

    await this.dataSource.transaction(async (manager) => {
      await manager.update(UserEntity, userId, {
        totpSecret: null,
        totpEnabledAt: null,
        totpLastCounter: null,
      });
      await manager.delete(RecoveryCodeEntity, { userId });
    });

    meldeSicherheit({ art: 'zwei_faktor_aus', userId, actorId: userId });

    return true;
  }

  async istAktiv(userId: string): Promise<boolean> {
    const user = await this.dataSource.manager.findOne(UserEntity, {
      where: { id: userId },
      select: { id: true, totpEnabledAt: true },
    });

    return user?.totpEnabledAt != null;
  }

  async offeneCodes(userId: string): Promise<number> {
    return this.dataSource.manager.count(RecoveryCodeEntity, {
      where: { userId, usedAt: IsNull() },
    });
  }
}
