import { IsArray, IsUUID } from 'class-validator';

export class SetUserRolesDto {
  @IsArray()
  @IsUUID('4', { each: true })
  roleIds!: string[];
}
