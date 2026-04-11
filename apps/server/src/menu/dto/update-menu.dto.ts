import { IsBoolean, IsInt, IsObject, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class UpdateMenuDto {
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsOptional() @IsString() @MaxLength(100) nameEn?: string;
  @IsOptional() @IsString() @MaxLength(50)  icon?: string;
  @IsOptional() @IsInt() sortOrder?: number;
  @IsOptional() @IsBoolean() visible?: boolean;
  @IsOptional() @IsUUID() parentId?: string | null;
  @IsOptional() @IsString() targetAppCode?: string;
  @IsOptional() @IsString() targetModelCode?: string;
  @IsOptional() @IsUUID() targetViewId?: string;
  @IsOptional() @IsObject() targetFilterPreset?: Record<string, unknown>;
  @IsOptional() @IsString() targetUrl?: string;
}
