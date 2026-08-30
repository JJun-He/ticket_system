import { MigrationInterface, QueryRunner } from 'typeorm';

export class HardenBookingSchema1788063600000 implements MigrationInterface {
  name = 'HardenBookingSchema1788063600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "shows"
      ALTER COLUMN "movie_id" SET NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_shows_movie_starts_at"
      ON "shows" ("movie_id", "starts_at")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_bookings_user_created_at"
      ON "bookings" ("user_id", "created_at")
    `);
    await queryRunner.query(`
      ALTER TABLE "show_seats"
      ADD CONSTRAINT "chk_show_seats_status"
      CHECK ("status" IN ('AVAILABLE', 'SOLD'))
    `);
    await queryRunner.query(`
      ALTER TABLE "bookings"
      ADD CONSTRAINT "chk_bookings_status"
      CHECK ("status" IN ('CONFIRMED'))
    `);
    await queryRunner.query(`
      ALTER TABLE "booking_seats"
      ADD CONSTRAINT "FK_d8b3727c4ceb3aa34bdf05c98c0"
      FOREIGN KEY ("show_id", "seat_id")
      REFERENCES "show_seats"("show_id", "seat_id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "booking_seats"
      DROP CONSTRAINT "FK_d8b3727c4ceb3aa34bdf05c98c0"
    `);
    await queryRunner.query(`
      ALTER TABLE "bookings"
      DROP CONSTRAINT "chk_bookings_status"
    `);
    await queryRunner.query(`
      ALTER TABLE "show_seats"
      DROP CONSTRAINT "chk_show_seats_status"
    `);
    await queryRunner.query(`DROP INDEX "idx_bookings_user_created_at"`);
    await queryRunner.query(`DROP INDEX "idx_shows_movie_starts_at"`);
    await queryRunner.query(`
      ALTER TABLE "shows"
      ALTER COLUMN "movie_id" DROP NOT NULL
    `);
  }
}
