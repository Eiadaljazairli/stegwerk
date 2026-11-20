import { NotFoundException, UseGuards } from '@nestjs/common';
import {
  Args,
  Field,
  ID,
  InputType,
  Mutation,
  Query,
  Resolver,
} from '@nestjs/graphql';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNotEmpty, IsOptional, IsUUID, MaxLength } from 'class-validator';
import { Repository } from 'typeorm';

import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { BillingWriteGuard } from '../billing/guards/billing-write.guard';
import { Permission } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import { MailTemplateEntity } from './mail-template.entity';

@InputType()
export class MailTemplateInput {
  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  id?: string;

  @Field()
  @IsNotEmpty({ message: 'Die Vorlage braucht einen Namen.' })
  @MaxLength(100, { message: 'Ein Name hat höchstens 100 Zeichen.' })
  name: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @MaxLength(300)
  subject?: string | null;

  @Field()
  @IsNotEmpty({ message: 'Die Vorlage braucht einen Text.' })
  @MaxLength(20000)
  body: string;
}

@Resolver(() => MailTemplateEntity)
@UseGuards(GqlAuthGuard, BillingWriteGuard)
export class MailTemplatesResolver {
  constructor(
    @InjectRepository(MailTemplateEntity)
    private readonly templates: Repository<MailTemplateEntity>,
    private readonly permissions: PermissionsService,
  ) {}

  @Query(() => [MailTemplateEntity])
  async mailTemplates(
    @CurrentUser() user: RequestUser,
  ): Promise<MailTemplateEntity[]> {
    await this.permissions.assert(
      user,
      Permission.CONTACT_VIEW,
      'Kontakte zu sehen',
    );

    return this.templates.find({
      where: { workspaceId: user.workspaceId },
      order: { name: 'ASC' },
    });
  }

  @Mutation(() => MailTemplateEntity)
  async saveMailTemplate(
    @CurrentUser() user: RequestUser,
    @Args('input') input: MailTemplateInput,
  ): Promise<MailTemplateEntity> {
    await this.permissions.assert(
      user,
      Permission.CONTACT_WRITE,
      'Mailvorlagen zu pflegen',
    );

    const vorhanden =
      input.id === undefined
        ? null
        : await this.templates.findOne({
            where: { id: input.id, workspaceId: user.workspaceId },
          });

    if (input.id !== undefined && vorhanden === null) {
      throw new NotFoundException('Diese Vorlage gibt es nicht.');
    }

    return this.templates.save({
      ...(vorhanden ?? {}),
      workspaceId: user.workspaceId,
      name: input.name.trim(),
      subject:
        (input.subject ?? '').trim() === ''
          ? null
          : (input.subject ?? '').trim(),
      body: input.body,
    });
  }

  @Mutation(() => Boolean)
  async deleteMailTemplate(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    await this.permissions.assert(
      user,
      Permission.CONTACT_WRITE,
      'Mailvorlagen zu pflegen',
    );

    const ergebnis = await this.templates.delete({
      id,
      workspaceId: user.workspaceId,
    });

    return (ergebnis.affected ?? 0) > 0;
  }
}
