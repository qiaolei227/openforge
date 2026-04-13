import { IsString, IsNotEmpty, IsOptional, IsUUID, MinLength, IsEmail, ValidateIf, IsIn } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  username!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsString()
  @IsNotEmpty()
  displayName!: string;

  @IsOptional()
  @ValidateIf((o) => o.email !== '')
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsUUID()
  orgId!: string;

  @IsOptional()
  @IsIn(['user', 'designer', 'admin'])
  identity?: string;
}
