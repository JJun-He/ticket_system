# Ticket System

PostgreSQL 트랜잭션과 행 잠금을 이용해 동시 요청에서도 좌석 중복 예매를 방지하는 영화 티켓 예매 API입니다.

AI Agent 활용 범위와 검증 방식은 [AI_USAGE.md](./AI_USAGE.md)에 별도로 기록했습니다.

## 기술 스택

- Node.js 22, NestJS 11, TypeScript
- PostgreSQL 16, TypeORM
- JWT, Argon2
- Docker Compose
- Node.js test runner 기반 E2E 테스트
- ESLint, Prettier, GitHub Actions CI

## 로컬 실행

Node.js 22와 Docker가 필요합니다.

```bash
nvm use
cp .env.example .env
npm ci
npm run db:up
npm run migration:run
npm run db:seed
npm run start:dev
```

기본 API 주소는 `http://localhost:3001`이며 Swagger 문서는 `http://localhost:3001/docs`에서 확인할 수 있습니다.

종료할 때는 다음 명령을 사용합니다.

```bash
npm run db:down
```

## Docker로 전체 실행

앱, migration, PostgreSQL을 한 번에 실행할 수 있습니다.

```bash
cp .env.example .env
```

`.env`의 `JWT_SECRET`을 32자 이상의 임의 문자열로 변경한 뒤 앱을 실행합니다.

```bash
npm run docker:up
npm run db:seed
```

Docker 실행 시 API와 Swagger 주소는 각각 `http://localhost:3000`, `http://localhost:3000/docs`입니다. migration 컨테이너가 성공한 뒤에만 앱 컨테이너가 시작됩니다.

```bash
npm run docker:down
```

### 주요 환경변수

| 변수                                 | 기본값          | 목적                                     |
| ------------------------------------ | --------------- | ---------------------------------------- |
| `DB_POOL_MAX`                        | `10`            | 인스턴스당 최대 DB 연결 수               |
| `DB_CONNECTION_TIMEOUT_MS`           | `3000`          | DB 연결 획득 대기 제한                   |
| `DB_IDLE_TIMEOUT_MS`                 | `10000`         | 풀의 유휴 연결 유지 시간                 |
| `DB_STATEMENT_TIMEOUT_MS`            | `5000`          | SQL 한 문장의 실행 제한                  |
| `DB_IDLE_IN_TRANSACTION_TIMEOUT_MS`  | `10000`         | 열린 채 방치된 트랜잭션의 세션 종료 제한 |
| `DB_APPLICATION_NAME`                | `ticket-system` | `pg_stat_activity`에서 식별할 연결 이름  |
| `THROTTLE_TTL_MS` / `THROTTLE_LIMIT` | `60000` / `100` | 전역 요청 제한 구간과 허용 횟수          |

## 주요 API

| Method | Path                     | 설명             | 인증                        |
| ------ | ------------------------ | ---------------- | --------------------------- |
| POST   | `/auth/register`         | 회원가입         | 없음                        |
| POST   | `/auth/login`            | 로그인           | 없음                        |
| GET    | `/auth/me`               | 현재 사용자 조회 | Bearer JWT                  |
| GET    | `/movies`                | 영화 목록        | 없음                        |
| GET    | `/movies/:movieId/shows` | 영화별 상영 시간 | 없음                        |
| GET    | `/shows/:showId/seats`   | 상영별 좌석 상태 | 없음                        |
| POST   | `/bookings`              | 좌석 예매        | Bearer JWT, Idempotency-Key |
| GET    | `/bookings`              | 내 예매 내역     | Bearer JWT                  |
| GET    | `/health`                | 프로세스 상태    | 없음                        |
| GET    | `/health/db`             | DB 연결 상태     | 없음                        |

예매 요청의 `Idempotency-Key` 헤더에는 UUID를 전달해야 합니다.

```bash
curl -X POST http://localhost:3001/bookings \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN' \
  -H 'Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000' \
  -H 'Content-Type: application/json' \
  -d '{"showId":1,"seatIds":[1,2]}'
```

