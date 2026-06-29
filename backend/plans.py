"""
plans.py — Mindpad AI subscription plans API.
Handles plan definitions, coupon management (MongoDB-backed), Razorpay order
creation, payment signature verification, and MongoDB plan persistence.
"""

import os
import hmac
import hashlib
import smtplib
import threading
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import datetime, timezone, timedelta
from typing import Optional, List

import razorpay
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

router = APIRouter(prefix="/plans", tags=["plans"])

# ── Razorpay client ─────────────────────────────────────────────────────────────
RAZORPAY_KEY_ID     = os.environ.get("RAZORPAY_KEY_ID", "")
RAZORPAY_KEY_SECRET = os.environ.get("RAZORPAY_KEY_SECRET", "")

rzp_client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))

# ── Email config ────────────────────────────────────────────────────────────────
MAIL_USER = os.environ.get("MAIL_USER", "")
MAIL_PASS = os.environ.get("MAIL_PASS", "")

# ── Storage caps per plan (MB) ──────────────────────────────────────────────────
PLAN_STORAGE_MB = {"free": 50, "plus": 200, "pro": 500}

# ── Admin ───────────────────────────────────────────────────────────────────────
ADMIN_EMAIL   = "priyanshumadhup@gmail.com"
ADMIN_USER_ID = "user_3BS0ZN5IlirMSNEj11PQ1iiBcpi"  # Clerk user_id

# ── MongoDB ─────────────────────────────────────────────────────────────────────
_mongo_uri = os.environ.get("MONGODB_URI", "")
_mongo     = AsyncIOMotorClient(_mongo_uri)
_db        = _mongo["mindpad_ai"]
users_meta = _db["users_meta"]
coupons_col = _db["coupons"]  # admin-managed coupon codes

# ── Plan definitions ────────────────────────────────────────────────────────────
PLANS = {
    "free": {
        "id": "free",
        "name": "Free",
        "price_inr": 0,
        "storage_mb": 50,
        "ai_model": "standard",
        "accuracy_multiplier": 1,
        "deep_research_daily": 5,
        "image_gen_daily": 5,
        "ai_studio": "basic",
        "languages": 10,
    },
    "plus": {
        "id": "plus",
        "name": "Plus",
        "price_inr": 49,
        "storage_mb": 200,
        "ai_model": "better",
        "accuracy_multiplier": 2,
        "deep_research_daily": -1,   # unlimited
        "image_gen_daily": 50,
        "ai_studio": "expanded",
        "languages": 12,
    },
    "pro": {
        "id": "pro",
        "name": "Pro",
        "price_inr": 99,
        "storage_mb": 500,
        "ai_model": "best",
        "accuracy_multiplier": 3,
        "deep_research_daily": -1,   # unlimited
        "image_gen_daily": -1,       # unlimited
        "ai_studio": "full",
        "languages": 12,
    },
}

# NOTE: Coupons are now stored in MongoDB `coupons` collection.
# Use the admin panel at /plans/coupons to manage them.

# ── JWT auth helper (reuse from chat.py pattern) ────────────────────────────────
import httpx
from jose import jwt as jose_jwt, JWTError

CLERK_FRONTEND_API = os.environ.get("CLERK_FRONTEND_API", "").rstrip("/")
_jwks_cache: Optional[dict] = None

async def _get_jwks() -> dict:
    global _jwks_cache
    if _jwks_cache is None:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{CLERK_FRONTEND_API}/.well-known/jwks.json")
            resp.raise_for_status()
            _jwks_cache = resp.json()
    return _jwks_cache

