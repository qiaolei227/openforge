import { IsString, IsNotEmpty, IsOptional, IsUUID, Matches } from 'class-validator';

export class CreateOrgDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @Matches(/^[a-zA-Z][a-zA-Z0-9_]{1,49}$/, {
    message: 'code must start with a letter, contain only letters/numbers/underscores, 2-50 chars',
  })
  code!: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;
}