애플리케이션에서 정의한 오류는 HTTP 상태와 별개로 클라이언트가 안정적으로 식별할 수 있는 `code`를 반환합니다.

```json
{
  "statusCode": 409,
  "code": "BOOKING_SEAT_ALREADY_BOOKED",
  "message": "이미 예매된 좌석이 포함되어 있습니다.",
  "seatIds": [1, 2]
}
```

## 프로젝트 구조

```text
src/
  auth/       회원가입, 로그인, JWT 인증
  movies/     영화 목록
  shows/      상영 시간과 좌석 상태
  bookings/   예매 트랜잭션과 예매 내역
  common/     공통 예외·에러 코드와 PostgreSQL 오류 판별
  config/     실행 환경 검증
  database/   TypeORM DataSource와 migration
test/         실제 PostgreSQL 기반 E2E 테스트
db/           로컬 확인용 seed SQL
.github/      빌드, E2E, 보안 감사 CI
```

## 설계 의도

### 좌석 예매 정합성

예매 트랜잭션은 선택한 `show_seats` 행을 좌석 ID 순서대로 `SELECT ... FOR UPDATE` 하여 잠급니다. 같은 좌석을 동시에 요청하면 먼저 잠금을 획득한 요청만 성공하고, 나머지는 이미 판매된 좌석으로 처리됩니다.

애플리케이션 인스턴스의 메모리가 아닌 PostgreSQL을 정합성의 기준으로 사용하므로 여러 NestJS 인스턴스가 동일 DB를 사용해도 같은 보장이 유지됩니다. `(show_id, seat_id)` 고유 제약은 애플리케이션 로직 오류에 대한 최종 방어선입니다.

상영 시작 여부도 애플리케이션 서버의 시계가 아닌 PostgreSQL `clock_timestamp()`로 판단합니다. 좌석 잠금을 기다린 뒤 한 번 더 확인해, 경합 대기 중 상영이 시작된 요청도 예매되지 않도록 했습니다.

### 멱등성

사용자와 `Idempotency-Key` 조합에 고유 제약을 적용했습니다. 네트워크 재시도나 동일 요청이 동시에 도착해도 예매는 한 건만 생성되며, 같은 키를 다른 요청에 재사용하면 `409 Conflict`를 반환합니다.

### 기술 선택

현재 요구 규모에서는 모듈형 모놀리스와 PostgreSQL이 가장 단순하고 신뢰할 수 있다고 판단했습니다. 이 프로젝트에서 말하는 실서비스 수준은 인프라의 개수가 아니라, 핵심 데이터의 정합성·실패 시 원자성·재시도 안전성·운영 가능한 설정·자동 검증을 갖추는 것입니다.

### 도입하지 않은 기술과 판단 근거

아래 기술을 몰라서 제외한 것이 아니라, 현재 요구사항에서 얻는 이점보다 새로 생기는 실패 모드와 운영 비용이 더 크다고 판단했습니다. 대신 실제 병목이나 제품 요구가 생겼을 때의 도입 기준을 함께 정의했습니다.