async def _get_current_user(authorization: Optional[str]) -> str:
    """Decode Clerk JWT and return user_id."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    token = authorization.split(" ", 1)[1]
    try:
        jwks = await _get_jwks()
        payload = jose_jwt.decode(token, jwks, algorithms=["RS256"], options={"verify_aud": False})
        return payload["sub"]
    except JWTError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")

# ── Schemas ─────────────────────────────────────────────────────────────────────

class CouponRequest(BaseModel):
    code: str
    plan_id: str  # "plus" | "pro"

class CouponResponse(BaseModel):
    valid: bool
    discount_pct: int = 0
    message: str = ""

class CreateCouponRequest(BaseModel):
    code: str
    discount_pct: int            # 1–100
    applies_to: List[str] = ["all"]  # ["all"] | ["plus"] | ["pro"] | ["plus", "pro"]
    max_uses: Optional[int] = None   # None = unlimited

class CreateOrderRequest(BaseModel):
    plan_id: str
    coupon_code: Optional[str] = None

class VerifyPaymentRequest(BaseModel):
    razorpay_payment_id: str
    razorpay_order_id: str
    razorpay_signature: str
    plan_id: str
    coupon_code: Optional[str] = None


# ── Helper: compute discount (async — reads from MongoDB, increments use_count) ──
async def _apply_coupon(plan_id: str, coupon_code: Optional[str]) -> int:
    """Return discount_pct (0 if no valid coupon). Increments use_count on redemption."""
    if not coupon_code:
        return 0
    code = coupon_code.strip().upper()
    coupon = await coupons_col.find_one({"code": code, "active": True})
    if not coupon:
        return 0
    # Check max_uses cap
    max_uses = coupon.get("max_uses")
    if max_uses is not None and coupon.get("use_count", 0) >= max_uses:
        return 0
    applies_to = coupon.get("applies_to", ["all"])
    if "all" in applies_to or plan_id in applies_to:
        # Increment usage counter atomically
        await coupons_col.update_one({"code": code}, {"$inc": {"use_count": 1}})
        return coupon["discount_pct"]
    return 0


async def _is_admin(authorization: Optional[str]) -> str:
    """Decode JWT, verify admin identity, return user_id. Raises 403 if not admin."""
    user_id = await _get_current_user(authorization)
    if user_id == ADMIN_USER_ID:
        return user_id
    # Fallback: look up email from users_meta
    meta = await users_meta.find_one({"user_id": user_id}, {"email": 1})
    if meta and meta.get("email") == ADMIN_EMAIL:
        return user_id
    raise HTTPException(status_code=403, detail="Admin only")


# ── Routes ──────────────────────────────────────────────────────────────────────

@router.get("")
async def list_plans():
    """Return all available subscription plans."""
    return {"plans": list(PLANS.values())}


@router.get("/my-plan")
async def get_my_plan(authorization: Optional[str] = Header(None)):
    """Return the authenticated user's current active plan."""
    user_id = await _get_current_user(authorization)
    meta = await users_meta.find_one({"user_id": user_id}, {"plan": 1, "plan_expires_at": 1})

    if not meta:
        return {"plan": "free", "plan_expires_at": None}

    plan = meta.get("plan", "free")
    expires_at = meta.get("plan_expires_at")

    # Auto-downgrade if plan has expired
    # Normalize to UTC-aware to handle both naive (manually set via Atlas)
    # and aware (set by verify_payment) datetimes.
    if plan != "free" and expires_at:
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < datetime.now(timezone.utc):
            await users_meta.update_one(
                {"user_id": user_id},
                {"$set": {"plan": "free", "plan_expires_at": None}},
            )
            return {"plan": "free", "plan_expires_at": None}

    return {
        "plan": plan,
        "plan_expires_at": expires_at.isoformat() if expires_at else None,
    }


@router.post("/validate-coupon", response_model=CouponResponse)
async def validate_coupon(body: CouponRequest):
    """Validate a coupon code for a given plan. Does NOT increment use_count."""
    code   = body.code.strip().upper()
    coupon = await coupons_col.find_one({"code": code, "active": True})

    if not coupon:
        return CouponResponse(valid=False, message="Invalid or expired coupon code.")

    # Check max_uses cap
    max_uses = coupon.get("max_uses")
    if max_uses is not None and coupon.get("use_count", 0) >= max_uses:
        return CouponResponse(valid=False, message="This coupon has reached its usage limit.")

    applies_to = coupon.get("applies_to", ["all"])
    if "all" not in applies_to and body.plan_id not in applies_to:
        return CouponResponse(
            valid=False,
            message=f"This coupon is not valid for the {body.plan_id.title()} plan.",
        )

    return CouponResponse(
        valid=True,
        discount_pct=coupon["discount_pct"],
        message=f"{coupon['discount_pct']}% discount applied!",
    )


# ── Admin: Coupon CRUD ──────────────────────────────────────────────────────────

@router.get("/coupons")
async def list_coupons(authorization: Optional[str] = Header(None)):
    """List all coupons — admin only."""
    await _is_admin(authorization)
    cursor = coupons_col.find({}, {"_id": 0}).sort("created_at", -1)
    docs = await cursor.to_list(length=500)
    return {"coupons": docs}


