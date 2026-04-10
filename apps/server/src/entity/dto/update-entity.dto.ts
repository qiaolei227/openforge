import { IsString, IsOptional, MaxLength } from 'class-validator';

export class UpdateEntityDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;
}