| 후보 기술·기능                   | 현재 제외한 이유                                                                                                                                                 | 도입하면 함께 해결해야 하는 문제                                                                                                                         | 도입을 다시 검토할 조건                                                                   |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Redis 분산 락                    | 좌석 상태와 예매 결과가 모두 PostgreSQL에 있으므로 DB 트랜잭션과 행 잠금만으로 원자적으로 보호할 수 있습니다. Redis를 추가해도 DB 고유 제약은 여전히 필요합니다. | Redis와 DB 사이의 이중 상태, 락 만료 중 작업 지속, 프로세스 중단, 네트워크 분할, stale lock holder를 막는 fencing token, Redis 장애 대응이 필요합니다.   | 하나의 DB 트랜잭션으로 묶을 수 없는 외부 자원이나 여러 저장소를 함께 조정해야 할 때       |
| Kafka·RabbitMQ                   | 현재 요청에는 알림·정산·통계처럼 응답과 분리할 비동기 후속 작업이 없습니다. 동기 예매 정합성을 브로커가 대신 해결하지도 않습니다.                                | 최소 한 번 전달에 따른 중복 처리, retry/backoff, DLQ, 이벤트 스키마 버전, 순서 보장 범위와 DB-브로커 이중 쓰기를 막는 transactional outbox가 필요합니다. | 예매 완료 후 알림·분석·외부 연동이 늘어나고 eventual consistency를 허용할 수 있을 때      |
| 마이크로서비스                   | 현재 도메인과 코드 규모에서는 모듈 경계만으로 책임을 분리할 수 있고 독립 배포의 이익이 없습니다.                                                                 | 네트워크 실패, API 계약 버전, 분산 트랜잭션·보상 처리, 서비스 간 인증, 통합 관측성과 배포 파이프라인이 필요합니다.                                       | 팀 소유권과 배포 주기가 실제로 분리되고, 특정 도메인만 독립 확장해야 할 때                |
| Kubernetes                       | 현재 실행 단위는 NestJS API 하나와 PostgreSQL 하나이며 Docker Compose로 재현 가능한 실행 환경을 제공합니다.                                                      | 클러스터, ingress, secret, probe, resource limit, autoscaling, 배포 전략과 장애 시 운영 절차를 관리해야 합니다.                                          | 여러 서비스와 replica를 지속 운영하며 자동 확장·무중단 배포·자가 복구가 실제 요구가 될 때 |
| Elasticsearch                    | 과제 범위에는 복잡한 전문 검색이 없고 현재 조회는 PostgreSQL 인덱스로 처리할 수 있습니다.                                                                        | DB와 검색 색인의 동기화, 누락·중복 이벤트, 재색인, 매핑 변경, 별도 클러스터 백업과 모니터링이 필요합니다.                                                | PostgreSQL full-text search로 충족할 수 없는 검색 품질이나 규모가 측정될 때               |
| Prometheus·Grafana·OpenTelemetry | 현재는 배포 대상과 SLO가 정해지지 않아 수집 백엔드를 추가해도 의미 있는 경보 기준을 만들 수 없습니다. 대신 health check, request ID와 구조화 로그를 제공합니다.  | 메트릭 cardinality, trace sampling, 보관 기간, 대시보드, alert threshold와 수집 시스템 자체의 운영이 필요합니다.                                         | 실제 운영 환경에서 SLO를 정하고 여러 인스턴스·서비스의 병목과 오류 전파를 추적해야 할 때  |
| 결제·좌석 임시 점유·취소·환불    | 과제의 필수 사용자 흐름을 넘어 별도의 제품 정책과 상태 머신을 요구합니다. 단순 CRUD로 덧붙이면 오히려 비현실적인 구현이 됩니다.                                  | 점유 만료 작업, 결제 webhook 멱등성, 결제 성공과 DB 실패 사이의 보상, 취소 가능 시간, 환불 실패·재시도와 감사 이력을 설계해야 합니다.                    | 결제 사업자와 취소·환불·점유 정책이 요구사항으로 명시될 때                                |

이 선택은 확장성을 포기한 것이 아닙니다. 현재 API는 stateless이고 정합성 규칙은 DB에 있으므로 애플리케이션 인스턴스는 수평 확장할 수 있습니다. 기능 또는 트래픽 요구가 확인되면 위 조건에 맞춰 필요한 구성 요소만 추가할 수 있습니다.

### DB 연결과 실패 제한

DB 연결 풀은 기본 10개로 제한하고, 연결 획득 3초·유휴 연결 10초·SQL 실행 5초의 timeout을 적용했습니다. 열린 채 쿼리 없이 방치된 트랜잭션은 10초 후 종료하며, 예매 트랜잭션의 행 잠금은 별도로 3초까지만 기다립니다. 모든 값은 환경변수로 조정할 수 있어 요청이 DB 연결이나 잠금을 무기한 점유하지 않도록 했습니다.

