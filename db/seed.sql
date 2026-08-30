INSERT INTO movies (
  title,
  description,
  duration_minutes
)
SELECT
  '인터스텔라',
  '인류의 새로운 거주지를 찾기 위해 우주로 떠나는 탐험 이야기',
  169
WHERE NOT EXISTS (
  SELECT 1 FROM movies WHERE title = '인터스텔라'
);

INSERT INTO movies (
  title,
  description,
  duration_minutes
)
SELECT
  '기생충',
  '서로 다른 두 가족의 만남으로 시작되는 이야기',
  132
WHERE NOT EXISTS (
  SELECT 1 FROM movies WHERE title = '기생충'
);

INSERT INTO movies (
  title,
  description,
  duration_minutes
)
SELECT
  '인셉션',
  '꿈속에 들어가 생각을 심는 사람들의 이야기',
  148
WHERE NOT EXISTS (
  SELECT 1 FROM movies WHERE title = '인셉션'
);

INSERT INTO seats (row_label, seat_number)
SELECT v.row_label, v.seat_number
FROM (
  VALUES
    ('A', 1),
    ('A', 2),
    ('A', 3),
    ('A', 4),
    ('A', 5),
    ('B', 1),
    ('B', 2),
    ('B', 3),
    ('B', 4),
    ('B', 5),
    ('C', 1),
    ('C', 2),
    ('C', 3),
    ('C', 4),
    ('C', 5)
) AS v(row_label, seat_number)
WHERE NOT EXISTS (
  SELECT 1
  FROM seats s
  WHERE s.row_label = v.row_label
    AND s.seat_number = v.seat_number
);

INSERT INTO shows (
  movie_id,
  auditorium,
  starts_at
)
SELECT
  m.id,
  'A관',
  CURRENT_TIMESTAMP + INTERVAL '7 days'
FROM movies m
WHERE m.title = '인터스텔라'
  AND NOT EXISTS (
    SELECT 1
    FROM shows s
    WHERE s.movie_id = m.id
      AND s.auditorium = 'A관'
      AND s.starts_at > CURRENT_TIMESTAMP
  );

INSERT INTO shows (
  movie_id,
  auditorium,
  starts_at
)
SELECT
  m.id,
  'B관',
  CURRENT_TIMESTAMP + INTERVAL '8 days'
FROM movies m
WHERE m.title = '기생충'
  AND NOT EXISTS (
    SELECT 1
    FROM shows s
    WHERE s.movie_id = m.id
      AND s.auditorium = 'B관'
      AND s.starts_at > CURRENT_TIMESTAMP
  );

INSERT INTO show_seats (show_id, seat_id)
SELECT sh.id, s.id
FROM shows sh
CROSS JOIN seats s
WHERE NOT EXISTS (
  SELECT 1
  FROM show_seats ss
  WHERE ss.show_id = sh.id
    AND ss.seat_id = s.id
);