@router.post("/coupons")
async def create_coupon(
    body: CreateCouponRequest,
    authorization: Optional[str] = Header(None),
):
    """Create a new coupon code — admin only."""
    await _is_admin(authorization)

    code = body.code.strip().upper()
    if not code:
        raise HTTPException(status_code=400, detail="Coupon code cannot be empty.")
    if not (1 <= body.discount_pct <= 100):
        raise HTTPException(status_code=400, detail="Discount must be between 1 and 100.")

    # Prevent duplicate codes
    existing = await coupons_col.find_one({"code": code})
    if existing:
        raise HTTPException(status_code=409, detail=f"Coupon '{code}' already exists.")

    doc = {
        "code":         code,
        "discount_pct": body.discount_pct,
        "applies_to":   body.applies_to if body.applies_to else ["all"],
        "active":       True,
        "use_count":    0,
        "max_uses":     body.max_uses,
        "created_at":   datetime.now(timezone.utc),
    }
    await coupons_col.insert_one(doc)
    print(f"[Coupons] Created '{code}' ({body.discount_pct}% off, applies_to={body.applies_to})")
    return {"status": "created", "code": code}


@router.delete("/coupons/{code}")
async def delete_coupon(
    code: str,
    authorization: Optional[str] = Header(None),
):
    """Delete a coupon by code — admin only."""
    await _is_admin(authorization)
    code = code.strip().upper()
    result = await coupons_col.delete_one({"code": code})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail=f"Coupon '{code}' not found.")
    print(f"[Coupons] Deleted '{code}'")
    return {"status": "deleted", "code": code}


@router.post("/create-order")
async def create_order(
    body: CreateOrderRequest,
    authorization: Optional[str] = Header(None),
):
    """
    Create a Razorpay order for the given plan.
    Returns { order_id, amount, currency, key_id } to the frontend.
    Amount is in paise (₹1 = 100 paise).
    """
    user_id = await _get_current_user(authorization)

    plan = PLANS.get(body.plan_id)
    if not plan or plan["price_inr"] == 0:
        raise HTTPException(status_code=400, detail="Invalid or free plan — no payment needed.")

    discount_pct  = await _apply_coupon(body.plan_id, body.coupon_code)  # async — reads DB + increments
    base_price    = plan["price_inr"]
    discount_amt  = round(base_price * discount_pct / 100)
    final_price   = base_price - discount_amt

    # Amount in paise
    amount_paise = final_price * 100

    try:
        import asyncio
        order = await asyncio.to_thread(
            rzp_client.order.create,
            {
                "amount":   amount_paise,
                "currency": "INR",
                "receipt":  f"{user_id[:12]}_{body.plan_id}",
                "notes": {
                    "user_id":      user_id,
                    "plan_id":      body.plan_id,
                    "discount_pct": str(discount_pct),
                },
            },
        )
    except Exception as e:
        print(f"[Razorpay] Order creation failed: {e}")
        raise HTTPException(status_code=502, detail=f"Razorpay order creation failed: {e}")

    return {
        "order_id":  order["id"],
        "amount":    amount_paise,
        "currency":  "INR",
        "key_id":    RAZORPAY_KEY_ID,
        "plan_name": plan["name"],
        "final_price_inr": final_price,
    }


# ── Plan upgrade email ─────────────────────────────────────────────────────────

