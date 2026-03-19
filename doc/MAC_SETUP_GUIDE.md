# IIS — Mac Setup Guide

Complete step-by-step guide to run IIS on macOS from a fresh clone.

---

## Step 1 — Install System Tools

Open **Terminal** (press `Cmd + Space`, type "Terminal", press Enter).

### Install Homebrew (Mac package manager)

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

After installation, run the two `export` commands Homebrew shows you (they add brew to your PATH).

### Install Python 3.11

```bash
brew install python@3.11
```

Verify:
```bash
python3.11 --version
# Should print: Python 3.11.x
```

### Install Node.js 20+

```bash
brew install node@20
brew link node@20 --force
```

Verify:
```bash
node --version   # Should print: v20.x.x
npm --version
```

### Install PostgreSQL 15

```bash
brew install postgresql@15
brew services start postgresql@15
```

Verify PostgreSQL is running:
```bash
brew services list | grep postgresql
# Should show: postgresql@15  started
```

---

## Step 2 — Create the Database

```bash
/opt/homebrew/opt/postgresql@15/bin/createdb iis
```

> If you get "command not found", try: `createdb iis`

Set a password for the postgres user (optional but recommended):
```bash
psql iis -c "ALTER USER $(whoami) WITH PASSWORD 'yourpassword';"
```

---

## Step 3 — API Setup

Navigate to your project folder (replace the path with wherever you cloned the repo):

```bash
cd ~/Downloads/Personal/"Inventory V2"/api
```

### Create a virtual environment

```bash
python3.11 -m venv venv
source venv/bin/activate
```

Your terminal prompt should now show `(venv)` at the start.

---

> ### ⚠️ IMPORTANT — Virtual Environment Activation Required Every Time
>
> **You must run `source venv/bin/activate` every time you open a new terminal window before starting the API.**
>
> - If you see `(venv)` at the start of your prompt → you are activated. Good.
> - If you do NOT see `(venv)` → the API will fail to start. Run the activate command first.
>
> **The command to activate (run this every time):**
> ```bash
> source venv/bin/activate
> ```

---

### Install Python packages

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

### Configure environment variables

```bash
cp .env.example .env
open -e .env        # Opens in TextEdit
```

Edit these lines:
```
DB_USER=your_mac_username    # Run: whoami  to find your username
DB_PASSWORD=yourpassword     # The password you set above (or blank if none)
JWT_SECRET=some_random_32+_chars_here_change_me_now
REFRESH_SECRET=different_random_32+_chars_here_change_me
```

> **Tip:** To generate a random secret, run: `python3 -c "import secrets; print(secrets.token_hex(32))"`

### Run database migrations

```bash
python db/migrate.py
```

You should see:
```
[migrate] Connecting to PostgreSQL database "iis"...
[migrate] Schema 'platform' ready in database 'iis'.
[migrate] Default super admin: admin@iis.in / Admin@123
```

### Start the API

```bash
uvicorn main:app --host 0.0.0.0 --port 4000 --reload
```

Leave this terminal running. Open a browser and go to:
**http://localhost:4000/docs** — you should see the API documentation page.

---

## Step 4 — Web Portal

Open a **new Terminal tab** (`Cmd + T`):

```bash
cd ~/Downloads/Personal/"Inventory V2"/web
npm install
npm run dev
```

Open: **http://localhost:3000**

---

## Step 5 — First Login

1. Go to **http://localhost:3000/login**
2. Log in with: `admin@iis.in` / `Admin@123`
3. You will be redirected to the super admin dashboard at `/admin/dashboard`
4. Go to **Tenants → New Tenant** to create your first tenant
5. The tenant admin can also log in at **http://localhost:3000/login** and will be redirected to the tenant portal

> There is only one login page and one web application — both super admins and tenant users log in at the same URL.

---

## Stopping the Servers

In each terminal, press `Ctrl + C` to stop the server.

To stop PostgreSQL:
```bash
brew services stop postgresql@15
```

---

## Restarting After Reboot

```bash
# Start PostgreSQL
brew services start postgresql@15

# Start API (Terminal 1)
cd ~/Downloads/Personal/"Inventory V2"/api
source venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 4000 --reload

# Start Web Portal (Terminal 2)
cd ~/Downloads/Personal/"Inventory V2"/web && npm run dev
```

Open: **http://localhost:3000**

---

## Troubleshooting

### "command not found: createdb"
Add PostgreSQL to your PATH:
```bash
echo 'export PATH="/opt/homebrew/opt/postgresql@15/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### "connection refused" on port 5432
PostgreSQL is not running. Start it:
```bash
brew services start postgresql@15
```

### "password authentication failed"
In `.env`, set `DB_USER` to your Mac username (`whoami`) and `DB_PASSWORD` to blank or the password you set.

### API starts but shows errors about missing tables
Run the migrations again:
```bash
cd ~/Downloads/Personal/"Inventory V2"/api
source venv/bin/activate
python db/migrate.py
```

### "ModuleNotFoundError" or "command not found: uvicorn"
You forgot to activate the virtual environment. Run:
```bash
source venv/bin/activate
```
Then try again.

### Port already in use
Find and kill the process:
```bash
lsof -ti:4000 | xargs kill -9   # For port 4000
lsof -ti:3000 | xargs kill -9   # For port 3000
```
