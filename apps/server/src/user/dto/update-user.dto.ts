import {
  IsString,
  IsOptional,
  IsIn,
  IsEmail,
  IsArray,
  ArrayMinSize,
  IsUUID,
  ValidateIf,
} from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @ValidateIf((o) => o.email !== '')
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsIn(['active', 'disabled'])
  status?: 'active' | 'disabled';

  @IsOptional()
  @IsIn(['user', 'designer', 'admin'])
  identity?: 'user' | 'designer' | 'admin';

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  organizationIds?: string[];

  @IsOptional()
  @IsUUID()
  defaultOrgId?: string;
}
