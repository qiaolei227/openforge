import { IsIn, IsUUID } from 'class-validator';

export class UpsertFieldPermissionDto {
  @IsUUID() roleId!: string;
  @IsUUID() fieldId!: string;
  @IsIn(['hidden', 'readonly', 'editable'])
  access!: 'hidden' | 'readonly' | 'editable';
}

export class DeleteFieldPermissionDto {
  @IsUUID() roleId!: string;
  @IsUUID() fieldId!: string;
}
