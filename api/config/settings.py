import os
from dotenv import load_dotenv

load_dotenv()

DB_HOST          = os.getenv("DB_HOST", "127.0.0.1")
DB_PORT          = int(os.getenv("DB_PORT", 5432))
DB_USER          = os.getenv("DB_USER", "admin")
DB_PASSWORD      = os.getenv("DB_PASSWORD", "")
DB_NAME          = os.getenv("DB_NAME", "iis")
DB_SCHEMA_PUBLIC = os.getenv("DB_SCHEMA_PUBLIC", "platform")


JWT_SECRET      = os.getenv("JWT_SECRET", "change_me")
JWT_EXPIRES_IN  = int(os.getenv("JWT_EXPIRES_IN", 86400))    # seconds
REFRESH_SECRET  = os.getenv("REFRESH_SECRET", "change_me_refresh")
REFRESH_EXPIRES_IN = int(os.getenv("REFRESH_EXPIRES_IN", 604800))

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "./uploads")
PORT       = int(os.getenv("PORT", 4000))

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.mailtrap.io")
SMTP_PORT = int(os.getenv("SMTP_PORT", 2525))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")
MAIL_FROM = os.getenv("MAIL_FROM", "noreply@iis.local")

WEB_ORIGIN   = os.getenv("WEB_ORIGIN", "http://localhost:3000")
ADMIN_ORIGIN = os.getenv("ADMIN_ORIGIN", "http://localhost:3001")

# WhatsApp Business API gateway (WATI, Twilio, or custom)
WHATSAPP_API_URL   = os.getenv("WHATSAPP_API_URL", "")    # e.g. https://live-mt-server.wati.io/api/v1/sendSessionMessage
WHATSAPP_API_TOKEN = os.getenv("WHATSAPP_API_TOKEN", "")