def _build_upgrade_email_html(plan_id: str, plan_name: str, expires_at: datetime) -> str:
    """Build a branded Mindpad AI plan upgrade confirmation email."""
    expire_str = expires_at.strftime("%B %d, %Y")
    color     = "#0D1B2A" if plan_id == "pro" else "#92400E"
    badge_bg  = "#0D1B2A" if plan_id == "pro" else "#FEF3C7"
    badge_fg  = "#FFFFFF" if plan_id == "pro" else "#92400E"
    storage   = PLAN_STORAGE_MB.get(plan_id, 50)

    return f"""\
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Welcome to {plan_name} — Mindpad AI</title>
</head>
<body style="margin:0;padding:0;background:#f0f2f4;font-family:'Inter','Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f4;padding:48px 16px;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

      <!-- Header -->
      <tr>
        <td style="background:#0D1B2A;border-radius:12px 12px 0 0;padding:48px 48px 40px;text-align:center;">
          <img src="https://raw.githubusercontent.com/Priyanshu-Madhup/mindpad-ai/master/frontend/src/mindpad_ai_logo.png"
               alt="Mindpad AI" width="52" height="52"
               style="display:block;margin:0 auto 20px;border-radius:10px;"/>
          <span style="display:inline-block;padding:4px 14px;border-radius:999px;background:{badge_bg};color:{badge_fg};font-size:11px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:14px;">{plan_name}</span>
          <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:800;letter-spacing:-0.5px;line-height:1.2;">You're now on {plan_name}!</h1>
          <p style="margin:12px 0 0;color:#94a3b8;font-size:14px;line-height:1.6;">Your Mindpad AI subscription is active.</p>
        </td>
      </tr>

      <!-- Body -->
      <tr>
        <td style="background:#ffffff;padding:44px 48px 36px;">
          <p style="margin:0 0 28px;font-size:15px;color:#475569;line-height:1.75;">
            Thank you for upgrading to <strong>{plan_name}</strong>. Your plan is active until
            <strong>{expire_str}</strong> and renews automatically every 30 days.
          </p>

          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
            <tr><td style="border-top:1px solid #e2e8f0;"></td></tr>
          </table>

          <p style="margin:0 0 20px;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#94a3b8;">What you've unlocked</p>

          <!-- Storage -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
            <tr>
              <td width="36" valign="top" style="padding-top:2px;">
                <span style="display:inline-block;font-size:10px;font-weight:800;color:#0D1B2A;letter-spacing:0.05em;font-family:'Courier New',monospace;">01</span>
              </td>
              <td valign="top">
                <p style="margin:0 0 3px;font-size:14px;font-weight:700;color:#0D1B2A;">{storage} MB Storage</p>
                <p style="margin:0;font-size:13px;color:#64748b;line-height:1.65;">Upload larger PDFs and keep more knowledge in your workspace.</p>
              </td>
            </tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;"><tr><td style="border-top:1px solid #f1f5f9;"></td></tr></table>

          <!-- AI Model -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
            <tr>
              <td width="36" valign="top" style="padding-top:2px;">
                <span style="display:inline-block;font-size:10px;font-weight:800;color:#0D1B2A;letter-spacing:0.05em;font-family:'Courier New',monospace;">02</span>
              </td>
              <td valign="top">
                <p style="margin:0 0 3px;font-size:14px;font-weight:700;color:#0D1B2A;">{'Best' if plan_id == 'pro' else 'Better'} AI Model ({'3×' if plan_id == 'pro' else '2×'} accuracy)</p>
                <p style="margin:0;font-size:13px;color:#64748b;line-height:1.65;">More precise, detailed, and research-grade responses from Midy AI.</p>
              </td>
            </tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;"><tr><td style="border-top:1px solid #f1f5f9;"></td></tr></table>

          <!-- Deep Research -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
            <tr>
              <td width="36" valign="top" style="padding-top:2px;">
                <span style="display:inline-block;font-size:10px;font-weight:800;color:#0D1B2A;letter-spacing:0.05em;font-family:'Courier New',monospace;">03</span>
              </td>
              <td valign="top">
                <p style="margin:0 0 3px;font-size:14px;font-weight:700;color:#0D1B2A;">Unlimited Deep Research</p>
                <p style="margin:0;font-size:13px;color:#64748b;line-height:1.65;">No daily cap on Serper + Firecrawl-powered research sessions.</p>
              </td>
            </tr>
          </table>

          <!-- CTA -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td align="center">
                <a href="https://mindpad-ai.vercel.app" target="_blank"
                   style="display:inline-block;background:#0D1B2A;color:#ffffff;text-decoration:none;font-size:13px;font-weight:700;letter-spacing:0.04em;padding:13px 32px;border-radius:8px;">
                  Open Mindpad AI &rarr;
                </a>
              </td>
            </tr>
          </table>

          <p style="margin:32px 0 0;font-size:13px;color:#94a3b8;line-height:1.7;border-top:1px solid #f1f5f9;padding-top:20px;">
            Reply to this email if you have any questions. We read every message personally.
          </p>
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="background:#f8fafc;border-radius:0 0 12px 12px;padding:20px 48px;border-top:1px solid #e2e8f0;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="font-size:11px;color:#94a3b8;">&copy; 2025 Mindpad AI</td>
              <td align="right" style="font-size:11px;color:#94a3b8;">mindpad.ai@gmail.com</td>
            </tr>
          </table>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>"""


