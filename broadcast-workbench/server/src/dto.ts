import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpsertItemDto {
  /** 客户端生成/沿用的段 id，保存后保持稳定，便于对照 */
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsOptional()
  @IsUUID()
  materialId?: string | null;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  materialType!: string;

  @IsInt()
  @Min(1)
  durationSec!: number;

  @IsInt()
  @Min(0)
  overlapSec!: number;

  @IsOptional()
  @IsISO8601()
  hardStartAt?: string | null;

  @IsOptional()
  @IsUUID()
  sourceItemId?: string | null;
}

export class ReplaceItemsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => UpsertItemDto)
  items!: UpsertItemDto[];
}

export class IngestEventDto {
  @IsUUID()
  scheduleId!: string;

  @IsUUID()
  itemId!: string;

  @IsIn(['start', 'end'])
  type!: 'start' | 'end';

  @IsISO8601()
  occurredAt!: string;
}

export class SimOverrideDto {
  @IsUUID()
  itemId!: string;

  @IsOptional()
  @IsInt()
  extraDurationSec?: number;

  @IsOptional()
  @IsInt()
  startDelaySec?: number;
}

export class SimulateDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SimOverrideDto)
  overrides?: SimOverrideDto[];
}

export class CreateMaterialDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  type!: string;

  @IsInt()
  @Min(1)
  durationSec!: number;
}
