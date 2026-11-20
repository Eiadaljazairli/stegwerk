import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { MembershipEntity } from './membership.entity';

@Injectable()
export class MembershipsService {
  constructor(
    @InjectRepository(MembershipEntity)
    private readonly membershipRepository: Repository<MembershipEntity>,
  ) {}

  async setTaskDigest(
    workspaceId: string,
    userId: string,
    enabled: boolean,
  ): Promise<MembershipEntity> {
    const membership = await this.membershipRepository.findOne({
      where: { workspaceId, userId },
    });

    if (membership === null) {
      throw new NotFoundException('Mitgliedschaft nicht gefunden.');
    }

    membership.taskDigest = enabled;

    return this.membershipRepository.save(membership);
  }

  async setErwaehnungMail(
    workspaceId: string,
    userId: string,
    enabled: boolean,
  ): Promise<MembershipEntity> {
    const membership = await this.membershipRepository.findOne({
      where: { workspaceId, userId },
    });

    if (membership === null) {
      throw new NotFoundException('Mitgliedschaft nicht gefunden.');
    }

    membership.erwaehnungMail = enabled;

    return this.membershipRepository.save(membership);
  }

  findOne(
    userId: string,
    workspaceId: string,
  ): Promise<MembershipEntity | null> {
    return this.membershipRepository.findOne({
      where: { userId, workspaceId },
    });
  }

  findForUser(userId: string): Promise<MembershipEntity[]> {
    return this.membershipRepository.find({
      where: { userId },
      relations: { workspace: true },
      order: { createdAt: 'ASC' },
    });
  }

  findForWorkspace(workspaceId: string): Promise<MembershipEntity[]> {
    return this.membershipRepository.find({
      where: { workspaceId },
      relations: { user: true },
      order: { createdAt: 'ASC' },
    });
  }
}
