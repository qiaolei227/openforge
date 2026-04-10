import { IsString, IsOptional, IsIn } from 'class-validator';

export class UpdateOrgDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(['active', 'disabled'])
  status?: 'active' | 'disabled';
}
