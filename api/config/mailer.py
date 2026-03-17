import aiosmtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from config import settings


async def send_mail(to: str, subject: str, html: str):
    msg = MIMEMultipart("alternative")
    msg["From"]    = settings.MAIL_FROM
    msg["To"]      = to
    msg["Subject"] = subject
    msg.attach(MIMEText(html, "html"))

    try:
        await aiosmtplib.send(
            msg,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USER or None,
            password=settings.SMTP_PASS or None,
        )
    except Exception as e:
        print(f"[Mailer] Failed to send to {to}: {e}")
