import {
  CustomFieldEntity,
  CustomFieldType,
} from '../custom-fields/custom-field.types';

export const DARSTELLUNGEN = ['liste', 'board', 'kalender'] as const;

export type Darstellung = (typeof DARSTELLUNGEN)[number];

export const BOARD_STANDARDFELDER: Record<CustomFieldEntity, string[]> = {
  [CustomFieldEntity.COMPANY]: ['std:industry', 'std:ownerId'],
  [CustomFieldEntity.CONTACT]: ['std:ownerId'],
  [CustomFieldEntity.DEAL]: ['std:stage', 'std:ownerId'],
  [CustomFieldEntity.TASK]: ['std:status', 'std:assigneeId'],
};

export const KALENDER_STANDARDFELDER: Record<CustomFieldEntity, string[]> = {
  [CustomFieldEntity.COMPANY]: [],
  [CustomFieldEntity.CONTACT]: [],
  [CustomFieldEntity.DEAL]: ['std:closeDate'],
  [CustomFieldEntity.TASK]: ['std:dueDate'],
};

export const EIGENER_TYP: Record<'board' | 'kalender', CustomFieldType> = {
  board: CustomFieldType.SELECT,
  kalender: CustomFieldType.DATE,
};
