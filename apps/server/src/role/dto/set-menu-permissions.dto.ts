import { IsArray, IsString, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class MenuPermissionItemDto {
  @IsUUID() menuId!: string;
  @IsArray() @IsString({ each: true }) permissions!: string[];
}

export class SetMenuPermissionsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuPermissionItemDto)
  items!: MenuPermissionItemDto[];
}
