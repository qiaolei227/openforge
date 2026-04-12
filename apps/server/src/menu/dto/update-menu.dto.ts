import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class UpdateMenuDto {
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsOptional() @IsString() @MaxLength(50)  icon?: string;
  @IsOptional() @IsInt() sortOrder?: number;
  @IsOptional() @IsBoolean() visible?: boolean;
  @IsOptional() @IsUUID() parentId?: string | null;

  // type=model (only for designer menus)
  @IsOptional() @IsUUID() targetModelId?: string;
  @IsOptional() @IsString() @MaxLength(20) targetViewType?: string;
  @IsOptional() @IsUUID() targetViewId?: string;

  // type=link (only for designer menus)
  @IsOptional() @IsString() @MaxLength(500) targetUrl?: string;
}
