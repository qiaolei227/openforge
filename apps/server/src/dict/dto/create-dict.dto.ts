import {
  IsString,
  IsNotEmpty,
  IsOptional,
  Matches,
  MaxLength,
  ValidateNested,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';

class DictItemInput {
  @IsString()
  @IsNotEmpty()
  value!: string;

  @IsString()
  @IsNotEmpty()
  label!: string;

  @IsOptional()
  @IsString()
  labelEn?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  sortOrder?: number;
}

export class CreateDictDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-zA-Z][a-zA-Z0-9_-]{0,99}$/)
  code!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DictItemInput)
  items?: DictItemInput[];
}
