import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1788060000000 implements MigrationInterface {
  name = 'InitialSchema1788060000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" SERIAL NOT NULL,
        "email" character varying(255) NOT NULL,
        "password_hash" character varying(255) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "movies" (
        "id" SERIAL NOT NULL,
        "title" character varying(200) NOT NULL,
        "description" text,
        "duration_minutes" integer NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_c5b2c134e871bfd1c2fe7cc3705" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "shows" (
        "id" SERIAL NOT NULL,
        "auditorium" character varying(100) NOT NULL,
        "starts_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "movie_id" integer,
        CONSTRAINT "PK_db2b12161dbc5081c4f50025669" PRIMARY KEY ("id"),
        CONSTRAINT "FK_3156edf47a4e87e70c962ec5e8c"
          FOREIGN KEY ("movie_id") REFERENCES "movies"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "seats" (
        "id" SERIAL NOT NULL,
        "row_label" character varying(10) NOT NULL,
        "seat_number" integer NOT NULL,
        CONSTRAINT "PK_3fbc74bb4638600c506dcb777a7" PRIMARY KEY ("id"),
        CONSTRAINT "uq_seat_position" UNIQUE ("row_label", "seat_number")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "show_seats" (
        "show_id" integer NOT NULL,
        "seat_id" integer NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'AVAILABLE',
        CONSTRAINT "PK_5192dfcffc4b3fc85cf2023e90a"
          PRIMARY KEY ("show_id", "seat_id"),
        CONSTRAINT "FK_35e037aba2021dee201e247939e"
          FOREIGN KEY ("show_id") REFERENCES "shows"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_f6c97e4aa38db29e09bf360bf88"
          FOREIGN KEY ("seat_id") REFERENCES "seats"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "bookings" (
        "id" SERIAL NOT NULL,
        "user_id" integer NOT NULL,
        "show_id" integer NOT NULL,
        "status" character varying(20) NOT NULL,
        "idempotency_key" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_bee6805982cc1e248e94ce94957" PRIMARY KEY ("id"),
        CONSTRAINT "uq_booking_user_idempotency"
          UNIQUE ("user_id", "idempotency_key"),
        CONSTRAINT "FK_64cd97487c5c42806458ab5520c"
          FOREIGN KEY ("user_id") REFERENCES "users"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_a3cc9fd502f91b02c0ff8f0973f"
          FOREIGN KEY ("show_id") REFERENCES "shows"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "booking_seats" (
        "id" SERIAL NOT NULL,
        "booking_id" integer NOT NULL,
        "show_id" integer NOT NULL,
        "seat_id" integer NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_a4d929dea33a0153ba9bc253db1" PRIMARY KEY ("id"),
        CONSTRAINT "uq_booking_show_seat" UNIQUE ("show_id", "seat_id"),
        CONSTRAINT "FK_25c8b5c1e010af1cd2f699c5926"
          FOREIGN KEY ("booking_id") REFERENCES "bookings"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "booking_seats"');
    await queryRunner.query('DROP TABLE IF EXISTS "bookings"');
    await queryRunner.query('DROP TABLE IF EXISTS "show_seats"');
    await queryRunner.query('DROP TABLE IF EXISTS "seats"');
    await queryRunner.query('DROP TABLE IF EXISTS "shows"');
    await queryRunner.query('DROP TABLE IF EXISTS "movies"');
    await queryRunner.query('DROP TABLE IF EXISTS "users"');
  }
}
