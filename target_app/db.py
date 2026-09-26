import sqlite3
import os

DB_PATH = "target_app.db"
SEED_PATH = os.path.join(os.path.dirname(__file__), "seed.sql")


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Drop and recreate the schema, then load seed data."""
    conn = get_connection()
    cursor = conn.cursor()

    # Wipe existing tables so /reset always gives a clean slate
    cursor.execute("DROP TABLE IF EXISTS notes")
    cursor.execute("DROP TABLE IF EXISTS users")
    conn.commit()

    with open(SEED_PATH, "r") as f:
        sql = f.read()

    conn.executescript(sql)
    conn.commit()
    conn.close()
