# MongoDB Atlas SSL Handshake Errors

If you see **`ServerSelectionTimeoutError: SSL handshake failed ... TLSV1_ALERT_INTERNAL_ERROR`** when connecting to MongoDB Atlas:

## 1. Use Atlas “Standard” connection string (often fixes WSL2)

1. In [MongoDB Atlas](https://cloud.mongodb.com) → your cluster → **Connect** → **Drivers** (or “Connect your application”).
2. Choose **Python** and copy the **Standard connection string** (the one that lists hostnames like `ac-xxx-shard-00-00.ex7ddxn.mongodb.net:27017,...`), not the “SRV” one.
3. In your `.env`, set **`MONGODB_STANDARD_URI`** to that string (replace `<password>` with your DB password). Leave `MONGODB_URI` as is; the app uses `MONGODB_STANDARD_URI` when set.
4. Restart the app or run the migration again.

Example (replace with your actual hostnames and password):

```bash
MONGODB_STANDARD_URI=mongodb://USER:PASSWORD@ac-xxx-shard-00-00.ex7ddxn.mongodb.net:27017,ac-xxx-shard-00-01.ex7ddxn.mongodb.net:27017,ac-xxx-shard-00-02.ex7ddxn.mongodb.net:27017/?ssl=true&replicaSet=atlas-xxxxx-shard-0&authSource=admin
```

## 2. Atlas Network Access (IP whitelist)

- In [MongoDB Atlas](https://cloud.mongodb.com) → your project → **Network Access**.
- Add your current IP (or `0.0.0.0/0` for testing only).
- Wait 1–2 minutes and try again.

## 3. Run from a different environment

This error often occurs in **WSL2** or restricted networks (VPN, corporate firewall). Try:

- Running the app or migration from **Windows PowerShell** or **macOS/Linux** (non-WSL).
- Running from a **cloud VM** (e.g. same region as your Atlas cluster) with the VM’s IP allowlisted in Atlas.

## 4. Connection options already in the app

The codebase already uses:

- **certifi** CA bundle (`tlsCAFile=certifi.where()`) for Atlas TLS.
- **MONGODB_TLS_INSECURE=1** (optional, not for production) to relax certificate checks.

Set in `.env` if you need to try relaxed TLS (development only):

```bash
MONGODB_TLS_INSECURE=1
```

## 5. Verify connectivity

From a machine that can reach the internet:

```bash
# Resolve Atlas host (optional)
nslookup cluster0.ex7ddxn.mongodb.net

# Test TLS to Atlas (optional; may need openssl)
openssl s_client -connect ac-oe7jy1f-shard-00-00.ex7ddxn.mongodb.net:27017 -servername ac-oe7jy1f-shard-00-00.ex7ddxn.mongodb.net
```

## 6. Migrate without WSL

To push data from SQLite to MongoDB when WSL fails:

1. Copy `meetgeek.db` and `.env` to a machine where Atlas works (e.g. your laptop).
2. Run there:

   ```bash
   pip install -r requirements.txt
   python scripts/migrate_sqlite_to_mongodb.py --db-path meetgeek.db
   ```
