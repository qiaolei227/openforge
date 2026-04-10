import { IsString, IsOptional, MaxLength } from 'class-validator';

export class UpdateDictDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
