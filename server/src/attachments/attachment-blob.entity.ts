import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm';

import { AttachmentEntity } from './attachment.entity';

@Entity({ name: 'attachment_blobs' })
export class AttachmentBlobEntity {
  @PrimaryColumn({ type: 'uuid' })
  attachmentId: string;

  @OneToOne(() => AttachmentEntity, (attachment) => attachment.blob, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'attachmentId' })
  attachment: AttachmentEntity;

  @Column({ type: 'bytea' })
  bytes: Buffer;
}
