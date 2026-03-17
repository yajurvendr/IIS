# IIS — Windows Setup Guide

Complete step-by-step guide to run IIS on Windows 10/11 from a fresh clone.

---

## Step 1 — Install System Tools

### Install Python 3.11

1. Go to https://www.python.org/downloads/
2. Download **Python 3.11** (click "Download Python 3.11.x")
3. Run the installer
4. **IMPORTANT:** Check the box **"Add Python to PATH"** before clicking Install
5. Click "Install Now"

Verify (open **Command Prompt** or **PowerShell**):
```cmd
python --version
```
Should print: `Python 3.11.x`

### Install Node.js 20+

1. Go to https://nodejs.org/
2. Download the **LTS version** (20.x or higher)
3. Run the installer (accept all defaults)

Verify:
```cmd
node --version
npm --version
```

### Install PostgreSQL 15

1. Go to https://www.enterprisedb.com/downloads/postgres-postgresql-downloads
2. Download **PostgreSQL 15** for Windows (x86-64)
3. Run the installer
4. When asked for a password, set something simple like `postgres123` — **remember this password**
5. Leave port as **5432**
6. Complete the installation (you can skip Stack Builder at the end)

---

## Step 2 — Create the Database

Open **SQL Shell (psql)** from the Start Menu (installed with PostgreSQL):

1. Press Enter for all prompts (Server, Database, Port, Username) to use defaults
2. Enter your PostgreSQL password when asked
3. Run this command:

```sql
CREATE DATABASE iis;
```

Then type `\q` and press Enter to exit.

---

## Step 3 — API Setup

Open **Command Prompt** (press `Win + R`, type `cmd`, press Enter).

Navigate to your project folder (adjust path as needed):

```cmd
cd "C:\Users\YourName\Downloads\Inventory V2\api"
```

### Create a virtual environment

```cmd
python -m venv venv
venv\Scripts\activate
```

Your prompt should now show `(venv)` at the start.

### Install Python packages

```cmd
pip install --upgrade pip
pip install -r requirements.txt
```

### Configure environment variables

```cmd
copy .env.example .env
notepad .env
```

Edit these lines in Notepad:
```
DB_USER=postgres
DB_PASSWORD=postgres123       # The password you set during PostgreSQL install
JWT_SECRET=some_random_32+_chars_here_change_me_now
REFRESH_SECRET=different_random_32+_chars_here_change_me
```

> **Tip:** To generate a random secret, run:
> ```cmd
> python -c "import secrets; print(secrets.token_hex(32))"
> ```

Save and close Notepad.

### Run database migrations

```cmd
python db\migrate.py
```

You should see:
```
[migrate] Connecting to PostgreSQL database "iis"...
[migrate] Schema 'platform' ready in database 'iis'.
[migrate] Default super admin: admin@iis.in / Admin@123
```

### Start the API

```cmd
uvicorn main:app --host 0.0.0.0 --port 4000 --reload
```

Leave this window running. Open a browser and go to:
**http://localhost:4000/docs** — you should see the API documentation page.

---

## Step 4 — Tenant Portal

Open a **new Command Prompt window**:

```cmd
cd "C:\Users\YourName\Downloads\Inventory V2\web"
npm install
npm run dev
```

Open: **http://localhost:3000**

---

## Step 5 — Admin Portal

Open another **new Command Prompt window**:

```cmd
cd "C:\Users\YourName\Downloads\Inventory V2\admin"
npm install
npm run dev
```

Open: **http://localhost:3001**

---

## Step 6 — First Login

1. Go to **http://localhost:3001** (Admin Portal)
2. Log in with: `admin@iis.in` / `Admin@123`
3. Go to **Tenants → New Tenant** to create your first tenant
4. The tenant admin can log in at **http://localhost:3000**

---

## Stopping the Servers

In each Command Prompt window, press `Ctrl + C` to stop the server.

---

## Restarting After Reboot

Open **3 separate Command Prompt windows**:

**Window 1 — API:**
```cmd
cd "C:\Users\YourName\Downloads\Inventory V2\api"
venv\Scripts\activate
uvicorn main:app --host 0.0.0.0 --port 4000 --reload
```

**Window 2 — Tenant Portal:**
```cmd
cd "C:\Users\YourName\Downloads\Inventory V2\web"
npm run dev
```

**Window 3 — Admin Portal:**
```cmd
cd "C:\Users\YourName\Downloads\Inventory V2\admin"
npm run dev
```

> PostgreSQL starts automatically with Windows by default. If it doesn't, open **Services** (Win + R → `services.msc`) and start **postgresql-x64-15**.

---

## Troubleshooting

### "python is not recognized"
Python was not added to PATH during install. Fix:
1. Search for "Edit the system environment variables" in Start Menu
2. Click "Environment Variables"
3. Under System Variables, find "Path" and click Edit
4. Add: `C:\Users\YourName\AppData\Local\Programs\Python\Python311\`
5. Add: `C:\Users\YourName\AppData\Local\Programs\Python\Python311\Scripts\`
6. Click OK and reopen Command Prompt

### "connection to server failed" / can't connect to PostgreSQL
Open **Services** (Win + R → `services.msc`) and check that **postgresql-x64-15** is running.

### "password authentication failed"
Make sure `DB_PASSWORD` in `.env` matches the password you set during PostgreSQL installation.

### API starts but shows errors about missing tables
Run migrations again:
```cmd
cd "C:\Users\YourName\Downloads\Inventory V2\api"
venv\Scripts\activate
python db\migrate.py
```

### "EADDRINUSE" — port already in use
Find and kill the process:
```cmd
netstat -ano | findstr :4000
taskkill /PID <PID_NUMBER_FROM_ABOVE> /F
```

### npm install fails on Windows
Make sure you have the latest npm:
```cmd
npm install -g npm
```

If you see errors about node-gyp or build tools, install Windows Build Tools:
```cmd
npm install -g windows-build-tools
```
