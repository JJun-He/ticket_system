const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { after, before, beforeEach, test } = require('node:test');

process.env.NODE_ENV = 'test';
process.env.PORT = '3000';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '5434';
process.env.DB_NAME = 'ticket_system_test';
process.env.DB_USER = 'ticket_test_user';
process.env.DB_PASSWORD = 'ticket_test_password';
process.env.JWT_SECRET = 'ticket-system-e2e-test-secret';
process.env.ENABLE_SWAGGER = 'false';
process.env.THROTTLE_TTL_MS = '60000';
process.env.THROTTLE_LIMIT = '1000';

const { ValidationPipe } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { DataSource } = require('typeorm');
const { AppModule } = require('../dist/app.module.js');
const { AppDataSource } = require('../dist/database/data-source.js');

let app;
let baseUrl;
let dataSource;

before(async () => {
  await AppDataSource.initialize();
  await AppDataSource.runMigrations();
  await AppDataSource.destroy();

  app = await NestFactory.create(AppModule, { logger: ['error'] });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(0, '127.0.0.1');

  const address = app.getHttpServer().address();
  assert.equal(typeof address, 'object');

  baseUrl = `http://127.0.0.1:${address.port}`;
  dataSource = app.get(DataSource);
});

after(async () => {
  await app?.close();
});

beforeEach(async () => {
  await dataSource.query(`
    TRUNCATE TABLE
      booking_seats,
      bookings,
      show_seats,
      seats,
      shows,
      movies,
      users
    RESTART IDENTITY CASCADE
  `);
});

test('회원가입부터 예매 내역 조회까지 필수 흐름이 동작한다', async () => {
  const seeded = await seedShow({ seatCount: 2 });
  const accessToken = await register('journey@example.com');

  const me = await apiRequest({ method: 'GET', path: '/auth/me', accessToken });
  assert.equal(me.status, 200);
  assert.equal(me.body.email, 'journey@example.com');

  const loginResponse = await apiRequest({
    method: 'POST',
    path: '/auth/login',
    body: {
      email: 'JOURNEY@example.com',
      password: 'test-password-123',
    },
  });
  assert.equal(loginResponse.status, 200);
  assert.equal(typeof loginResponse.body.accessToken, 'string');

  const loginMe = await apiRequest({
    method: 'GET',
    path: '/auth/me',
    accessToken: loginResponse.body.accessToken,
  });
  assert.equal(loginMe.status, 200);
  assert.equal(loginMe.body.id, me.body.id);
  assert.equal(loginMe.body.email, 'journey@example.com');

  const movies = await apiRequest({ method: 'GET', path: '/movies' });
  assert.equal(movies.status, 200);
  assert.equal(movies.body[0].id, seeded.movieId);

  const shows = await apiRequest({
    method: 'GET',
    path: `/movies/${seeded.movieId}/shows`,
  });
  assert.equal(shows.status, 200);
  assert.equal(shows.body[0].id, seeded.showId);

  const seats = await apiRequest({
    method: 'GET',
    path: `/shows/${seeded.showId}/seats`,
  });
  assert.equal(seats.status, 200);
  assert.equal(seats.body.length, 2);

  const booking = await apiRequest({
    method: 'POST',
    path: '/bookings',
    accessToken,
    idempotencyKey: randomUUID(),
    body: { showId: seeded.showId, seatIds: [seeded.seatIds[0]] },
  });
  assert.equal(booking.status, 201);

  const history = await apiRequest({
    method: 'GET',
    path: '/bookings',
    accessToken,
  });
  assert.equal(history.status, 200);
  assert.equal(history.body.length, 1);
  assert.equal(history.body[0].movie.title, '테스트 영화');
  assert.equal(history.body[0].show.auditorium, '테스트관');
  assert.deepEqual(history.body[0].seats, [
    { id: seeded.seatIds[0], rowLabel: 'A', seatNumber: 1 },
  ]);
});

test('같은 이메일 회원가입이 동시에 도착해도 한 요청은 409를 반환한다', async () => {
  const request = {
    method: 'POST',
    path: '/auth/register',
    body: {
      email: 'duplicate@example.com',
      password: 'test-password-123',
    },
  };
  const [first, second] = await Promise.all([
    apiRequest(request),
    apiRequest(request),
  ]);

  assert.deepEqual(
    [first.status, second.status].sort((left, right) => left - right),
    [201, 409],
  );
  const conflict = [first, second].find((response) => response.status === 409);
  assert.equal(conflict.body.code, 'AUTH_EMAIL_ALREADY_EXISTS');
});

