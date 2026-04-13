import { IsString, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

export class CreateOrgDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;
}
