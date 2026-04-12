import { IsIn, IsObject, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateMenuDto {
  @IsOptional() @IsUUID() parentId?: string;

  @IsIn(['group', 'model', 'link', 'divider'])
  type!: 'group' | 'model' | 'link' | 'divider';

  @IsString() @MaxLength(100) name!: string;

  @IsOptional() @IsString() @MaxLength(50) icon?: string;

  // type=model
  @IsOptional() @IsString() @MaxLength(50)  targetAppCode?: string;
  @IsOptional() @IsString() @MaxLength(100) targetModelCode?: string;
  @IsOptional() @IsUUID() targetViewId?: string;
  @IsOptional() @IsObject() targetFilterPreset?: Record<string, unknown>;

  // type=link
  @IsOptional() @IsString() @MaxLength(500) targetUrl?: string;
}