test('잘못된 JWT로 보호된 API를 호출하면 401을 반환한다', async () => {
  const response = await apiRequest({
    method: 'GET',
    path: '/bookings',
    accessToken: 'invalid-token',
  });
  assert.equal(response.status, 401);
  assert.equal(response.body.code, 'AUTH_TOKEN_INVALID');
});

test('상영 회차에 없는 좌석은 예매할 수 없다', async () => {
  const { showId } = await seedShow();
  const accessToken = await register('missing-seat@example.com');
  const response = await apiRequest({
    method: 'POST',
    path: '/bookings',
    accessToken,
    idempotencyKey: randomUUID(),
    body: { showId, seatIds: [999_999] },
  });
  assert.equal(response.status, 404);
  assert.equal(response.body.code, 'BOOKING_SEAT_NOT_FOUND');
});

test('이미 시작된 상영은 예매할 수 없다', async () => {
  const { showId, seatIds } = await seedShow({
    startsAt: new Date(Date.now() - 60_000),
  });
  const accessToken = await register('past-show@example.com');
  const response = await apiRequest({
    method: 'POST',
    path: '/bookings',
    accessToken,
    idempotencyKey: randomUUID(),
    body: { showId, seatIds },
  });
  assert.equal(response.status, 409);
  assert.equal(response.body.code, 'BOOKING_SHOW_ALREADY_STARTED');
});

test('좌석 잠금을 기다리는 동안 상영이 시작되면 예매할 수 없다', async () => {
  const accessToken = await register('lock-wait-start@example.com');
  const startsAt = new Date(Date.now() + 2_000);
  const { showId, seatIds } = await seedShow({ startsAt });
  const lockRunner = dataSource.createQueryRunner();
  let bookingRequest;

  await lockRunner.connect();
  await lockRunner.startTransaction();

  try {
    await lockRunner.query(
      `
        SELECT seat_id
        FROM show_seats
        WHERE show_id = $1 AND seat_id = $2
        FOR UPDATE
      `,
      [showId, seatIds[0]],
    );

    bookingRequest = apiRequest({
      method: 'POST',
      path: '/bookings',
      accessToken,
      idempotencyKey: randomUUID(),
      body: { showId, seatIds },
    });

    await waitForBookingLock();
    await waitUntilShowStarts(startsAt);
    await lockRunner.commitTransaction();

    const response = await bookingRequest;
    assert.equal(response.status, 409);
    assert.equal(response.body.code, 'BOOKING_SHOW_ALREADY_STARTED');

    const [{ count }] = await dataSource.query(
      'SELECT COUNT(*)::int AS count FROM bookings',
    );
    assert.equal(Number(count), 0);
  } finally {
    if (lockRunner.isTransactionActive) {
      await lockRunner.rollbackTransaction();
    }
    await lockRunner.release();
    await bookingRequest;
  }
});

test('동일한 멱등키를 다른 예매 요청에 재사용하면 409를 반환한다', async () => {
  const { showId, seatIds } = await seedShow({ seatCount: 2 });
  const accessToken = await register('key-reuse@example.com');
  const idempotencyKey = randomUUID();

  const first = await apiRequest({
    method: 'POST',
    path: '/bookings',
    accessToken,
    idempotencyKey,
    body: { showId, seatIds: [seatIds[0]] },
  });
  const second = await apiRequest({
    method: 'POST',
    path: '/bookings',
    accessToken,
    idempotencyKey,
    body: { showId, seatIds: [seatIds[1]] },
  });

  assert.equal(first.status, 201);
  assert.equal(second.status, 409);
  assert.equal(second.body.code, 'BOOKING_IDEMPOTENCY_KEY_REUSED');
});

test('동일한 멱등 요청이 동시에 도착해도 예매는 한 건만 생성된다', async () => {
  const { showId, seatIds } = await seedShow();
  const accessToken = await register('idempotency@example.com');
  const idempotencyKey = randomUUID();
  const request = {
    method: 'POST',
    path: '/bookings',
    accessToken,
    idempotencyKey,
    body: { showId, seatIds },
  };
  const [first, second] = await Promise.all([
    apiRequest(request),
    apiRequest(request),
  ]);

  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.equal(first.body.id, second.body.id);

  const [{ count }] = await dataSource.query(
    'SELECT COUNT(*)::int AS count FROM bookings',
  );
  assert.equal(Number(count), 1);
});

