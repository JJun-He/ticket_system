import { MigrationInterface, QueryRunner } from 'typeorm';

export class TuneBookingQueries1788067200000 implements MigrationInterface {
  name = 'TuneBookingQueries1788067200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX "idx_booking_seats_booking_id"
      ON "booking_seats" ("booking_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_booking_seats_booking_id"`);
  }
}
