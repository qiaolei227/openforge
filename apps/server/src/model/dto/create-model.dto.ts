import { IsString, IsNotEmpty, IsOptional, IsUUID, IsIn, IsBoolean, Matches, MaxLength } from 'class-validator';

export class CreateModelDto {
  @IsUUID()
  appId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z][a-z0-9_]{1,99}$/, {
    message: 'code must be lowercase, start with letter, only letters/numbers/underscores',
  })
  code!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(['private', 'shared', 'distributed'])
  dataScope?: string;

  @IsOptional()
  @IsBoolean()
  isTree?: boolean;
}