test('서로 다른 사용자가 같은 좌석을 동시에 예매하면 한 명만 성공한다', async () => {
  const { showId, seatIds } = await seedShow();
  const [firstToken, secondToken] = await Promise.all([
    register('first-racer@example.com'),
    register('second-racer@example.com'),
  ]);
  const [first, second] = await Promise.all([
    apiRequest({
      method: 'POST',
      path: '/bookings',
      accessToken: firstToken,
      idempotencyKey: randomUUID(),
      body: { showId, seatIds },
    }),
    apiRequest({
      method: 'POST',
      path: '/bookings',
      accessToken: secondToken,
      idempotencyKey: randomUUID(),
      body: { showId, seatIds },
    }),
  ]);

  assert.deepEqual(
    [first.status, second.status].sort((left, right) => left - right),
    [201, 409],
  );
  const conflict = [first, second].find((response) => response.status === 409);
  assert.equal(conflict.body.code, 'BOOKING_SEAT_ALREADY_BOOKED');
  assert.deepEqual(conflict.body.seatIds, seatIds);

  const [{ booking_count: bookingCount }] = await dataSource.query(
    `
      SELECT COUNT(*)::int AS booking_count
      FROM booking_seats
      WHERE show_id = $1 AND seat_id = $2
    `,
    [showId, seatIds[0]],
  );
  assert.equal(Number(bookingCount), 1);

  const [showSeat] = await dataSource.query(
    `
      SELECT status
      FROM show_seats
      WHERE show_id = $1 AND seat_id = $2
    `,
    [showId, seatIds[0]],
  );
  assert.equal(showSeat.status, 'SOLD');
});

test('DB 고유 제약이 중복 좌석을 차단해도 안정적인 409를 반환한다', async () => {
  const { showId, seatIds } = await seedShow();
  const [firstToken, secondToken] = await Promise.all([
    register('constraint-first@example.com'),
    register('constraint-second@example.com'),
  ]);

  const first = await apiRequest({
    method: 'POST',
    path: '/bookings',
    accessToken: firstToken,
    idempotencyKey: randomUUID(),
    body: { showId, seatIds },
  });
  assert.equal(first.status, 201);

  // 애플리케이션 외부 변경으로 상태가 어긋나도 DB 고유 제약이 최종 방어선이 된다.
  await dataSource.query(
    `
      UPDATE show_seats
      SET status = 'AVAILABLE'
      WHERE show_id = $1 AND seat_id = $2
    `,
    [showId, seatIds[0]],
  );

  const second = await apiRequest({
    method: 'POST',
    path: '/bookings',
    accessToken: secondToken,
    idempotencyKey: randomUUID(),
    body: { showId, seatIds },
  });

  assert.equal(second.status, 409);
  assert.equal(second.body.code, 'BOOKING_SEAT_ALREADY_BOOKED');
  assert.deepEqual(second.body.seatIds, seatIds);

  const [{ count }] = await dataSource.query(
    'SELECT COUNT(*)::int AS count FROM bookings',
  );
  assert.equal(Number(count), 1);
});

test('예매 처리 중 DB 오류가 발생하면 모든 변경을 rollback한다', async () => {
  const { showId, seatIds } = await seedShow();
  const accessToken = await register('rollback@example.com');

  await dataSource.query(`
    CREATE FUNCTION fail_show_seat_update()
    RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'forced booking rollback test';
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER trg_fail_show_seat_update
    BEFORE UPDATE OF status ON show_seats
    FOR EACH ROW
    EXECUTE FUNCTION fail_show_seat_update();
  `);

  try {
    const response = await apiRequest({
      method: 'POST',
      path: '/bookings',
      accessToken,
      idempotencyKey: randomUUID(),
      body: { showId, seatIds },
    });

    assert.equal(response.status, 500);

    const [counts] = await dataSource.query(`
      SELECT
        (SELECT COUNT(*)::int FROM bookings) AS bookings,
        (SELECT COUNT(*)::int FROM booking_seats) AS booking_seats
    `);
    assert.equal(Number(counts.bookings), 0);
    assert.equal(Number(counts.booking_seats), 0);

    const [showSeat] = await dataSource.query(
      `
        SELECT status
        FROM show_seats
        WHERE show_id = $1 AND seat_id = $2
      `,
      [showId, seatIds[0]],
    );
    assert.equal(showSeat.status, 'AVAILABLE');
  } finally {
    await dataSource.query(`
      DROP TRIGGER IF EXISTS trg_fail_show_seat_update ON show_seats;
      DROP FUNCTION IF EXISTS fail_show_seat_update();
    `);
  }
});