def _send_upgrade_email_sync(to_email: str, plan_id: str, plan_name: str, expires_at: datetime):
    """Send plan upgrade confirmation email via Gmail SMTP. Runs in background thread."""
    if not MAIL_USER or not MAIL_PASS:
        print("[Upgrade email] MAIL_USER or MAIL_PASS not set — skipping.")
        return
    print(f"[Upgrade email] Sending {plan_name} confirmation to {to_email}…")
    try:
        html = _build_upgrade_email_html(plan_id, plan_name, expires_at)
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"Welcome to {plan_name} — Mindpad AI"
        msg["From"]    = f"Mindpad AI <{MAIL_USER}>"
        msg["To"]      = to_email
        msg.attach(MIMEText(html, "html"))
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=15) as server:
            server.login(MAIL_USER, MAIL_PASS)
            server.sendmail(MAIL_USER, to_email, msg.as_string())
        print(f"[Upgrade email] ✅ Sent successfully to {to_email}")
    except Exception as e:
        print(f"[Upgrade email] ❌ Failed: {e}")


@router.post("/verify-payment")
async def verify_payment(
    body: VerifyPaymentRequest,
    authorization: Optional[str] = Header(None),
):
    """
    Verify Razorpay payment signature (HMAC-SHA256).
    On success, store plan in MongoDB users_meta and return the active plan.
    """
    user_id = await _get_current_user(authorization)

    plan = PLANS.get(body.plan_id)
    if not plan:
        raise HTTPException(status_code=400, detail=f"Invalid plan: {body.plan_id}")

    # ── Signature verification ────────────────────────────────────────────────
    # Razorpay signature = HMAC-SHA256(order_id + "|" + payment_id, key_secret)
    expected_signature = hmac.new(
        RAZORPAY_KEY_SECRET.encode("utf-8"),
        f"{body.razorpay_order_id}|{body.razorpay_payment_id}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(expected_signature, body.razorpay_signature):
        raise HTTPException(status_code=400, detail="Payment signature verification failed.")

    # ── Store plan + storage cap in MongoDB ───────────────────────────────────
    expires_at      = datetime.now(timezone.utc) + timedelta(days=30)
    storage_limit   = PLAN_STORAGE_MB.get(body.plan_id, 50)

    await users_meta.update_one(
        {"user_id": user_id},
        {
            "$set": {
                "plan":              body.plan_id,
                "plan_expires_at":   expires_at,
                "plan_payment_id":   body.razorpay_payment_id,
                "plan_updated_at":   datetime.now(timezone.utc),
                "storage_limit_mb": storage_limit,   # enforced by /upload-pdf
                # Mark user as welcomed so the generic free welcome email in chat.py
                # is never sent on top of this plan-specific upgrade email.
                # $setOnInsert would be ideal but we use $set to cover existing docs
                # that may not have the flag yet (e.g., user upgraded immediately
                # after sign-up before ever opening a notebook).
                "welcomed":          True,
                "welcomed_at":       datetime.now(timezone.utc),
            },
        },
        upsert=True,
    )

    print(
        f"[Plans] ✅ Payment verified — user {user_id[:12]}… upgraded to '{body.plan_id}' "
        f"({storage_limit} MB) until {expires_at.strftime('%Y-%m-%d')} "
        f"(payment: {body.razorpay_payment_id})"
    )

    # ── Send upgrade confirmation email in background ─────────────────────────
    user_email = ""
    try:
        meta_doc = await users_meta.find_one({"user_id": user_id}, {"email": 1})
        if meta_doc:
            user_email = meta_doc.get("email", "")
        # Fallback: fetch from Clerk API
        if not user_email:
            import httpx as _httpx
            clerk_secret = os.environ.get("CLERK_SECRET_KEY", "")
            if clerk_secret:
                async with _httpx.AsyncClient(timeout=6.0) as client:
                    resp = await client.get(
                        f"https://api.clerk.com/v1/users/{user_id}",
                        headers={"Authorization": f"Bearer {clerk_secret}"},
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        primary_id = data.get("primary_email_address_id", "")
                        for e in data.get("email_addresses", []):
                            if e.get("id") == primary_id:
                                user_email = e.get("email_address", "")
                                break
                        if not user_email and data.get("email_addresses"):
                            user_email = data["email_addresses"][0].get("email_address", "")
    except Exception as _email_err:
        print(f"[Plans] Warning: could not fetch user email: {_email_err}")

    if user_email:
        threading.Thread(
            target=_send_upgrade_email_sync,
            args=(user_email, body.plan_id, plan["name"], expires_at),
            daemon=True,
        ).start()
    else:
        print(f"[Plans] Warning: no email found for user {user_id[:12]}… — skipping upgrade email")

    return {
        "status":           "success",
        "plan":             body.plan_id,
        "plan_expires_at":  expires_at.isoformat(),
        "payment_id":       body.razorpay_payment_id,
        "storage_limit_mb": storage_limit,
    }
