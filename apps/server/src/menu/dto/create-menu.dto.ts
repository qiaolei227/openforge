import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateMenuDto {
  @IsUUID() appId!: string;

  @IsOptional() @IsUUID() parentId?: string;

  @IsIn(['group', 'model', 'link', 'divider'])
  type!: 'group' | 'model' | 'link' | 'divider';

  @IsString() @MaxLength(100) name!: string;

  @IsOptional() @IsString() @MaxLength(50) icon?: string;

  // type=model
  @IsOptional() @IsUUID() targetModelId?: string;
  @IsOptional() @IsString() @MaxLength(20) targetViewType?: string;
  @IsOptional() @IsUUID() targetViewId?: string;

  // type=link
  @IsOptional() @IsString() @MaxLength(500) targetUrl?: string;
}