test('서로 다른 Nest 인스턴스에서도 같은 좌석은 한 번만 예매된다', async () => {
  const { showId, seatIds } = await seedShow();
  const [firstToken, secondToken] = await Promise.all([
    register('instance-a@example.com'),
    register('instance-b@example.com'),
  ]);
  let secondApp;

  try {
    secondApp = await NestFactory.create(AppModule, { logger: ['error'] });
    secondApp.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await secondApp.listen(0, '127.0.0.1');

    const secondAddress = secondApp.getHttpServer().address();
    assert.equal(typeof secondAddress, 'object');
    const secondBaseUrl = `http://127.0.0.1:${secondAddress.port}`;

    const [first, second] = await Promise.all([
      apiRequest({
        method: 'POST',
        path: '/bookings',
        serverUrl: baseUrl,
        accessToken: firstToken,
        idempotencyKey: randomUUID(),
        body: { showId, seatIds },
      }),
      apiRequest({
        method: 'POST',
        path: '/bookings',
        serverUrl: secondBaseUrl,
        accessToken: secondToken,
        idempotencyKey: randomUUID(),
        body: { showId, seatIds },
      }),
    ]);

    assert.deepEqual(
      [first.status, second.status].sort((left, right) => left - right),
      [201, 409],
    );

    const [{ count }] = await dataSource.query(
      `
        SELECT COUNT(*)::int AS count
        FROM booking_seats
        WHERE show_id = $1 AND seat_id = $2
      `,
      [showId, seatIds[0]],
    );
    assert.equal(Number(count), 1);
  } finally {
    await secondApp?.close();
  }
});

async function seedShow({
  startsAt = new Date(Date.now() + 24 * 60 * 60 * 1_000),
  seatCount = 1,
} = {}) {
  const [movie] = await dataSource.query(`
    INSERT INTO movies (title, description, duration_minutes)
    VALUES ('테스트 영화', 'E2E 테스트용 영화', 120)
    RETURNING id
  `);
  const [show] = await dataSource.query(
    `
      INSERT INTO shows (movie_id, auditorium, starts_at)
      VALUES ($1, '테스트관', $2)
      RETURNING id
    `,
    [movie.id, startsAt],
  );
  const seatIds = [];

  for (let seatNumber = 1; seatNumber <= seatCount; seatNumber += 1) {
    const [seat] = await dataSource.query(
      `
        INSERT INTO seats (row_label, seat_number)
        VALUES ('A', $1)
        RETURNING id
      `,
      [seatNumber],
    );
    await dataSource.query(
      `
        INSERT INTO show_seats (show_id, seat_id, status)
        VALUES ($1, $2, 'AVAILABLE')
      `,
      [show.id, seat.id],
    );
    seatIds.push(seat.id);
  }

  return { movieId: movie.id, showId: show.id, seatIds };
}

async function register(email) {
  const response = await apiRequest({
    method: 'POST',
    path: '/auth/register',
    body: { email, password: 'test-password-123' },
  });
  assert.equal(response.status, 201);
  return response.body.accessToken;
}

async function waitForBookingLock() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const [{ waiting }] = await dataSource.query(`
      SELECT EXISTS (
        SELECT 1
        FROM pg_stat_activity
        WHERE datname = current_database()
          AND wait_event_type = 'Lock'
          AND query LIKE '%FROM show_seats%'
      ) AS waiting
    `);

    if (waiting) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  throw new Error('예매 요청이 좌석 잠금을 기다리는 상태가 되지 않았습니다.');
}

async function waitUntilShowStarts(startsAt) {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    const [{ started }] = await dataSource.query(
      'SELECT $1::timestamptz <= clock_timestamp() AS started',
      [startsAt],
    );

    if (started) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  throw new Error('테스트 제한 시간 안에 상영 시작 시각이 지나지 않았습니다.');
}

async function apiRequest({
  method,
  path,
  body,
  accessToken,
  idempotencyKey,
  serverUrl = baseUrl,
}) {
  const headers = {};

  if (body) headers['content-type'] = 'application/json';
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;

  const response = await fetch(`${serverUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const responseText = await response.text();

  return {
    status: response.status,
    body: responseText ? JSON.parse(responseText) : null,
  };
}
