import { IsIn, IsString, MaxLength } from 'class-validator';

export class ReturnTaskDto {
  @IsIn(['prev', 'start'])
  mode!: 'prev' | 'start';

  @IsString()
  @MaxLength(2000)
  comment!: string;
}