예매 내역 조회가 `booking_seats.booking_id`로 조인되는 흐름에 맞춰 별도 인덱스를 추가했습니다. 외래 키 제약 자체에 의존하지 않고 실제 조회 조건을 기준으로 인덱스를 관리합니다.

## 확장 전략

현재 API는 서버 내부에 세션이나 좌석 상태를 저장하지 않는 stateless 구조입니다. 여러 NestJS 인스턴스가 동일 PostgreSQL을 사용해도 행 잠금과 DB 제약이 동일하게 적용됩니다.

```text
Client / Load Balancer
        │
        ├── NestJS instance A ──┐
        └── NestJS instance B ──┼── PostgreSQL
                               │   row lock + constraints
```

확장은 예상 트래픽이 아니라 관측된 병목을 기준으로 단계적으로 진행합니다.

| 관측된 문제                 | 우선 대응                                     | 도입 조건                                           |
| --------------------------- | --------------------------------------------- | --------------------------------------------------- |
| 일반 조회 증가              | 쿼리·인덱스 최적화, connection pool 조정      | DB CPU·connection 대기 증가                         |
| 읽기 부하 집중              | 캐시 또는 read replica 검토                   | 동일 조회가 DB 병목으로 확인될 때                   |
| 알림·통계 등 후속 작업 증가 | 메시지 브로커와 outbox 검토                   | 요청 응답과 분리해야 할 비동기 작업이 생길 때       |
| 복잡한 영화 검색            | PostgreSQL full-text search 후 검색 엔진 검토 | 검색 요구와 데이터 규모가 PostgreSQL 범위를 넘을 때 |
| 팀·배포 주기 분리 필요      | 도메인 단위 마이크로서비스 분리               | 독립 배포가 운영 효율을 실제로 높일 때              |

현재 과제에서는 동시성 정합성이 가장 중요한 위험이라고 판단했습니다. E2E 테스트는 단일 인스턴스 경합뿐 아니라 동일 DB를 공유하는 두 NestJS 인스턴스 경합도 검증합니다.

## 테스트

전용 PostgreSQL 컨테이너를 실행한 뒤 테스트합니다.

```bash
npm run test:db:up
npm run test:e2e
npm run test:db:down
```

테스트는 빈 DB에 migration을 적용하고 인증, 조회, 예매, 멱등성 및 좌석 경합을 HTTP 수준에서 검증합니다. 예매 데이터가 저장된 뒤 마지막 좌석 상태 변경에서 의도적으로 DB 오류를 발생시키는 테스트도 포함해, 일부 데이터만 남지 않고 전체 트랜잭션이 rollback되는지 확인합니다.

## 추가 구현 내용

- JWT 인증과 Argon2 비밀번호 해시
- UUID 기반 예매 멱등성 및 재사용 충돌 처리
- PostgreSQL 행 잠금, DB 고유 제약과 전체 트랜잭션 rollback
- DB 시각 기반 상영 시작 판정과 예매 내역 조회 인덱스
- 여러 NestJS 인스턴스가 동일 DB를 사용하는 좌석 경합 테스트
- Swagger, Helmet, 요청 제한, Nest DI 기반 전역 request ID 구조화 로그
- 명시적 migration, Docker Compose 실행 환경과 GitHub Actions CI

## 고려 사항

- 비밀번호는 Argon2로 해시합니다.
- 모든 요청 DTO는 전역 ValidationPipe로 검증합니다.
- DB 스키마는 `synchronize`가 아닌 migration으로 관리합니다.
- DB connection pool과 연결·쿼리·유휴 트랜잭션·행 잠금 timeout을 명시적으로 제한합니다.
- 로그인과 회원가입에는 요청 제한을 적용합니다.
- JSON 로그에는 비밀번호와 JWT 같은 민감 정보를 기록하지 않습니다.
- 결제, 취소, 환불, 좌석 임시 점유는 과제의 핵심 범위를 벗어나 구현하지 않았습니다.
