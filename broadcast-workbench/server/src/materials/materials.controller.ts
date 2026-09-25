import { Body, Controller, Get, Post } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Material } from '../entities/material.entity';
import { CreateMaterialDto } from '../dto';

@Controller('materials')
export class MaterialsController {
  constructor(@InjectRepository(Material) private readonly materials: Repository<Material>) {}

  @Get()
  list() {
    return this.materials.find({ order: { createdAt: 'ASC' } });
  }

  @Post()
  create(@Body() dto: CreateMaterialDto) {
    return this.materials.save(
      this.materials.create({ ...dto, type: dto.type as Material['type'] }),
    );
  }
}
