CREATE TABLE users (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    password TEXT NOT NULL,
    email    TEXT NOT NULL
);

INSERT INTO users (username, password, email) VALUES
    ('alice', 'alice123', 'alice@example.com'),
    ('bob',   'bob123',   'bob@example.com');

CREATE TABLE notes (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL
);

INSERT INTO notes (user_id, content) VALUES
    (1, 'Alice note 1: secret project plans'),
    (1, 'Alice note 2: personal diary entry'),
    (2, 'Bob note 1: shopping list'),
    (2, 'Bob note 2: meeting notes');
