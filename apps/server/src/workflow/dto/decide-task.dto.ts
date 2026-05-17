import { IsOptional, IsString, MaxLength } from 'class-validator';

export class DecideTaskDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
