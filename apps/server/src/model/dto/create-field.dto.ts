import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsIn, IsInt, Matches, MaxLength } from 'class-validator';

export class CreateFieldDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z][a-z0-9_]{0,99}$/, {
    message: 'columnName must be lowercase, start with letter, only letters/numbers/underscores',
  })
  columnName!: string;

  @IsString()
  @IsIn(['STRING', 'TEXT', 'RICHTEXT', 'INTEGER', 'DECIMAL', 'BOOLEAN', 'DATE', 'DATETIME', 'TIME', 'ENUM', 'MULTI_ENUM', 'AUTO_NUMBER', 'REFERENCE', 'MULTI_REFERENCE', 'USER', 'ORGANIZATION', 'FILE', 'IMAGE'])
  fieldType!: string;

  @IsOptional()
  @IsString()
  entityId?: string;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  isUnique?: boolean;

  @IsOptional()
  defaultValue?: any;

  @IsOptional()
  options?: any;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
