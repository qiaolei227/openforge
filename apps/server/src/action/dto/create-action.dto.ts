import { IsString, IsOptional, IsInt, IsObject, IsIn } from 'class-validator';

export class CreateActionDto {
  @IsString()
  code!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsString()
  @IsIn(['builtin', 'openUrl', 'callApi', 'script'])
  actionType!: string;

  @IsOptional()
  @IsString()
  @IsIn(['button', 'split', 'menu'])
  displayType?: string;

  @IsOptional()
  @IsString()
  @IsIn(['list', 'detail', 'both'])
  position?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsObject()
  config?: Record<string, any>;

  @IsOptional()
  @IsObject()
  visibility?: Record<string, any>;
}

export class UpdateActionDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsString()
  parentId?: string | null;

  @IsOptional()
  @IsString()
  @IsIn(['button', 'split', 'menu'])
  displayType?: string;

  @IsOptional()
  @IsString()
  @IsIn(['list', 'detail', 'both'])
  position?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsObject()
  config?: Record<string, any>;

  @IsOptional()
  @IsObject()
  visibility?: Record<string, any>;
}
