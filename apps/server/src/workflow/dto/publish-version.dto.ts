import { IsObject } from 'class-validator';

export class PublishVersionDto {
  @IsObject()
  definition!: any;
}
