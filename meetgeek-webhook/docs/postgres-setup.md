# PostgreSQL setup (one-time)

Run these once to create the database and user. Use your own password in `.env` only (do not commit it).

## 1. Create user and database

From your machine (sudo will prompt for your OS password):

```bash
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE USER meetgeek WITH PASSWORD 'YOUR_PASSWORD';" -c "CREATE DATABASE meetgeek_db OWNER meetgeek;"
```

If the user or database already exists, you can skip or drop and recreate:

```bash
# Optional: drop and recreate (destroys data)
# sudo -u postgres psql -c "DROP DATABASE IF EXISTS meetgeek_db;" -c "DROP USER IF EXISTS meetgeek;"
```

## 2. Set DATABASE_URL in .env

In `.env` set:

```
DATABASE_URL=postgresql://meetgeek:YOUR_PASSWORD@localhost:5432/meetgeek_db
```

Replace `YOUR_PASSWORD` with the same password you used in step 1.

## 3. Run migrations

From the project root with your venv activated:

```bash
alembic upgrade head
```

This creates tables: `meetings`, `raw_webhooks`, `raw_meetgeek_api`.

## 4. Start the app

```bash
uvicorn main:app --reload --port 8000
```

The app uses `postgresql+asyncpg` automatically when `DATABASE_URL` starts with `postgresql://`.

## New migrations later

After changing `models.py`:

```bash
alembic revision --autogenerate -m "description"
alembic upgrade head
```
